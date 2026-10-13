// ml-frete v1: desligar frete grátis no ML (só anúncios < R$79 — acima disso o ML obriga frete grátis).
// GET  ?secret=…&acao=elegiveis                    → anúncios com free_shipping=true e preço < 79 (base local)
// GET  ?secret=…&acao=verificar&lid=MLB…           → lê AO VIVO no ML (preço, frete grátis, status) e atualiza anuncio_proprio
// POST {secret,senha,confirmar:true,acao:'desligar',lid}  → PUT /items/{id} shipping.free_shipping=false (revalida ao vivo antes)
// Obs.: o Anymarket pode reenviar o frete na próxima sincronização se a regra de frete da conta/produto no hub estiver "grátis".
import { Client } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';
const DB=Deno.env.get('SUPABASE_DB_URL')!;
const ML='https://api.mercadolibre.com';
const LIMITE=79;
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,apikey','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json'};
const J=(o:any,s=200)=>new Response(JSON.stringify(o,(_k,v)=>typeof v==='bigint'?Number(v):v),{status:s,headers:CORS});
async function sha(s:string){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:CORS});
  const u=new URL(req.url); const c=new Client(DB); await c.connect();
  try{
    const body=req.method==='POST'?await req.json().catch(()=>({})):{};
    const p=(k:string)=>body[k]??u.searchParams.get(k);
    const app=(await c.queryObject`SELECT state_secret FROM ml_oauth_app WHERE id=1`).rows[0] as any;
    if(!app||p('secret')!==app.state_secret) return J({error:'secret'},403);
    const acao=p('acao');

    if(acao==='elegiveis'){
      const rows=(await c.queryObject(`SELECT listing_id lid, loja, ref_casada ref, titulo, preco_atual::float preco, frete_real::float frete, ml_status st, calc_em FROM anuncio_proprio WHERE plataforma='ML' AND free_shipping IS TRUE AND preco_atual<${LIMITE} ORDER BY frete_real DESC NULLS LAST`)).rows;
      return J({limite:LIMITE,n:rows.length,rows});
    }

    const lid=String(p('lid')||'').trim().toUpperCase();
    if(!/^MLB\d+$/.test(lid)) return J({error:'lid inválido'},400);
    const ap=(await c.queryObject({text:`SELECT loja, ref_casada ref, preco_atual, free_shipping FROM anuncio_proprio WHERE listing_id=$1 AND plataforma='ML' LIMIT 1`,args:[lid]})).rows[0] as any;
    if(!ap) return J({error:'anúncio não está em anuncio_proprio'},404);
    const tok=(await c.queryObject({text:`SELECT access_token FROM ml_conta_token WHERE loja=$1`,args:[ap.loja]})).rows[0] as any;
    if(!tok?.access_token) return J({error:'sem token ML p/ loja '+ap.loja},400);
    const H={'Authorization':'Bearer '+tok.access_token,'Content-Type':'application/json'};
    const live=async()=>{const r=await fetch(`${ML}/items/${lid}?attributes=id,price,status,shipping`,{headers:H});const j=await r.json().catch(()=>({}));return {http:r.status,preco:j.price,status:j.status,free:j.shipping?.free_shipping,mode:j.shipping?.mode,logistic:j.shipping?.logistic_type,raw:j};};
    const sync=async(l:any)=>{ if(l.http===200&&typeof l.free==='boolean') await c.queryObject({text:`UPDATE anuncio_proprio SET free_shipping=$1::boolean, frete_real=CASE WHEN $1::boolean THEN frete_real ELSE 0 END, preco_atual=COALESCE($2::numeric,preco_atual), ml_status=COALESCE($3::text,ml_status), calc_em=CASE WHEN free_shipping IS DISTINCT FROM $1::boolean THEN NULL ELSE calc_em END WHERE listing_id=$4::text AND plataforma='ML'`,args:[l.free,l.preco??null,l.status??null,lid]}); };

    if(acao==='verificar'){
      const l=await live(); await sync(l);
      return J({lid,loja:ap.loja,ref:ap.ref,http:l.http,preco:l.preco,status:l.status,free_shipping:l.free,mode:l.mode,logistic:l.logistic,elegivel:l.free===true&&+l.preco<LIMITE});
    }

    if(acao==='desligar'){
      const l=await live();
      if(l.http!==200) return J({error:'ML GET falhou',http:l.http,resposta:JSON.stringify(l.raw).slice(0,400)},502);
      await sync(l);
      if(l.free!==true) return J({modo:'nada a fazer',lid,free_shipping:l.free,msg:'frete grátis já está desligado no ML'});
      if(!(+l.preco<LIMITE)) return J({error:`preço ao vivo R$ ${l.preco} ≥ ${LIMITE}: o ML obriga frete grátis — não dá para desligar`},409);
      if(body.confirmar!==true) return J({modo:'preview',lid,loja:ap.loja,ref:ap.ref,preco:l.preco,free_shipping:l.free,aviso:'envie confirmar:true + senha'});
      const conf=(await c.queryObject`SELECT senha_hash FROM comando_config WHERE id=1`).rows[0] as any;
      if(conf?.senha_hash){ if(!body.senha) return J({error:'senha exigida'},401); if(await sha(String(body.senha))!==conf.senha_hash) return J({error:'senha incorreta'},401); }
      const r=await fetch(`${ML}/items/${lid}`,{method:'PUT',headers:H,body:JSON.stringify({shipping:{free_shipping:false}})});
      const txt=await r.text();
      const d=await live(); await sync(d);
      const ok=r.status>=200&&r.status<300&&d.free===false;
      await c.queryObject({text:`INSERT INTO ml_frete_log (listing_id,loja,referencia,preco,free_antes,free_depois,http,resultado,origem) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,args:[lid,ap.loja,ap.ref,l.preco,l.free,d.free,r.status,ok?'ok':('ERRO: '+txt).slice(0,400),body.origem||'painel']});
      return J({modo:'aplicado',ok,http:r.status,lid,free_antes:l.free,free_depois:d.free,resposta:ok?undefined:txt.slice(0,800)});
    }
    return J({error:'acao inválida'},400);
  }catch(e){ return J({error:String(e).slice(0,400)},500); } finally{ await c.end(); }
});
