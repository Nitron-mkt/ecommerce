// any-caracteristicas: características (aba "Características") dos produtos do Anymarket por categoria
// GET  ?secret=…&acao=listar&categoria=3917216&offset=0          → produtos da categoria com as características atuais (varre /products paginado)
// POST {secret,acao:'aplicar',senha,product_ids:[…],chars:[{name,value}]} → ACRESCENTA/ATUALIZA só essas características (mantém as demais); log em anymarket_carac_log
import { Client } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';
const DB=Deno.env.get('SUPABASE_DB_URL')!;
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,apikey','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json'};
const J=(o:any,s=200)=>new Response(JSON.stringify(o,(_k,v)=>typeof v==='bigint'?Number(v):v),{status:s,headers:CORS});
async function sha(s:string){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
const norm=(s:string)=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toLowerCase();
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:CORS});
  const u=new URL(req.url); const c=new Client(DB); await c.connect();
  try{
    const body=req.method==='POST'?await req.json().catch(()=>({})):{};
    const p=(k:string)=>body[k]??u.searchParams.get(k);
    const app=(await c.queryObject`SELECT state_secret FROM ml_oauth_app WHERE id=1`).rows[0] as any;
    if(!app||p('secret')!==app.state_secret) return J({error:'secret'},403);
    const cfg=(await c.queryObject`SELECT token, base_url FROM anymarket_config WHERE id=1`).rows[0] as any;
    const base=(cfg.base_url||'https://api.anymarket.com.br/v2').replace(/\/$/,''); const H={'gumgaToken':cfg.token,'Content-Type':'application/json'};
    const acao=p('acao')||'listar';

    if(acao==='listar'){ // leitura
      const cat=String(p('categoria')||'3917216'); const off=Number(p('offset')||0); const paginas=Math.min(10,Number(p('paginas')||5));
      const out:any[]=[]; let o=off, total=null as any, fim=false;
      for(let i=0;i<paginas;i++){
        const r=await fetch(`${base}/products?offset=${o}&limit=100`,{headers:H}); const j:any=await r.json().catch(()=>null);
        if(r.status!==200||!j){ return J({error:'GET products '+r.status,offset:o},502); }
        total=j.page?.totalElements??total; const cont=j.content||[];
        for(const pr of cont){ if(String(pr?.category?.id)===cat) out.push({id:pr.id,title:pr.title,category:pr.category?.name,characteristics:pr.characteristics||[]}); }
        o+=cont.length; if(cont.length<100){ fim=true; break; }
      }
      return J({categoria:cat,offset:off,proximo:fim?null:o,total,produtos:out});
    }

    if(acao==='aplicar'){
      const conf=(await c.queryObject`SELECT senha_hash FROM comando_config WHERE id=1`).rows[0] as any;
      if(conf?.senha_hash){ if(!body.senha) return J({error:'senha exigida'},401); if(await sha(String(body.senha))!==conf.senha_hash) return J({error:'senha incorreta'},401); }
      const chars:any[]=(body.chars||[]).filter((x:any)=>x?.name&&x?.value!=null); if(!chars.length) return J({error:'chars vazio'},400);
      const pids:string[]=(body.product_ids||[]).map(String).slice(0,10); const out:any[]=[];
      await c.queryObject(`CREATE TABLE IF NOT EXISTS anymarket_carac_log (id bigserial primary key, product_id text, antes jsonb, depois jsonb, http int, resposta text, em timestamptz default now())`);
      for(const pid of pids){
        const g=await fetch(`${base}/products/${pid}`,{headers:H}); const pj:any=await g.json().catch(()=>null);
        if(g.status!==200||!pj?.id){ out.push({product_id:pid,erro:'GET '+g.status}); continue; }
        const antes:any[]=pj.characteristics||[]; const novo=antes.map((x:any)=>({...x}));
        for(const ch of chars){ const i=novo.findIndex((x:any)=>norm(x.name)===norm(ch.name)); if(i>=0) novo[i].value=String(ch.value); else novo.push({index:novo.length+1,name:String(ch.name),value:String(ch.value)}); }
        if(JSON.stringify(novo)===JSON.stringify(antes)){ out.push({product_id:pid,ja_ok:true}); continue; }
        // tenta PATCH (JSON Patch) só do campo; se a API recusar, cai p/ PUT do produto inteiro com as características novas
        let r=await fetch(`${base}/products/${pid}`,{method:'PATCH',headers:{...H,'Content-Type':'application/merge-patch+json'},body:JSON.stringify({characteristics:novo})}); let t=await r.text(); let via='patch-merge';
        if(!(r.status>=200&&r.status<300)){ r=await fetch(`${base}/products/${pid}`,{method:'PATCH',headers:H,body:JSON.stringify([{op:'replace',path:'/characteristics',value:novo}])}); t=await r.text(); via='patch-json'; }
        if(!(r.status>=200&&r.status<300)){ r=await fetch(`${base}/products/${pid}`,{method:'PUT',headers:H,body:JSON.stringify({...pj,characteristics:novo})}); t=await r.text(); via='put'; }
        await c.queryObject({text:`INSERT INTO anymarket_carac_log (product_id,antes,depois,http,resposta) VALUES ($1,$2,$3,$4,$5)`,args:[pid,JSON.stringify(antes),JSON.stringify(novo),r.status,t.slice(0,400)]});
        out.push({product_id:pid,ok:r.status>=200&&r.status<300,via,http:r.status,erro:r.status>=300?t.slice(0,240):undefined});
      }
      return J({out});
    }
    return J({error:'acao inválida'},400);
  }catch(e){ return J({error:String(e).slice(0,400)},500); } finally{ await c.end(); }
});
