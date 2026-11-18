// ml-item-info: leitura de anúncios do ML (sem expor token). GET ?secret=…&ids=MLB1,MLB2 ou &sku=SELLER_SKU (busca nas contas) → para cada id tenta as contas em ml_conta_token
// e devolve conta, título, status, preço, SELLER_SKU, GTIN, catálogo, user_product, categoria e vendas.
import { Client } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';
const DB=Deno.env.get('SUPABASE_DB_URL')!;
const J=(o:any,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json'}});
Deno.serve(async(req)=>{
  const u=new URL(req.url); const c=new Client(DB); await c.connect();
  try{
    const app=(await c.queryObject`SELECT state_secret FROM ml_oauth_app WHERE id=1`).rows[0] as any;
    if(!app||u.searchParams.get('secret')!==app.state_secret) return J({error:'secret'},403);
    const toks=(await c.queryObject`SELECT ml_user_id, nickname, access_token FROM ml_conta_token`).rows as any[];
    let ids=(u.searchParams.get('ids')||'').split(',').map(s=>s.trim()).filter(Boolean).slice(0,40);
    const sku=u.searchParams.get('sku');
    if(sku){ for(const t of toks){ const r=await fetch(`https://api.mercadolibre.com/users/${t.ml_user_id}/items/search?seller_sku=${encodeURIComponent(sku)}&limit=50`,{headers:{Authorization:'Bearer '+t.access_token}}); if(r.status===200){ const j:any=await r.json(); ids=ids.concat(j.results||[]); } } }
    const out:any[]=[];
    for(const id of ids){
      let achou:any=null;
      for(const t of toks){
        const r=await fetch(`https://api.mercadolibre.com/items/${id}`,{headers:{Authorization:'Bearer '+t.access_token}});
        if(r.status!==200) continue;
        const b:any=await r.json(); if(String(b.seller_id)!==String(t.ml_user_id)) continue;
        const at=(k:string)=>(b.attributes||[]).find((a:any)=>a.id===k)?.value_name??null;
        achou={id,conta:t.nickname,seller:b.seller_id,titulo:b.title,status:b.status,sub_status:b.sub_status,preco:b.price,seller_sku:at('SELLER_SKU'),gtin:at('GTIN'),cor:at('COLOR'),catalogo:b.catalog_listing,catalog_product_id:b.catalog_product_id,up:b.user_product_id,categoria:b.category_id,vendidos:b.sold_quantity,estoque:b.available_quantity,fotos:(b.pictures||[]).map((p:any)=>p.secure_url).slice(0,10),listing:b.listing_type_id,frete:b.shipping?.mode,dims:at('SELLER_PACKAGE_HEIGHT')+' x '+at('SELLER_PACKAGE_WIDTH')+' x '+at('SELLER_PACKAGE_LENGTH')+' / '+at('SELLER_PACKAGE_WEIGHT'),
          variacoes:(b.variations||[]).map((v:any)=>({id:v.id,comb:(v.attribute_combinations||[]).map((a:any)=>a.value_name).join('/'),sku:(v.attributes||[]).find((a:any)=>a.id==='SELLER_SKU')?.value_name??v.seller_custom_field??null}))};
        break;
      }
      out.push(achou||{id,erro:'não encontrado nas contas'});
    }
    return J({out});
  }catch(e){ return J({error:String(e).slice(0,300)},500);} finally{ await c.end(); }
});
