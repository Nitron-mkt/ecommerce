// anymarket-vincular v9: BIND/MATCH (anuncio existente) ou CREATE (publica anuncio novo no canal). resp verbosa.
// v9: + attributes/fields repassados ao Anymarket (MATCH no ML exige os atributos da categoria).
// POST {secret, confirmar?, binds:[{id_sku, id_account, marketplace, origin?, ref, sku_in_marketplace?, id_in_marketplace?, price?, is_catalog?, attributes?, fields?}]}
import { Client } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';
const DB=Deno.env.get('SUPABASE_DB_URL')!;
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,apikey','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json'};
const N=(v:any)=>{const f=Number(v);return isFinite(f)&&f>0?f:null;};
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:CORS});
  const c=new Client(DB); await c.connect();
  try{
    const body=await req.json().catch(()=>({}));
    const app=(await c.queryObject`SELECT state_secret FROM ml_oauth_app WHERE id=1`).rows[0] as any;
    if(!app||body.secret!==app.state_secret) return new Response(JSON.stringify({error:'secret'}),{status:403,headers:CORS});
    const cfg=(await c.queryObject`SELECT token, base_url FROM anymarket_config WHERE id=1`).rows[0] as any;
    const base=(cfg.base_url||'https://api.anymarket.com.br/v2').replace(/\/$/,''); const H={'gumgaToken':cfg.token,'Content-Type':'application/json'};
    const binds=Array.isArray(body.binds)?body.binds:[];
    if(!binds.length) return new Response(JSON.stringify({error:'sem binds'}),{status:400,headers:CORS});
    const out:any[]=[];
    for(const b of binds){
      const idSku=b.id_sku; const pr=N(b.price); const mp=(b.marketplace||'SHOPEE').toUpperCase(); const origin=(b.origin||'BIND').toUpperCase();
      const payload:any={idAccount:Number(b.id_account), marketPlace:mp, skuInMarketplace:String(b.sku_in_marketplace||b.ref), origin};
      if(origin!=='CREATE' && b.id_in_marketplace) payload.idInMarketplace=String(b.id_in_marketplace);
      if(pr!=null){ payload.price=pr; payload.discountPrice=pr; }
      if(b.is_catalog!==undefined) payload.isCatalog=!!b.is_catalog;
      if(b.attributes&&typeof b.attributes==='object') payload.attributes=b.attributes;
      if(b.fields&&typeof b.fields==='object') payload.fields=b.fields;
      if(!idSku||!payload.idAccount){ out.push({ref:b.ref,erro:'faltam campos'}); continue; }
      if(origin!=='CREATE' && !payload.idInMarketplace){ out.push({ref:b.ref,erro:'BIND/MATCH exige id_in_marketplace'}); continue; }
      if(body.confirmar!==true){ out.push({ref:b.ref,mp,origin,preview:payload}); continue; }
      const r=await fetch(base+'/skus/'+idSku+'/marketplaces',{method:'POST',headers:H,body:JSON.stringify(payload)}); const t=await r.text();
      let j:any=null; try{j=JSON.parse(t);}catch{}
      const okk=r.status>=200&&r.status<300;
      out.push({ref:b.ref, mp, origin, http:r.status, ok:okk, new_offer_id:okk&&j?j.id:undefined, pub:okk&&j?j.publicationStatus:undefined, resp:t.slice(0,500)});
    }
    return new Response(JSON.stringify({confirmar:body.confirmar===true, n:out.length, ok:out.filter(o=>o.ok).length, out}),{headers:CORS});
  }catch(e){ return new Response(JSON.stringify({error:String(e).slice(0,400)}),{status:500,headers:CORS}); } finally{ await c.end(); }
});
