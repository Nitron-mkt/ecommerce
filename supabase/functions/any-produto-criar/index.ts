// any-produto-criar: cadastra produto SIMPLES (1 SKU) no Anymarket. Log em anymarket_produto_patch_log.
// POST {secret, senha, confirmar?, produto:{title, description, category_id, brand_id?, height, width, length, weight, images:[url], characteristics?:[{name,value}],
//        sku:{partnerId, ean, price, amount, title?}}}   sem confirmar = prévia do payload
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
    const cfg=(await c.queryObject`SELECT token, base_url FROM anymarket_config WHERE id=1`).rows[0] as any;
    const base=(cfg.base_url||'https://api.anymarket.com.br/v2').replace(/\/$/,''); const H={'gumgaToken':cfg.token,'Content-Type':'application/json'};
    const p=b.produto||{}; const s=p.sku||{};
    if(!p.title||!p.category_id||!s.partnerId) return J({error:'faltam title, category_id ou sku.partnerId'},400);
    const payload:any={title:p.title,description:p.description||p.title,category:{id:Number(p.category_id)},brand:{id:Number(p.brand_id||2903496)},origin:{id:0},
      priceFactor:1,calculatedPrice:false,definitionPriceScope:'SKU_MARKETPLACE',height:Number(p.height),width:Number(p.width),length:Number(p.length),weight:Number(p.weight),
      images:(p.images||[]).slice(0,10).map((u:string,i:number)=>({url:u,main:i===0,index:i+1})),characteristics:(p.characteristics||[]).map((x:any,i:number)=>({index:i+1,name:x.name,value:String(x.value)})),
      skus:[{title:s.title||p.title,partnerId:String(s.partnerId),ean:s.ean?String(s.ean):undefined,price:Number(s.price),amount:Number(s.amount||0)}]};
    if(b.confirmar!==true) return J({preview:payload});
    const r=await fetch(`${base}/products`,{method:'POST',headers:H,body:JSON.stringify(payload)}); const t=await r.text();
    await c.queryObject({text:`INSERT INTO anymarket_produto_patch_log (product_id,antes,patch,http,resposta) VALUES ($1,$2,$3,$4,$5)`,args:['novo:'+s.partnerId,'{}',JSON.stringify({criar:payload.title}),r.status,t.slice(0,400)]});
    let j:any=null; try{j=JSON.parse(t);}catch{}
    return J({ok:r.status>=200&&r.status<300,http:r.status,product_id:j?.id,skus:(j?.skus||[]).map((k:any)=>({id:k.id,partnerId:k.partnerId})),erro:r.status>=300?t.slice(0,400):undefined});
  }catch(e){ return J({error:String(e).slice(0,300)},500);} finally{ await c.end(); }
});
