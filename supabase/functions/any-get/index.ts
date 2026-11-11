// any-get: leitura (GET) na API do Anymarket. ?secret=…&path=/products/123  (só GET, só leitura)
import { Client } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';
const DB=Deno.env.get('SUPABASE_DB_URL')!;
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,apikey','Access-Control-Allow-Methods':'GET,OPTIONS','Content-Type':'application/json'};
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:CORS});
  const u=new URL(req.url); const c=new Client(DB); await c.connect();
  try{
    const app=(await c.queryObject`SELECT state_secret FROM ml_oauth_app WHERE id=1`).rows[0] as any;
    if(!app||u.searchParams.get('secret')!==app.state_secret) return new Response(JSON.stringify({error:'secret'}),{status:403,headers:CORS});
    const cfg=(await c.queryObject`SELECT token, base_url FROM anymarket_config WHERE id=1`).rows[0] as any;
    const base=(cfg.base_url||'https://api.anymarket.com.br/v2').replace(/\/$/,'');
    const path=u.searchParams.get('path')||''; if(!path.startsWith('/')) return new Response(JSON.stringify({error:'path'}),{status:400,headers:CORS});
    const r=await fetch(base+path,{headers:{'gumgaToken':cfg.token,'Content-Type':'application/json'}}); const t=await r.text();
    return new Response(JSON.stringify({http:r.status,body:(()=>{try{return JSON.parse(t)}catch{return t.slice(0,2000)}})()}),{headers:CORS});
  }catch(e){ return new Response(JSON.stringify({error:String(e).slice(0,300)}),{status:500,headers:CORS}); } finally{ await c.end(); }
});
