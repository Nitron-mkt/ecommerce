// any-juntar v1: junta no produto ANTIGO (com variação) o SKU que a importação criou como produto NOVO.
// POST {secret,senha,acao:'juntar',novo,antigo,ref,confirmar:true} → renomeia o SKU do produto novo (ref_juntado, sem EAN, estoque 0), cria o SKU no produto antigo e inativa o novo (desfaz se falhar)
// GET  ?secret=…&acao=ver&novo=<productId>&antigo=<productId>&ref=<partnerId>   → leitura: os 2 produtos, os SKUs e os anúncios do SKU
async function sha(x:string){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x));return [...new Uint8Array(b)].map(v=>v.toString(16).padStart(2,'0')).join('');}
import { Client } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';
const DB=Deno.env.get('SUPABASE_DB_URL')!;
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,apikey','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json'};
const J=(o:any,s=200)=>new Response(JSON.stringify(o,(_k,v)=>typeof v==='bigint'?Number(v):v),{status:s,headers:CORS});
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
    const get=async(path:string)=>{ const r=await fetch(base+path,{headers:H}); const t=await r.text(); let j:any=null; try{j=JSON.parse(t);}catch(_){ } return {http:r.status,j,t:j?undefined:t.slice(0,300)}; };
    const acao=p('acao')||'ver';
    if(acao==='ver'){
      const novo=String(p('novo')), antigo=String(p('antigo')), ref=String(p('ref')||'');
      const pn=await get(`/products/${novo}`), pa=await get(`/products/${antigo}`);
      const resumo=(x:any)=>x.j?{id:x.j.id,title:x.j.title,isActive:x.j.isActive,status:x.j.status,priceScope:x.j.definitionPriceScope,variations:x.j.variations,keys:Object.keys(x.j),skus:(x.j.skus||[]).map((s:any)=>({id:s.id,partnerId:s.partnerId,ean:s.ean,title:s.title,price:s.price,amount:s.amount,variations:s.variations,keys:Object.keys(s)}))}:x;
      const sku=(pn.j?.skus||[]).find((s:any)=>s.partnerId===ref)||(pn.j?.skus||[])[0];
      const mk=sku?await get(`/skus/${sku.id}/marketplaces`):null;
      const sk2=await get(`/products/${novo}/skus`);
      return J({novo:resumo(pn),antigo:resumo(pa),anuncios_do_sku:mk?{http:mk.http,lista:(Array.isArray(mk.j)?mk.j:mk.j?.content||[]).map((m:any)=>({id:m.id,marketPlace:m.marketPlace,idInMarketplace:m.idInMarketplace,status:m.publicationStatus||m.status,transmissionStatus:m.transmissionStatus,keys:Object.keys(m)})),raw:mk.t}:null,skus_endpoint:{http:sk2.http,n:Array.isArray(sk2.j)?sk2.j.length:null}});
    }
    if(acao==='juntar'){
      const conf=(await c.queryObject`SELECT senha_hash FROM comando_config WHERE id=1`).rows[0] as any;
      if(conf?.senha_hash){ if(!body.senha) return J({error:'senha exigida'},401); if(await sha(String(body.senha))!==conf.senha_hash) return J({error:'senha incorreta'},401); }
      const novo=String(body.novo), antigo=String(body.antigo), ref=String(body.ref);
      const send=async(m:string,path:string,b:any,ct='application/json')=>{ const r=await fetch(base+path,{method:m,headers:{...H,'Content-Type':ct},body:JSON.stringify(b)}); const t=await r.text(); return {http:r.status,ok:r.status>=200&&r.status<300,t:t.slice(0,400)}; };
      const pn=await get(`/products/${novo}`), pa=await get(`/products/${antigo}`);
      if(!pn.j||!pa.j) return J({error:'produto não encontrado',novo:pn.http,antigo:pa.http},404);
      const s=(pn.j.skus||[]).find((x:any)=>x.partnerId===ref); if(!s) return J({error:'SKU não está no produto novo'},404);
      if((pa.j.skus||[]).some((x:any)=>x.partnerId===ref)) return J({error:'SKU já está no produto antigo'},409);
      const cor=(s.variations||[]).find((v:any)=>v?.type?.name)||null;
      const mk=await get(`/skus/${s.id}/marketplaces`); const an=Array.isArray(mk.j)?mk.j:(mk.j?.content||[]);
      const novoSku:any={title:s.title,partnerId:ref,ean:s.ean,price:body.preco?Number(body.preco):s.price,amount:s.amount,additionalTime:s.additionalTime||0,variations:cor?{[cor.type.name]:cor.description}:{}};
      if(body.confirmar!==true) return J({modo:'previa',sku_novo_id:s.id,anuncios_no_sku_novo:an.length,criar_no_antigo:novoSku,antigo_tem:(pa.j.skus||[]).map((x:any)=>x.partnerId)});
      const log:any={};
      log.renomear=await send('PUT',`/products/${novo}/skus/${s.id}`,{title:s.title,partnerId:ref+'_juntado',ean:null,price:s.price,amount:0,additionalTime:s.additionalTime||0,variations:cor?{[cor.type.name]:cor.description}:{}});
      if(!log.renomear.ok) return J({ok:false,etapa:'renomear',log});
      log.criar=await send('POST',`/products/${antigo}/skus`,novoSku);
      if(!log.criar.ok){ log.desfazer=await send('PUT',`/products/${novo}/skus/${s.id}`,{title:s.title,partnerId:ref,ean:s.ean,price:s.price,amount:s.amount,additionalTime:s.additionalTime||0,variations:cor?{[cor.type.name]:cor.description}:{}}); return J({ok:false,etapa:'criar',log}); }
      const resto=(pn.j.skus||[]).filter((x:any)=>x.id!==s.id && !String(x.partnerId).endsWith('_juntado'));
      if(!resto.length) log.inativar=await send('PATCH',`/products/${novo}`,{isProductActive:false},'application/merge-patch+json');   // só inativa quando não sobrou SKU no produto novo
      else log.inativar={pulado:'ainda há SKU no produto novo: '+resto.map((x:any)=>x.partnerId).join(', ')};
      const depois=await get(`/products/${antigo}`);
      return J({ok:true,log,antigo_agora:(depois.j?.skus||[]).map((x:any)=>({partnerId:x.partnerId,cor:(x.variations||[]).map((v:any)=>v.description).join('/'),amount:x.amount,price:x.price}))});
    }
    return J({error:'acao inválida'},400);
  }catch(e){ return J({error:String(e).slice(0,400)},500); } finally{ await c.end(); }
});
