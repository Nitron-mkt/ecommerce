// ml-item-attr: corrige SELLER_SKU e/ou GTIN de UM anúncio do ML (conta detectada pelo seller_id). Log em ml_item_attr_log.
// POST {secret, senha, item_id, seller_sku?, gtin?}
import { Client } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';
const DB=Deno.env.get('SUPABASE_DB_URL')!;
const J=(o:any,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json'}});
async function sha(s:string){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
Deno.serve(async(req)=>{
  const c=new Client(DB); await c.connect();
  try{
    const b=await req.json().catch(()=>({}));
    const app=(await c.queryObject`SELECT state_secret FROM ml_oauth_app WHERE id=1`).rows[0] as any;
    if(!app||b.secret!==app.state_secret) return J({error:'secret'},403);
    const conf=(await c.queryObject`SELECT senha_hash FROM comando_config WHERE id=1`).rows[0] as any;
    if(conf?.senha_hash && await sha(String(b.senha||''))!==conf.senha_hash) return J({error:'senha'},401);
    const attrs:any[]=[]; if(b.seller_sku) attrs.push({id:'SELLER_SKU',value_name:String(b.seller_sku)}); if(b.gtin) attrs.push({id:'GTIN',value_name:String(b.gtin)});
    if(!b.item_id||!attrs.length) return J({error:'item_id e seller_sku/gtin'},400);
    await c.queryObject(`CREATE TABLE IF NOT EXISTS ml_item_attr_log (id bigserial primary key, item_id text, attrs jsonb, http int, resposta text, em timestamptz default now())`);
    const toks=(await c.queryObject`SELECT ml_user_id, access_token FROM ml_conta_token`).rows as any[];
    for(const t of toks){
      const g=await fetch(`https://api.mercadolibre.com/items/${b.item_id}`,{headers:{Authorization:'Bearer '+t.access_token}}); if(g.status!==200) continue;
      const it:any=await g.json(); if(String(it.seller_id)!==String(t.ml_user_id)) continue;
      const r=await fetch(`https://api.mercadolibre.com/items/${b.item_id}`,{method:'PUT',headers:{Authorization:'Bearer '+t.access_token,'Content-Type':'application/json'},body:JSON.stringify({attributes:attrs})}); const tx=await r.text();
      await c.queryObject({text:`INSERT INTO ml_item_attr_log (item_id,attrs,http,resposta) VALUES ($1,$2,$3,$4)`,args:[b.item_id,JSON.stringify(attrs),r.status,tx.slice(0,400)]});
      let j:any=null; try{j=JSON.parse(tx);}catch{}
      return J({ok:r.status===200,http:r.status,depois:(j?.attributes||[]).filter((a:any)=>['SELLER_SKU','GTIN'].includes(a.id)).map((a:any)=>[a.id,a.value_name]),erro:r.status!==200?tx.slice(0,300):undefined});
    }
    return J({error:'anúncio não encontrado nas contas'},404);
  }catch(e){ return J({error:String(e).slice(0,300)},500);} finally{ await c.end(); }
});
