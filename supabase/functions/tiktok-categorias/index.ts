// tiktok-categorias: categorias dos produtos da loja TikTok (token id=1).
// GET ?secret&acao=arvore                       → árvore de categorias (folhas) pt-BR
// GET ?secret&acao=listar&page_token=&limit=50  → produtos com a categoria atual (detalhe por produto)
// POST {secret,acao:'recomendar',titulos:[{id,title}]} → categoria recomendada pelo TikTok p/ cada título
// POST {secret,acao:'aplicar',confirmar:true,itens:[{product_id,category_id}]} → partial_edit da categoria (sem confirmar = prévia)
// POST {secret,acao:'atributos',category_id}    → atributos da categoria (obrigatórios)
import { Client } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';
const DB=Deno.env.get('SUPABASE_DB_URL')!; const HOST='https://open-api.tiktokglobalshop.com';
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,apikey','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json'};
const J=(o:any,s=200)=>new Response(JSON.stringify(o),{status:s,headers:CORS});
async function hmacHex(key:string,msg:string){ const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']); const s=await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(msg)); return Array.from(new Uint8Array(s)).map(b=>b.toString(16).padStart(2,'0')).join(''); }
async function ttSign(sec:string,path:string,params:Record<string,string>,body:string){ const p:Record<string,string>={...params}; delete p.sign; delete p.access_token; let base=path; for(const k of Object.keys(p).sort()) base+=k+p[k]; if(body) base+=body; return await hmacHex(sec,sec+base+sec); }
async function tt(app:any,at:string,method:string,path:string,extra:Record<string,string>,bodyObj:any){ const params:Record<string,string>={app_key:String(app.app_key),timestamp:String(Math.floor(Date.now()/1000)),...extra}; const body=bodyObj!=null?JSON.stringify(bodyObj):''; params.sign=await ttSign(String(app.app_secret),path,params,body); const qs=Object.entries(params).map(([k,v])=>`${k}=${encodeURIComponent(v)}`).join('&'); const r=await fetch(`${HOST}${path}?${qs}`,{method,headers:{'x-tts-access-token':at,'content-type':'application/json'},body:body||undefined}); const t=await r.text(); let d:any; try{d=JSON.parse(t);}catch{d=t;} return {http:r.status,d}; }
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:CORS});
  const u=new URL(req.url); const c=new Client(DB); await c.connect();
  try{
    const body=req.method==='POST'?await req.json().catch(()=>({})):{};
    const p=(k:string)=>body[k]??u.searchParams.get(k);
    const app=(await c.queryObject`SELECT * FROM tiktok_oauth_app WHERE id=1`).rows[0] as any;
    if(!app||p('secret')!==app.state_secret) return J({error:'secret'},403);
    const tok=(await c.queryObject`SELECT * FROM tiktok_oauth_token WHERE id=1`).rows[0] as any;
    let at=tok.access_token; const acao=p('acao')||'listar';
    const appT=(await c.queryObject({text:`SELECT * FROM tiktok_oauth_app WHERE app_key=$1`,args:[tok.app_key]})).rows[0] as any||app;
    if(p('refresh')==='1'||p('refresh')===true||acao==='refresh'){ const app2=appT;
      const r=await fetch(`https://auth.tiktok-shops.com/api/v2/token/refresh?app_key=${encodeURIComponent(app2.app_key)}&app_secret=${encodeURIComponent(app2.app_secret)}&refresh_token=${encodeURIComponent(tok.refresh_token)}&grant_type=refresh_token`); const j:any=await r.json().catch(()=>null); const d=j?.data||{};
      if(j?.code===0&&d.access_token){ at=d.access_token; await c.queryObject({text:`UPDATE tiktok_oauth_token SET access_token=$1,refresh_token=$2,access_expire=to_timestamp($3),refresh_expire=to_timestamp($4),atualizado_em=now() WHERE id=1`,args:[d.access_token,d.refresh_token||tok.refresh_token,Number(d.access_token_expire_in)||0,Number(d.refresh_token_expire_in)||0]}); }
      if(acao==='refresh') return J({code:j?.code,msg:j?.message,ok:!!d.access_token,expira:d.access_token_expire_in}); }
    const sc={shop_cipher:String(tok.shop_cipher)};
    if(acao==='arvore'){ const r=await tt(appT,at,'GET','/product/202309/categories',{...sc,locale:'pt-BR'},null); const cats=r.d?.data?.categories||[]; return J({http:r.http,code:r.d?.code,msg:r.d?.message,n:cats.length,cats:cats.map((x:any)=>({id:x.id,pai:x.parent_id,nome:x.local_name,folha:x.is_leaf,perm:x.permission_statuses}))}); }
    if(acao==='listar'){
      const ex:Record<string,string>={...sc,page_size:String(Math.min(Number(p('limit')||50),100))}; if(p('page_token')) ex.page_token=String(p('page_token'));
      const r=await tt(appT,at,'POST','/product/202309/products/search',ex,{status:String(p('status')||'ALL')});
      const prods=r.d?.data?.products||[]; const out:any[]=[];
      await Promise.all(prods.map(async(pr:any)=>{ const d=await tt(appT,at,'GET',`/product/202309/products/${pr.id}`,sc,null); const dd=d.d?.data||{}; out.push({id:pr.id,title:pr.title,status:pr.status,sku:(pr.skus||[])[0]?.seller_sku,cat:(dd.category_chains||[]).map((x:any)=>({id:x.id,nome:x.local_name,folha:x.is_leaf})),attrs:(dd.product_attributes||[]).map((a:any)=>({id:a.id,name:a.name,v:(a.values||[]).map((v:any)=>v.name).join('|')})),erro:d.d?.code?d.d?.message:undefined}); }));
      return J({http:r.http,code:r.d?.code,msg:r.d?.message,total:r.d?.data?.total_count,next:r.d?.data?.next_page_token||null,produtos:out});
    }
    if(acao==='recomendar'){ const out:any[]=[]; for(const t of (body.titulos||[]).slice(0,40)){ const r=await tt(appT,at,'POST','/product/202309/categories/recommend',sc,{product_title:t.title}); out.push({id:t.id,title:t.title,rec:(r.d?.data?.categories||[]).map((x:any)=>({id:x.id,nome:x.name,folha:x.is_leaf})),leaf:r.d?.data?.leaf_category_id,code:r.d?.code,msg:r.d?.code?r.d?.message:undefined}); } return J({out}); }
    if(acao==='atributos'){ const r=await tt(appT,at,'GET',`/product/202309/categories/${p('category_id')}/attributes`,{...sc,locale:'pt-BR'},null); return J({http:r.http,code:r.d?.code,msg:r.d?.message,attrs:(r.d?.data?.attributes||[]).map((a:any)=>({id:a.id,nome:a.name,tipo:a.type,obrig:a.is_requried??a.is_required,multi:a.is_multiple_selection,vals:(a.values||[]).slice(0,40).map((v:any)=>({id:v.id,n:v.name}))}))}); }
    if(acao==='aplicar'){
      const itens=(body.itens||[]).slice(0,25); const out:any[]=[];
      await c.queryObject(`CREATE TABLE IF NOT EXISTS tiktok_categoria_log (id bigserial primary key, product_id text, cat_antes text, cat_nova text, http int, code int, resposta text, em timestamptz default now())`);
      for(const it of itens){
        const d=await tt(appT,at,'GET',`/product/202309/products/${it.product_id}`,sc,null); const dd=d.d?.data||{}; const antes=(dd.category_chains||[]).slice(-1)[0]?.id;
        if(String(antes)===String(it.category_id)){ out.push({product_id:it.product_id,ja_ok:true}); continue; }
        const payload:any={category_id:String(it.category_id)}; if(Array.isArray(it.product_attributes)) payload.product_attributes=it.product_attributes;
        if(body.confirmar!==true){ out.push({product_id:it.product_id,antes,preview:payload}); continue; }
        const r=await tt(appT,at,'POST',`/product/202309/products/${it.product_id}/partial_edit`,sc,payload);
        await c.queryObject({text:`INSERT INTO tiktok_categoria_log (product_id,cat_antes,cat_nova,http,code,resposta) VALUES ($1,$2,$3,$4,$5,$6)`,args:[String(it.product_id),String(antes||''),String(it.category_id),r.http,Number(r.d?.code??-1),JSON.stringify(r.d).slice(0,600)]});
        out.push({product_id:it.product_id,antes,nova:it.category_id,ok:r.d?.code===0,code:r.d?.code,msg:r.d?.message,data:r.d?.data});
      }
      return J({confirmar:body.confirmar===true,out});
    }
    return J({error:'acao'},400);
  }catch(e){ return J({error:String(e).slice(0,400)},500); } finally{ await c.end(); }
});
