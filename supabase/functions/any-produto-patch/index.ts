// any-produto-patch: muda categoria e/ou escopo de preço de produtos no Anymarket (merge-patch). Log em anymarket_produto_patch_log.
// POST {secret, senha, confirmar?, itens:[{product_id, category_id?, price_scope?} | {sku_id, product_id?, ean}]}  (até 25 por chamada; sem confirmar = prévia)
import { Client } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';
const DB=Deno.env.get('SUPABASE_DB_URL')!;
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,apikey','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json'};
const J=(o:any,s=200)=>new Response(JSON.stringify(o),{status:s,headers:CORS});
async function sha(s:string){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:CORS});
  const c=new Client(DB); await c.connect();
  try{
    const b=await req.json().catch(()=>({}));
    const app=(await c.queryObject`SELECT state_secret FROM ml_oauth_app WHERE id=1`).rows[0] as any;
    if(!app||b.secret!==app.state_secret) return J({error:'secret'},403);
    const conf=(await c.queryObject`SELECT senha_hash FROM comando_config WHERE id=1`).rows[0] as any;
    if(conf?.senha_hash && await sha(String(b.senha||''))!==conf.senha_hash) return J({error:'senha'},401);
    const cfg=(await c.queryObject`SELECT token, base_url FROM anymarket_config WHERE id=1`).rows[0] as any;
    const base=(cfg.base_url||'https://api.anymarket.com.br/v2').replace(/\/$/,''); const H={'gumgaToken':cfg.token};
    await c.queryObject(`CREATE TABLE IF NOT EXISTS anymarket_produto_patch_log (id bigserial primary key, product_id text, antes jsonb, patch jsonb, http int, resposta text, em timestamptz default now())`);
    const out:any[]=[];
    for(const it of (b.itens||[]).slice(0,25)){
      if(it.sku_id&&it.ean!==undefined){ // EAN do SKU
        const g=await fetch(`${base}/skus/${it.sku_id}`,{headers:H}); const sj:any=await g.json().catch(()=>null);
        if(g.status!==200){ out.push({sku_id:it.sku_id,erro:'GET sku '+g.status}); continue; }
        if(b.confirmar!==true){ out.push({sku_id:it.sku_id,antes:sj.ean,depois:it.ean}); continue; }
        const tent:any[]=[]; let ok=false;
        const vmap:any={}; for(const v of (sj.variations||[])) vmap[v.type?.name||'Cor']=v.description;
        const skb:any={title:sj.title,partnerId:sj.partnerId,ean:String(it.ean),amount:sj.amount,price:sj.price,sellPrice:sj.sellPrice,additionalTime:sj.additionalTime,active:sj.active,variations:vmap};
        for(const [m,p,ct,bd] of [['PATCH',`/skus/${it.sku_id}`,'application/merge-patch+json',{ean:String(it.ean)}],['PUT',`/products/${it.product_id}/skus/${it.sku_id}`,'application/json',skb],['PUT',`/skus/${it.sku_id}`,'application/json',{...sj,ean:String(it.ean)}]] as any){
          if(p.includes('undefined')) continue;
          const r=await fetch(base+p,{method:m,headers:{...H,'Content-Type':ct},body:JSON.stringify(bd)}); const t=await r.text(); tent.push({m,p,http:r.status,t:t.slice(0,200)});
          await c.queryObject({text:`INSERT INTO anymarket_produto_patch_log (product_id,antes,patch,http,resposta) VALUES ($1,$2,$3,$4,$5)`,args:['sku:'+it.sku_id,JSON.stringify({ean:sj.ean}),JSON.stringify({ean:it.ean,via:m+' '+p}),r.status,t.slice(0,400)]});
          if(r.status>=200&&r.status<300){ok=true;break;}
        }
        out.push({sku_id:it.sku_id,ok,tent}); continue;
      }
      const g=await fetch(`${base}/products/${it.product_id}`,{headers:H}); const pj:any=await g.json().catch(()=>null);
      if(g.status!==200){ out.push({product_id:it.product_id,erro:'GET '+g.status}); continue; }
      const patch:any={}; if(it.category_id) patch.category={id:Number(it.category_id)}; if(it.price_scope) patch.definitionPriceScope=String(it.price_scope);
      const antes={category:pj.category,definitionPriceScope:pj.definitionPriceScope};
      if(b.confirmar!==true){ out.push({product_id:it.product_id,title:pj.title,antes,patch}); continue; }
      const r=await fetch(`${base}/products/${it.product_id}`,{method:'PATCH',headers:{...H,'Content-Type':'application/merge-patch+json'},body:JSON.stringify(patch)}); const t=await r.text();
      await c.queryObject({text:`INSERT INTO anymarket_produto_patch_log (product_id,antes,patch,http,resposta) VALUES ($1,$2,$3,$4,$5)`,args:[String(it.product_id),JSON.stringify(antes),JSON.stringify(patch),r.status,t.slice(0,400)]});
      let depois:any=null; try{const j=JSON.parse(t); depois={category:j.category?.name,scope:j.definitionPriceScope};}catch{}
      out.push({product_id:it.product_id,ok:r.status>=200&&r.status<300,http:r.status,depois,erro:r.status>=300?t.slice(0,300):undefined});
    }
    return J({confirmar:b.confirmar===true,out});
  }catch(e){ return J({error:String(e).slice(0,400)},500); } finally{ await c.end(); }
});
