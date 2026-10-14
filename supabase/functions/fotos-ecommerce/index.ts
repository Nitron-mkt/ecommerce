// fotos-ecommerce v5: fotos novas de https://produto.nitron.com.br/ecommerce/{ref com _}-NN.png (fallback {ref com .}-NN.png)
// GET  ?secret=…&acao=scan&offset=0&limit=80   → descobre (HEAD 200 = existe, 302 = não) e grava em produto_foto_ecom
// GET  ?secret=…&acao=status                    → progresso
// POST {secret,acao:'comando',confirmar:true}   → atualiza produto_foto (link_principal/galeria/n_fotos) do Comando Central (backup em produto_foto_bkp_20261014)
// POST {secret,acao:'anymarket',senha,confirmar:true,limit,product_id?} → ACRESCENTA as fotos aos produtos do Anymarket (POST /products/{id}/images; mantém as atuais),
//      com variação de cor por SKU; guarda as imagens anteriores em anymarket_foto_envio (dá p/ desfazer)
import { Client } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';
const DB=Deno.env.get('SUPABASE_DB_URL')!;
const BASE='https://produto.nitron.com.br/ecommerce/';
const MAXI=15;
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,apikey','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json'};
const J=(o:any,s=200)=>new Response(JSON.stringify(o,(_k,v)=>typeof v==='bigint'?Number(v):v),{status:s,headers:CORS});
async function sha(s:string){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function existe(url:string){ for(let t=0;t<2;t++){ try{ const r=await fetch(url,{method:'HEAD',redirect:'manual'}); if(r.status===200){ const ct=r.headers.get('content-type')||''; return ct.startsWith('image/')?Number(r.headers.get('content-length')||0)||1:0; } if(r.status===302||r.status===301||r.status===404) return 0; }catch(_){} await new Promise(r=>setTimeout(r,300)); } return 0; }
async function pool<T>(items:T[],n:number,fn:(x:T)=>Promise<void>){ let i=0; await Promise.all(Array.from({length:n},async()=>{ while(i<items.length){ const k=i++; await fn(items[k]); } })); }
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:CORS});
  const u=new URL(req.url); const c=new Client(DB); await c.connect();
  try{
    const body=req.method==='POST'?await req.json().catch(()=>({})):{};
    const p=(k:string)=>body[k]??u.searchParams.get(k);
    const app=(await c.queryObject`SELECT state_secret FROM ml_oauth_app WHERE id=1`).rows[0] as any;
    if(!app||p('secret')!==app.state_secret) return J({error:'secret'},403);
    const acao=p('acao')||'status';
    const REFS=`SELECT DISTINCT referencia FROM (SELECT referencia FROM anymarket_sku UNION SELECT referencia FROM precificacao_produto UNION SELECT referencia FROM produto_foto) x WHERE referencia ~ '^[0-9A-Z]+\\.[0-9A-Z]+\\.[0-9A-Z]+$' ORDER BY referencia`;

    if(acao==='status'){
      const r=(await c.queryObject(`SELECT (SELECT count(*) FROM (${REFS}) z)::int universo, (SELECT count(*) FROM foto_ecom_scan)::int varridas, (SELECT count(*) FROM foto_ecom_scan WHERE n>0)::int com_foto, (SELECT count(*) FROM produto_foto_ecom)::int fotos, (SELECT count(*) FROM anymarket_foto_envio WHERE resultado='ok')::int any_ok, (SELECT count(*) FROM anymarket_foto_envio WHERE resultado<>'ok')::int any_erro`)).rows[0];
      return J(r);
    }

    if(acao==='scan'){
      const off=Number(p('offset')||0), lim=Math.min(150,Number(p('limit')||80));
      const refs=(await c.queryObject(`${REFS} OFFSET ${off} LIMIT ${lim}`)).rows.map((r:any)=>r.referencia as string);
      const tasks:any[]=[]; for(const ref of refs) for(let i=1;i<=MAXI;i++) tasks.push({ref,i});
      const found:Record<string,Record<number,{url:string,bytes:number}>>={};
      await pool(tasks,25,async(t:any)=>{ const nn=String(t.i).padStart(2,'0'); const u1=BASE+t.ref.replace(/\./g,'_')+'-'+nn+'.png'; let b=await existe(u1); let url=u1;
        if(!b){ const u2=BASE+t.ref+'-'+nn+'.png'; b=await existe(u2); url=u2; }
        if(b){ (found[t.ref]=found[t.ref]||{})[t.i]={url,bytes:b}; } });
      let fotos=0;
      for(const ref of refs){
        await c.queryObject({text:`DELETE FROM produto_foto_ecom WHERE referencia=$1`,args:[ref]});
        const f=found[ref]||{}; const idxs=Object.keys(f).map(Number).sort((a,b)=>a-b);
        for(const i of idxs){ await c.queryObject({text:`INSERT INTO produto_foto_ecom (referencia,idx,url,bytes) VALUES ($1,$2,$3,$4)`,args:[ref,i,f[i].url,f[i].bytes]}); fotos++; }
        await c.queryObject({text:`INSERT INTO foto_ecom_scan (referencia,n,scan_em) VALUES ($1,$2,now()) ON CONFLICT (referencia) DO UPDATE SET n=EXCLUDED.n, scan_em=now()`,args:[ref,idxs.length]});
      }
      return J({offset:off,refs:refs.length,com_foto:Object.keys(found).length,fotos,proximo:refs.length<lim?null:off+lim});
    }

    if(acao==='comando'){
      if(body.confirmar!==true){ const n=(await c.queryObject`SELECT count(DISTINCT referencia)::int n FROM produto_foto_ecom`).rows[0]; return J({modo:'preview',refs:n}); }
      // MANTÉM a principal e a galeria atuais e ACRESCENTA as fotos novas que ainda não estão lá
      const r=await c.queryObject(`WITH f AS (SELECT referencia, (array_agg(url ORDER BY idx))[1] principal, jsonb_agg(url ORDER BY idx) gal FROM produto_foto_ecom GROUP BY referencia),
        m AS (SELECT f.referencia, COALESCE(pf.link_principal,f.principal) principal,
                (SELECT jsonb_agg(u ORDER BY o) FROM (SELECT u, min(o) o FROM (SELECT value u, ord o FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(pf.galeria)='array' THEN pf.galeria ELSE '[]'::jsonb END) WITH ORDINALITY t(value,ord)
                  UNION ALL SELECT value, 1000+ord FROM jsonb_array_elements_text(f.gal) WITH ORDINALITY t(value,ord)) a GROUP BY u) b) gal
              FROM f LEFT JOIN produto_foto pf ON pf.referencia=f.referencia)
        INSERT INTO produto_foto (referencia, link_principal, galeria, n_fotos, status, atualizado_em)
        SELECT referencia, principal, gal, jsonb_array_length(gal), 'ecommerce', now() FROM m
        ON CONFLICT (referencia) DO UPDATE SET link_principal=EXCLUDED.link_principal, galeria=EXCLUDED.galeria, n_fotos=EXCLUDED.n_fotos, atualizado_em=now()`);
      return J({modo:'aplicado',linhas:r.rowCount});
    }

    if(acao==='img_probe'){ // leitura: como o Anymarket expõe as imagens do produto
      const cfg=(await c.queryObject`SELECT token, base_url FROM anymarket_config WHERE id=1`).rows[0] as any;
      const base=(cfg.base_url||'https://api.anymarket.com.br/v2').replace(/\/$/,''); const H={'gumgaToken':cfg.token,'Content-Type':'application/json'};
      const pid=String(p('product_id')); const r=await fetch(`${base}/products/${pid}/images`,{headers:H}); const t=await r.text();
      const g=await fetch(`${base}/products/${pid}`,{headers:H}); const pj:any=await g.json().catch(()=>null);
      return J({http:r.status,images_endpoint:t.slice(0,1500),produto_images:pj?.images,sku_variations:(pj?.skus||[]).map((s:any)=>({partnerId:s.partnerId,variations:s.variations}))});
    }
    if(acao==='reverter'){ // remove do produto as fotos adicionadas por esta rotina (URLs da pasta informada) — usa senha
      const conf=(await c.queryObject`SELECT senha_hash FROM comando_config WHERE id=1`).rows[0] as any;
      if(conf?.senha_hash){ if(!body.senha) return J({error:'senha exigida'},401); if(await sha(String(body.senha))!==conf.senha_hash) return J({error:'senha incorreta'},401); }
      const cfg=(await c.queryObject`SELECT token, base_url FROM anymarket_config WHERE id=1`).rows[0] as any;
      const base=(cfg.base_url||'https://api.anymarket.com.br/v2').replace(/\/$/,''); const H={'gumgaToken':cfg.token,'Content-Type':'application/json'};
      const pid=String(body.product_id); const pasta=String(body.pasta||'/ecommerce/');
      const gi=await fetch(`${base}/products/${pid}/images`,{headers:H}); const ims:any[]=await gi.json().catch(()=>[]);
      let del=0; const err:string[]=[];
      for(const im of ims){ if(!String(im.url||'').includes(pasta)) continue; const r=await fetch(`${base}/products/${pid}/images/${im.id}`,{method:'DELETE',headers:H}); if(r.status>=200&&r.status<300) del++; else err.push(r.status+' '+(await r.text()).slice(0,120)); }
      await c.queryObject({text:`DELETE FROM anymarket_foto_envio WHERE product_id=$1`,args:[pid]});
      return J({product_id:pid,removidas:del,erros:err});
    }
    if(acao==='anymarket'){
      const lim=Math.min(15,Number(p('limit')||6));
      const cfg=(await c.queryObject`SELECT token, base_url FROM anymarket_config WHERE id=1`).rows[0] as any;
      const base=(cfg.base_url||'https://api.anymarket.com.br/v2').replace(/\/$/,''); const H={'gumgaToken':cfg.token,'Content-Type':'application/json'};
      if(body.confirmar===true){ const conf=(await c.queryObject`SELECT senha_hash FROM comando_config WHERE id=1`).rows[0] as any;
        if(conf?.senha_hash){ if(!body.senha) return J({error:'senha exigida'},401); if(await sha(String(body.senha))!==conf.senha_hash) return J({error:'senha incorreta'},401); } }
      const prods=body.product_id?[{product_id:String(body.product_id)}]:(await c.queryObject({text:`SELECT DISTINCT s.product_id::text product_id FROM anymarket_sku s
          WHERE s.referencia IN (SELECT referencia FROM produto_foto_ecom) AND s.product_id::text NOT IN (SELECT product_id FROM anymarket_foto_envio WHERE resultado='ok' OR em>now()-interval '3 hours') ORDER BY 1 LIMIT $1`,args:[lim]})).rows as any[];
      const out:any[]=[];
      for(const pr of prods){
        const g=await fetch(`${base}/products/${pr.product_id}`,{headers:H}); const pj:any=await g.json().catch(()=>null);
        if(g.status!==200||!pj?.id){ out.push({product_id:pr.product_id,erro:'GET '+g.status}); continue; }
        const skus=(pj.skus||[]) as any[]; const multi=skus.length>1;
        const imgs:any[]=[]; const refs:string[]=[];
        for(const s of skus){
          const ref=s.partnerId; if(!ref) continue; refs.push(ref);
          const fs=(await c.queryObject({text:`SELECT url FROM produto_foto_ecom WHERE referencia=$1 ORDER BY idx`,args:[ref]})).rows as any[];
          const cor=(s.variations||[]).find((v:any)=>v?.type?.visualVariation)?.description || null;
          for(const f of fs) imgs.push({url:f.url, ...(multi&&cor?{variation:cor}:{})});
        }
        if(!imgs.length){ out.push({product_id:pr.product_id,refs,erro:'sem fotos novas'}); continue; }
        const gi=await fetch(`${base}/products/${pr.product_id}/images`,{headers:H}); const antes:any[]=gi.status===200?(await gi.json().catch(()=>[])):(pj.images||[]);
        // MANTÉM as atuais e ACRESCENTA: a nova só vira principal se aquela cor (ou o produto simples) ainda não tem principal
        const temMain=new Set(antes.filter((x:any)=>x.main).map((x:any)=>(multi?(x.variation||'_'):'_')));
        const jaTem=new Set(antes.map((x:any)=>x.url)); let idx=Math.max(0,...antes.map((x:any)=>+x.index||0));
        const novas:any[]=[]; for(const x of imgs){ if(jaTem.has(x.url)) continue; const k=multi?(x.variation||'_'):'_'; const main=!temMain.has(k); if(main) temMain.add(k); novas.push({index:++idx,main,...x}); }
        if(body.confirmar!==true){ out.push({product_id:pr.product_id,titulo:pj.title,refs,antes:antes.length,acrescentar:novas.length,amostra:novas.slice(0,3)}); continue; }
        const erros:string[]=[]; let add=0, del=0;
        for(const im of novas){ let r=await fetch(`${base}/products/${pr.product_id}/images`,{method:'POST',headers:H,body:JSON.stringify(im)}); let t=await r.text();
          if(!(r.status>=200&&r.status<300)&&im.main&&/main/i.test(t)){ r=await fetch(`${base}/products/${pr.product_id}/images`,{method:'POST',headers:H,body:JSON.stringify({...im,main:false})}); t=await r.text(); } // já havia principal → entra como adicional
          if(r.status>=200&&r.status<300) add++; else erros.push(r.status+' '+t.slice(0,160)); }
        const ok=!erros.length; const r={status:ok?200:422}; const t=erros.join(' | ');
        await c.queryObject({text:`INSERT INTO anymarket_foto_envio (product_id,referencias,n_antes,imagens_antes,n_depois,http,resultado,em) VALUES ($1,$2,$3,$4,$5,$6,$7,now())
          ON CONFLICT (product_id) DO UPDATE SET referencias=EXCLUDED.referencias,n_antes=EXCLUDED.n_antes,imagens_antes=COALESCE(anymarket_foto_envio.imagens_antes,EXCLUDED.imagens_antes),n_depois=EXCLUDED.n_depois,http=EXCLUDED.http,resultado=EXCLUDED.resultado,em=now()`,
          args:[pr.product_id,refs,antes.length,JSON.stringify(antes.map((x:any)=>({id:x.id,index:x.index,main:x.main,url:x.url,variation:x.variation}))),antes.length+add,r.status,ok?'ok':('ERRO: '+t).slice(0,400)]});
        out.push({product_id:pr.product_id,refs,antes:antes.length,adicionadas:add,depois:antes.length+add,ok,erros:ok?undefined:t.slice(0,300)});
      }
      const rest=(await c.queryObject`SELECT count(DISTINCT s.product_id)::int n FROM anymarket_sku s WHERE s.referencia IN (SELECT referencia FROM produto_foto_ecom) AND s.product_id::text NOT IN (SELECT product_id FROM anymarket_foto_envio WHERE resultado='ok')`).rows[0] as any;
      return J({confirmar:body.confirmar===true,processados:out.length,faltam:rest.n,out});
    }
    return J({error:'acao inválida'},400);
  }catch(e){ return J({error:String(e).slice(0,400)},500); } finally{ await c.end(); }
});
