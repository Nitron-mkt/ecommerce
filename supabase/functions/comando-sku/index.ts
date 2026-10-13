// comando-sku v1: resolve CONFLITOS (1 anúncio ML ↔ 2+ ofertas/cores) e "Manual por SKU" no Anymarket.
// GET  ?secret=…&acao=conflitos                      → lista anúncios ML com 2+ ofertas no Anymarket + itens que recusaram o PUT de preço em massa
// GET  ?secret=…&acao=info&offer_id=N                 → (leitura) produto/SKU no Anymarket: modo de preço (definitionPriceScope) e preços
// POST {secret,senha,confirmar:true,acao:'modo_mkt',offer_id}         → converte o produto p/ "por SKU e marketplace" (SKU_MARKETPLACE)
import { Client } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';
const DB=Deno.env.get('SUPABASE_DB_URL')!;
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,apikey','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json'};
const J=(o:any,s=200)=>new Response(JSON.stringify(o,(_k,v)=>typeof v==='bigint'?Number(v):v),{status:s,headers:CORS});
const N=(v:any)=>{const f=Number(v);return isFinite(f)?f:null;};
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
    const cfg=(await c.queryObject`SELECT token, base_url FROM anymarket_config WHERE id=1`).rows[0] as any;
    const base=(cfg.base_url||'https://api.anymarket.com.br/v2').replace(/\/$/,'');
    const H={'gumgaToken':cfg.token,'Content-Type':'application/json'};
    const anyGet=async(path:string)=>{const r=await fetch(base+path,{headers:H});const t=await r.text();let j:any=null;try{j=JSON.parse(t);}catch(_){};return {http:r.status,j,t};};

    if(acao==='conflitos'){
      const conflitos=(await c.queryObject(`
        WITH off AS (
          SELECT id_no_marketplace lid, conta, CASE WHEN conta ~* 'mundo' THEN 'Mundo UD' ELSE 'Nitron' END loja,
                 json_agg(json_build_object('oid',id,'ref',referencia,'sku_id',sku_id,'preco',preco,'st',marketplace_status) ORDER BY referencia,id) offers,
                 count(*)::int n_offers, count(DISTINCT referencia)::int n_refs, count(DISTINCT preco)::int n_precos,
                 min(preco)::float any_min, max(preco)::float any_max
          FROM anymarket_anuncio WHERE marketplace='MERCADO_LIVRE' AND id_no_marketplace IS NOT NULL
          GROUP BY 1,2 HAVING count(DISTINCT referencia)>1)
        SELECT off.*, ap.titulo, ap.preco_atual::float preco_ml, ap.ml_status, ap.free_shipping free,
               ap.breakeven_real::float be, ap.preco_alvo_real::float alvo, ap.margem_real::float margem,
               (SELECT json_agg(DISTINCT x.ref_casada) FROM anuncio_proprio x WHERE x.listing_id=off.lid AND x.ref_casada IS NOT NULL) refs_casadas
        FROM off LEFT JOIN LATERAL (SELECT * FROM anuncio_proprio a WHERE a.listing_id=off.lid AND a.plataforma='ML' ORDER BY (a.ref_casada IS NULL), a.calc_em DESC NULLS LAST LIMIT 1) ap ON true
        ORDER BY (off.n_precos>1) DESC, off.loja, off.lid`)).rows;
      // ofertas que o PUT em massa recusou (modo de preço do produto não é "por SKU e marketplace")
      const manuais=(await c.queryObject(`
        WITH e AS (
          SELECT offer_id, resultado msg, em FROM anymarket_preco_log WHERE resultado LIKE 'ERRO:%'
          UNION ALL
          SELECT (j->>'id')::bigint, 'ERRO: '||(j->>'errorMsg'), l.em FROM anymarket_preco_log l,
                 jsonb_array_elements(CASE WHEN l.resultado LIKE '[%' THEN l.resultado::jsonb ELSE '[]'::jsonb END) j)
        SELECT DISTINCT ON (e.offer_id) e.offer_id oid, e.msg, e.em, a.referencia ref, a.conta, a.marketplace, a.sku_id, a.preco::float preco, a.marketplace_status st, a.id_no_marketplace lid, s.product_id,
          CASE WHEN e.msg ILIKE '%Manual por SKU%' THEN 'MANUAL_SKU' WHEN e.msg ILIKE '%pelo custo%' THEN 'AUTO_CUSTO' ELSE 'OUTRO' END modo,
          (SELECT max(l2.em) FROM anymarket_preco_log l2 WHERE l2.offer_id=e.offer_id AND l2.resultado LIKE 'ok%') ok_em,
          (SELECT ap.preco_alvo_real::float FROM anuncio_proprio ap WHERE ap.listing_id=a.id_no_marketplace LIMIT 1) alvo,
          (SELECT ap.breakeven_real::float FROM anuncio_proprio ap WHERE ap.listing_id=a.id_no_marketplace LIMIT 1) be
        FROM e LEFT JOIN anymarket_anuncio a ON a.id=e.offer_id LEFT JOIN anymarket_sku s ON s.sku_id::text=a.sku_id::text
        ORDER BY e.offer_id, e.em DESC`)).rows.filter((r:any)=>!r.ok_em||new Date(r.ok_em)<new Date(r.em));
      return J({conflitos,manuais});
    }

    const oid=N(p('offer_id'));
    const off=oid?(await c.queryObject({text:`SELECT a.id, a.sku_id, a.referencia, a.marketplace, a.conta, a.preco, s.product_id FROM anymarket_anuncio a LEFT JOIN anymarket_sku s ON s.sku_id::text=a.sku_id::text WHERE a.id=$1`,args:[oid]})).rows[0] as any:null;
    if(!off) return J({error:'offer_id não encontrado'},404);
    if(!off.product_id) return J({error:'sem product_id p/ o SKU '+off.sku_id},400);

    if(acao==='info'){
      const pr=await anyGet(`/products/${off.product_id}`);
      const sk=await anyGet(`/products/${off.product_id}/skus/${off.sku_id}`);
      const P=pr.j||{};
      return J({offer:off,http_produto:pr.http,http_sku:sk.http,
        produto:{id:P.id,title:P.title,definitionPriceScope:P.definitionPriceScope,calculatedPrice:P.calculatedPrice,priceFactor:P.priceFactor,
          skus:(P.skus||[]).map((s:any)=>({id:s.id,partnerId:s.partnerId,title:s.title,price:s.price,sellPrice:s.sellPrice,amount:s.amount}))},
        sku:sk.j, bruto_produto:pr.j?undefined:pr.t.slice(0,600)});
    }

    if(acao==='modo_mkt'){
      // converte o modo de preço do PRODUTO (SKU ou COST) para SKU_MARKETPLACE: cada oferta/canal passa a ter preço próprio
      // e o PUT /skus/marketplaces/prices (comando-preco) volta a funcionar. Os preços atuais das ofertas ficam como estão.
      const pr=await anyGet(`/products/${off.product_id}`);
      if(pr.http!==200||!pr.j) return J({error:'GET produto falhou',http:pr.http,resposta:pr.t.slice(0,500)},502);
      const antes=pr.j.definitionPriceScope;
      if(antes==='SKU_MARKETPLACE') return J({modo:'nada a fazer',produto:off.product_id,definitionPriceScope:antes});
      if(body.confirmar!==true) return J({modo:'preview',produto:off.product_id,titulo:pr.j.title,de:antes,para:'SKU_MARKETPLACE',aviso:'envie confirmar:true + senha'});
      const conf=(await c.queryObject`SELECT senha_hash FROM comando_config WHERE id=1`).rows[0] as any;
      if(conf?.senha_hash){ if(!body.senha) return J({error:'senha exigida'},401); if(await sha(String(body.senha))!==conf.senha_hash) return J({error:'senha incorreta'},401); }
      const novo={...pr.j,definitionPriceScope:'SKU_MARKETPLACE',calculatedPrice:false};
      const r=await fetch(`${base}/products/${off.product_id}`,{method:'PUT',headers:H,body:JSON.stringify(novo)});
      const txt=await r.text();
      const dep=await anyGet(`/products/${off.product_id}`);
      const depois=dep.j?.definitionPriceScope; const ok=r.status>=200&&r.status<300&&depois==='SKU_MARKETPLACE';
      await c.queryObject({text:`INSERT INTO anymarket_preco_log (offer_id,sku_id,referencia,marketplace,conta,preco_antigo,preco_novo,http,resultado,origem) VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9)`,args:[off.id,off.sku_id,off.referencia,off.marketplace,off.conta,off.preco,r.status,ok?('ok modo '+antes+'->SKU_MARKETPLACE'):('ERRO modo: '+txt).slice(0,300),body.origem||'painel-modo']});
      return J({modo:'aplicado',ok,http:r.status,produto:off.product_id,de:antes,depois,resposta:ok?undefined:txt.slice(0,800)});
    }
    return J({error:'acao inválida'},400);
  }catch(e){ return J({error:String(e).slice(0,400)},500); } finally{ await c.end(); }
});
