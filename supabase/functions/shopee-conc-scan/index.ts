// shopee-conc-scan v2: concorrência na SHOPEE por referência, grava em shopee_concorrente.
// Fonte 1 (oficial): API de Afiliados Shopee (GraphQL productOfferV2) — credencial em shopee_afiliado_config (app_id, secret).
// Fonte 2 (fallback): busca pública do site (hoje bloqueada por anti-bot 90309999 a partir de servidores).
// GET ?secret=…&acao=probe&q=texto          → testa a busca (diagnóstico)
// GET ?secret=…&ref=004.006.003             → varre 1 referência
// GET ?secret=…&lote=5                      → varre as N referências mais antigas (nossas refs ativas na Shopee)
import { Client } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';
const DB=Deno.env.get('SUPABASE_DB_URL')!;
const NOSSAS_LOJAS=['704493455','426417349'];
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,apikey','Access-Control-Allow-Methods':'GET,OPTIONS','Content-Type':'application/json'};
const J=(o:any,s=200)=>new Response(JSON.stringify(o,(_k,v)=>typeof v==='bigint'?Number(v):v),{status:s,headers:CORS});
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
async function sha256hex(s:string){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
// API de Afiliados: Authorization: SHA256 Credential={appId}, Timestamp={ts}, Signature=sha256(appId+ts+payload+secret)
async function buscaAfiliado(cfg:any,q:string,limit=30){
  const query=`{productOfferV2(keyword:${JSON.stringify(q)},sortType:1,page:1,limit:${limit}){nodes{itemId shopId productName price priceMin priceMax sales ratingStar shopName productLink offerLink shopType}}}`;
  const payload=JSON.stringify({query}); const ts=Math.floor(Date.now()/1000);
  const sig=await sha256hex(String(cfg.app_id)+ts+payload+String(cfg.secret));
  const r=await fetch(cfg.endpoint||'https://open-api.affiliate.shopee.com.br/graphql',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`SHA256 Credential=${cfg.app_id}, Timestamp=${ts}, Signature=${sig}`},body:payload});
  const t=await r.text(); let j:any=null; try{j=JSON.parse(t);}catch(_){}
  const nodes=j?.data?.productOfferV2?.nodes||[];
  const items=nodes.map((n:any)=>({itemid:Number(n.itemId),shopid:Number(n.shopId),name:n.productName,preco:Number(n.priceMin||n.price),historical_sold:n.sales,item_rating:{rating_star:n.ratingStar},shop_name:n.shopName,is_official_shop:(n.shopType||[]).includes?.(1)||false,url:n.productLink}));
  return {ok:items.length>0,items,tent:[{fonte:'afiliado',http:r.status,err:j?.errors?.[0]?.message??null,n:items.length}]};
}
async function busca(q:string,limit=30){
  const urls=[
    `https://shopee.com.br/api/v4/search/search_items?by=relevancy&keyword=${encodeURIComponent(q)}&limit=${limit}&newest=0&order=desc&page_type=search&scenario=PAGE_GLOBAL_SEARCH&version=2`,
    `https://shopee.com.br/api/v2/search_items/?by=relevancy&keyword=${encodeURIComponent(q)}&limit=${limit}&newest=0&order=desc&page_type=search`,
  ];
  const tent:any[]=[];
  for(const url of urls){
    const r=await fetch(url,{headers:{'User-Agent':UA,'Accept':'application/json','x-api-source':'pc','x-shopee-language':'pt-BR','Referer':'https://shopee.com.br/search?keyword='+encodeURIComponent(q)}});
    const t=await r.text(); let j:any=null; try{j=JSON.parse(t);}catch(_){}
    const items=(j?.items||[]).map((x:any)=>x.item_basic||x).filter((b:any)=>b&&b.itemid);
    tent.push({http:r.status,err:j?.error??null,n:items.length});
    if(items.length) return {ok:true,items,tent};
  }
  return {ok:false,items:[],tent};
}
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:CORS});
  const u=new URL(req.url); const c=new Client(DB); await c.connect();
  try{
    const app=(await c.queryObject`SELECT state_secret FROM ml_oauth_app WHERE id=1`).rows[0] as any;
    if(!app||u.searchParams.get('secret')!==app.state_secret) return J({error:'secret'},403);
    const af=(await c.queryObject`SELECT app_id, secret, endpoint FROM shopee_afiliado_config WHERE id=1 AND app_id IS NOT NULL AND secret IS NOT NULL`).rows[0] as any;
    const buscar=async(q:string,lim=30)=>{ if(af){ const a=await buscaAfiliado(af,q,lim); if(a.ok) return a; const p=await busca(q,lim); return {...p,tent:[...a.tent,...p.tent]}; } return await busca(q,lim); };
    if(u.searchParams.get('acao')==='probe'){ const b=await buscar(u.searchParams.get('q')||'tabua de corte',10); return J({ok:b.ok,tent:b.tent,fonte:af?'afiliado':'publica',amostra:b.items.slice(0,3).map((x:any)=>({nome:x.name,preco:x.preco??x.price/100000,shop:x.shopid}))}); }
    let refs:string[]=[];
    if(u.searchParams.get('ref')) refs=[u.searchParams.get('ref')!];
    else{
      const n=Math.min(10,Math.max(1,Number(u.searchParams.get('lote')||5)));
      refs=(await c.queryObject({text:`SELECT DISTINCT sp.referencia, s.scan_em FROM shopee_produto sp LEFT JOIN shopee_conc_scan s ON s.referencia=sp.referencia
        WHERE sp.referencia IS NOT NULL AND sp.status='NORMAL' ORDER BY s.scan_em NULLS FIRST LIMIT $1`,args:[n]})).rows.map((r:any)=>r.referencia);
    }
    const out:any[]=[];
    for(const ref of refs){
      const info=(await c.queryObject({text:`SELECT COALESCE(pp.descrprod,(SELECT nome FROM shopee_produto WHERE referencia=$1 LIMIT 1)) descr,
          (SELECT min(preco) FROM shopee_produto WHERE referencia=$1 AND preco>0 AND status='NORMAL')::float nosso
        FROM (SELECT 1) x LEFT JOIN precificacao_produto pp ON pp.referencia=$1`,args:[ref]})).rows[0] as any;
      // palavra-chave: descrição Sankhya sem códigos/cor entre parênteses, até 6 palavras
      const kw=String(info?.descr||'').replace(/\(.*?\)/g,' ').replace(/[-–]/g,' ').replace(/\s+/g,' ').trim().split(' ').slice(0,6).join(' ');
      if(!kw){ out.push({ref,erro:'sem descrição'}); continue; }
      const b=await buscar(kw,30);
      if(!b.ok){ await c.queryObject({text:`INSERT INTO shopee_conc_scan (referencia,keyword,scan_em,n,erro) VALUES ($1,$2,now(),0,$3) ON CONFLICT (referencia) DO UPDATE SET keyword=EXCLUDED.keyword,scan_em=now(),n=0,erro=EXCLUDED.erro`,args:[ref,kw,JSON.stringify(b.tent).slice(0,300)]}); out.push({ref,kw,erro:b.tent}); continue; }
      const nosso=+info?.nosso||0; let n=0;
      await c.queryObject({text:`DELETE FROM shopee_concorrente WHERE referencia=$1`,args:[ref]});
      for(const x of b.items){
        const preco=x.preco!=null?Number(x.preco):(x.price_min||x.price)/100000; if(!(preco>0)) continue;
        if(nosso>0 && (preco<nosso*0.35 || preco>nosso*3)) continue; // fora da faixa = provavelmente outro produto
        const shop=String(x.shopid);
        await c.queryObject({text:`INSERT INTO shopee_concorrente (referencia,keyword,shop_id,item_id,nome,preco,vendidos,rating,loja_nome,oficial,url,eh_nosso,captured_em)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now()) ON CONFLICT (referencia,item_id) DO UPDATE SET preco=EXCLUDED.preco,vendidos=EXCLUDED.vendidos,captured_em=now()`,
          args:[ref,kw,x.shopid,x.itemid,x.name,preco,x.historical_sold??x.sold??null,x.item_rating?.rating_star??null,x.shop_name??null,!!(x.is_official_shop||x.shopee_verified),x.url||`https://shopee.com.br/product/${x.shopid}/${x.itemid}`,NOSSAS_LOJAS.includes(shop)]}); n++;
      }
      await c.queryObject({text:`INSERT INTO shopee_conc_scan (referencia,keyword,scan_em,n,erro) VALUES ($1,$2,now(),$3,NULL) ON CONFLICT (referencia) DO UPDATE SET keyword=EXCLUDED.keyword,scan_em=now(),n=EXCLUDED.n,erro=NULL`,args:[ref,kw,n]});
      out.push({ref,kw,n}); await new Promise(r=>setTimeout(r,800));
    }
    return J({ok:true,out});
  }catch(e){ return J({error:String(e).slice(0,400)},500); } finally{ await c.end(); }
});
