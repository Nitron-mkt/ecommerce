// comando-dados v34 (+ galeria de fotos por referência em grupos/criar) = v33: v32 (Ricardo-PC: criar=todos 155 fora-any + categoria grupo Sankhya + visão; fora_hub; precoany; precohub; pendencias)
//   + (Claude, reaplicado da v25) status Shopee REAL por canal (v_shopee_status), Shopee excluído/fora fora do "real" e do fora_hub,
//     'oids' (todas as ofertas Anymarket do mesmo anúncio ML), oid preferindo a própria ref, disp/reservado em criar,
//     + concorrência SHOPEE (shopee_concorrente) por referência. ?secret=nitron-radar-9f4c2a
import { Client } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';
const DB=Deno.env.get('SUPABASE_DB_URL')!;
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,apikey','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json'};
const EMP=`CASE WHEN conta ~* 'mundo' THEN 'Mundo UD' WHEN conta ~* 'nitron|vida casa' THEN 'Nitron' ELSE conta END`;
const FOTO=`(SELECT link_principal FROM produto_foto pf WHERE pf.referencia=co.referencia LIMIT 1)`;
const SHVIVO=`COALESCE(sp.status,'NORMAL') NOT IN ('SELLER_DELETE','SHOPEE_DELETE')`;
const SHST=`CASE WHEN sp.status='UNLIST' THEN 'Pausado' WHEN sp.status='BANNED' THEN 'Banido' WHEN sp.status='REVIEWING' THEN 'Em revisão' WHEN sp.estoque IS NOT NULL AND sp.estoque<=0 THEN 'Sem estoque' ELSE 'Ativo' END`;
const SHREAL=`(SELECT json_object_agg(loja, obj) FROM (SELECT loja, json_build_object('preco',min(preco),'n',count(*),'url',(array_agg('https://shopee.com.br/product/'||shop_id||'/'||item_id ORDER BY (${SHST})='Ativo' DESC, preco))[1],'st',(array_agg(${SHST} ORDER BY (${SHST})='Ativo' DESC, preco))[1],'itens',json_agg(json_build_object('preco',preco,'nome',nome,'st',${SHST},'estoque',estoque,'url','https://shopee.com.br/product/'||shop_id||'/'||item_id) ORDER BY preco)) obj FROM shopee_produto sp WHERE sp.referencia=co.referencia AND preco>0 AND ${SHVIVO} GROUP BY loja) z)`;
const MLREAL=`(SELECT json_object_agg(loja, obj) FROM (SELECT loja, json_build_object('preco',min(preco_atual),'n',count(*),'url',(array_agg('https://produto.mercadolivre.com.br/'||replace(listing_id,'MLB','MLB-') ORDER BY preco_atual))[1],'itens',json_agg(json_build_object('preco',preco_atual,'lid',listing_id,'titulo',titulo,'url','https://produto.mercadolivre.com.br/'||replace(listing_id,'MLB','MLB-')) ORDER BY preco_atual)) obj FROM anuncio_proprio ap WHERE ap.ref_casada=co.referencia AND ap.plataforma='ML' AND ap.preco_atual>0 AND ap.listing_id IS NOT NULL GROUP BY loja) z)`;
const ANUNCIO=`json_build_object('lid',listing_id,'titulo',titulo,'preco',preco_atual,'custo',custo_total,'fee',fee_real,'fee_pct',CASE WHEN preco_atual>0 THEN round((fee_real/preco_atual)::numeric,4) END,'frete',frete_real,'free',free_shipping,'margem',margem_real,'be',breakeven_real,'alvo',preco_alvo_real,'oid',(SELECT aa.id FROM anymarket_anuncio aa WHERE aa.id_no_marketplace=a.listing_id ORDER BY (aa.referencia=a.ref_casada) DESC, aa.id LIMIT 1),'oids',(SELECT json_agg(json_build_object('oid',aa.id,'ref',aa.referencia,'preco',aa.preco) ORDER BY aa.referencia, aa.id) FROM anymarket_anuncio aa WHERE aa.id_no_marketplace=a.listing_id),'st',COALESCE(ml_status,(SELECT aa.marketplace_status FROM anymarket_anuncio aa WHERE aa.id_no_marketplace=a.listing_id LIMIT 1)),'link',(SELECT aa.permalink FROM anymarket_anuncio aa WHERE aa.id_no_marketplace=a.listing_id LIMIT 1),'concos',(SELECT json_agg(v) FROM (VALUES(conco1),(conco2),(conco3)) t(v) WHERE v IS NOT NULL AND v>0))`;
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:CORS});
  const u=new URL(req.url); const c=new Client(DB); await c.connect();
  try{
    const app=(await c.queryObject`SELECT state_secret FROM ml_oauth_app WHERE id=1`).rows[0] as any;
    if(!app||u.searchParams.get('secret')!==app.state_secret) return new Response(JSON.stringify({error:'secret'}),{status:403,headers:CORS});

    const resumo=(await c.queryObject`SELECT count(*)::int universo, count(*) FILTER (WHERE na_tabela_155)::int na_155, count(*) FILTER (WHERE is_kit)::int kits, count(*) FILTER (WHERE no_anymarket)::int no_any, count(*) FILTER (WHERE na_tabela_155 AND NOT no_anymarket)::int m155_fora_any, count(*) FILTER (WHERE no_anymarket AND NOT na_tabela_155)::int any_fora_155, count(*) FILTER (WHERE any_ml>0)::int any_ml, count(*) FILTER (WHERE real_ml>0)::int real_ml, count(*) FILTER (WHERE real_ml>0 AND any_ml=0)::int ml_real_sem_any, count(*) FILTER (WHERE any_shopee>0)::int any_shopee FROM v_conciliacao_ref`).rows[0];
    (resumo as any).shopee_real = ((await c.queryObject`SELECT count(DISTINCT referencia)::int n FROM shopee_produto WHERE referencia IS NOT NULL AND COALESCE(status,'NORMAL') NOT IN ('SELLER_DELETE','SHOPEE_DELETE')`).rows[0] as any).n;
    (resumo as any).conc_refs = ((await c.queryObject`SELECT count(DISTINCT referencia)::int n FROM vw_concorrencia_ref`).rows[0] as any).n;
    (resumo as any).conc_sellers = ((await c.queryObject`SELECT count(DISTINCT seller_id)::int n FROM revenda_anuncio WHERE NOT eh_nitron`).rows[0] as any).n;
    const plataformas=(await c.queryObject`SELECT code, nome, principal FROM anymarket_marketplace ORDER BY principal DESC, nome`).rows;
    const linhas=(await c.queryObject`SELECT DISTINCT linha FROM precificacao_produto WHERE linha IS NOT NULL ORDER BY linha`).rows.map((r:any)=>r.linha);
    const canais=(await c.queryObject(`SELECT DISTINCT marketplace, conta, ${EMP} empresa FROM anymarket_anuncio WHERE marketplace<>'SHOPIFY' ORDER BY marketplace,conta`)).rows;
    const any_counts=(await c.queryObject(`SELECT marketplace, ${EMP} empresa, count(DISTINCT referencia)::int refs, count(*)::int anuncios FROM anymarket_anuncio WHERE marketplace<>'SHOPIFY' GROUP BY 1,2`)).rows;
    const real_counts=(await c.queryObject`SELECT loja empresa, count(DISTINCT ref_casada)::int refs FROM anuncio_proprio WHERE plataforma='ML' AND ref_casada IS NOT NULL GROUP BY 1`).rows;
    const shopee_counts=(await c.queryObject`WITH sp AS (SELECT DISTINCT referencia, loja FROM shopee_produto WHERE referencia IS NOT NULL AND preco>0 AND COALESCE(status,'NORMAL') NOT IN ('SELLER_DELETE','SHOPEE_DELETE') AND char_length(referencia)=11 AND referencia LIKE '___.___.___'), hub AS (SELECT DISTINCT referencia FROM anymarket_anuncio WHERE marketplace='SHOPEE') SELECT loja empresa, count(*)::int raspadas, count(*) FILTER (WHERE referencia IN (SELECT referencia FROM hub))::int com_hub, count(*) FILTER (WHERE referencia NOT IN (SELECT referencia FROM hub))::int fora_hub FROM sp GROUP BY loja`).rows;
    const empresas=[...new Set([...any_counts.map((r:any)=>r.empresa),...real_counts.map((r:any)=>r.empresa)])].sort();
    const config=(await c.queryObject`SELECT loja, plataforma, regime, imposto_pct::float imposto_pct, embalagem::float embalagem, margem_alvo::float margem_alvo, custo_liquido FROM precificacao_config`).rows;
    const taxa_shopee=(await c.queryObject`SELECT valor_min::float valor_min, valor_max::float valor_max, comissao_pct::float comissao_pct, taxa_fixa::float taxa_fixa FROM taxa_shopee ORDER BY valor_min`).rows;
    const taxa_ml=(await c.queryObject`SELECT valor_min::float valor_min, valor_max::float valor_max, custo_fixo::float custo_fixo FROM taxa_ml ORDER BY valor_min`).rows;
    // status real Shopee por id_no_marketplace (item ou variação)
    const shStRows=(await c.queryObject`SELECT id, st, estoque, status_raw FROM v_shopee_status`).rows as any[];
    const shSt:Record<string,any>={}; for(const r of shStRows) shSt[r.id]={st:r.st,estoque:r.estoque==null?null:Number(r.estoque),raw:r.status_raw};

    const grupos=(await c.queryObject(`
      WITH a AS (SELECT ref_casada, loja, listing_id, titulo, preco_atual, custo_total, fee_real, frete_real, free_shipping, margem_real, breakeven_real, preco_alvo_real, ml_status, conco1, conco2, conco3 FROM anuncio_proprio WHERE plataforma='ML' AND ref_casada IS NOT NULL),
      g AS (SELECT ref_casada, json_agg(${ANUNCIO} ORDER BY preco_atual) FILTER (WHERE loja='Nitron') nitron, json_agg(${ANUNCIO} ORDER BY preco_atual) FILTER (WHERE loja='Mundo UD') mundoud FROM a GROUP BY ref_casada)
      SELECT co.referencia ref, co.descricao descr, pp.linha, pp.marca, pp.custo155::float custo155, co.custo_final::float custo_final, co.custo_final_fonte fonte, pp.preco_praticado::float prat, pp.preco_ultimo::float prat_ult, pp.praticado_vezes prat_vezes, (COALESCE(pp.estoque_nitron,0)+COALESCE(pp.estoque_extrema,0)) estoque, pp.estoque_nitron est_nit, pp.estoque_extrema est_ext, (COALESCE(pp.reservado_nitron,0)+COALESCE(pp.reservado_extrema,0)) reservado, co.is_kit, co.na_tabela_155 na_155,
        (SELECT product_id FROM anymarket_sku s WHERE s.referencia=co.referencia LIMIT 1) product_id, ${FOTO} foto, (SELECT galeria FROM produto_foto pf WHERE pf.referencia=co.referencia) galeria, ${SHREAL} shopee_real, ${MLREAL} ml_real,
        COALESCE(g.nitron,'[]'::json) nitron, COALESCE(g.mundoud,'[]'::json) mundoud, ca.canais,
        CASE WHEN vc.referencia IS NOT NULL THEN json_build_object('ofertas',vc.ofertas,'min',vc.preco_min,'medio',vc.preco_medio,'max',vc.preco_max,'oficiais',vc.lojas_oficiais) END conc
      FROM v_conciliacao_ref co
      LEFT JOIN precificacao_produto pp ON pp.referencia=co.referencia
      LEFT JOIN g ON g.ref_casada=co.referencia
      LEFT JOIN v_canais_ref ca ON ca.referencia=co.referencia
      LEFT JOIN vw_concorrencia_ref vc ON vc.referencia=co.referencia
      WHERE g.ref_casada IS NOT NULL OR ca.referencia IS NOT NULL
      ORDER BY co.referencia`)).rows as any[];
    // canais Shopee: status do Anymarket -> status REAL da loja (quando o item/variação foi encontrado na Shopee)
    for(const g of grupos){ for(const ch of (g.canais||[])){ if(ch.marketplace==='SHOPEE'){ const r=shSt[String(ch.id||'')]; if(r){ ch.st_any=ch.status; ch.status=r.st; ch.st_real=r.st; ch.estoque_mp=r.estoque; } else if(ch.id){ ch.st_any=ch.status; ch.st_real=null; } } } }

    const CATLINHA=`CASE
        WHEN pp.linha ILIKE 'Linha Potes' OR pp.linha ILIKE 'Linha Coloratto' THEN 'Potes'
        WHEN pp.linha ILIKE 'Linha Organiza%' OR pp.linha ILIKE 'Linha ECO' THEN 'Organização'
        WHEN pp.linha ILIKE 'Linha Cozinha' THEN 'Cozinha'
        WHEN pp.linha ILIKE 'Linha Lixeiras' THEN 'Lixeiras'
        WHEN pp.linha ILIKE 'Linha Realce' OR pp.linha ILIKE 'Decor%' THEN 'Decor'
        WHEN pp.linha ILIKE 'Teca%' THEN 'Teca'
        WHEN pp.linha ILIKE 'Linha Banheiro' THEN 'Banheiro'
        WHEN pp.linha ILIKE 'Linha Micro%' THEN 'Micro-Ondas'
        WHEN pp.linha ILIKE 'Linha Jarras' THEN 'Jarras'
        WHEN pp.linha ILIKE 'Linha Frasqueira%' THEN 'Frasqueiras'
        WHEN pp.linha ILIKE 'Linha Limpeza' THEN 'Limpeza'
        WHEN pp.linha ILIKE 'Linha Geladeira' THEN 'Geladeira'
        WHEN pp.linha ILIKE 'Linha Infantil' THEN 'Infantil'
        ELSE NULL END`;
    const criar=(await c.queryObject(`SELECT co.referencia ref, COALESCE(an.titulo, co.descricao) titulo, COALESCE(an.descrprod, co.descricao) descrprod,
        ${CATLINHA} categoria_grupo, pp.linha,
        an.preco_sugerido::float preco_sugerido,
        COALESCE(an.foto, pf.link_principal) foto,
        COALESCE(pf.n_fotos, an.n_fotos, 0) n_fotos, pf.galeria,
        COALESCE(an.ean, pr.ean) ean, an.cor,
        (COALESCE(an.foto, pf.link_principal) IS NOT NULL) tem_foto,
        (${CATLINHA} IS NOT NULL) tem_cat,
        (COALESCE(pp.estoque_nitron,0)+COALESCE(pp.estoque_extrema,0)) estoque_cd,
        (COALESCE(pp.reservado_nitron,0)+COALESCE(pp.reservado_extrema,0))::float reservado,
        CASE WHEN pp.referencia IS NOT NULL THEN (COALESCE(pp.estoque_nitron,0)+COALESCE(pp.estoque_extrema,0)-COALESCE(pp.reservado_nitron,0)-COALESCE(pp.reservado_extrema,0))::float END disp,
        cv.categoria_visao, cv.confianca::float visao_conf, cv.concorda visao_ok
      FROM v_conciliacao_ref co
      LEFT JOIN anuncio_novo an ON an.referencia=co.referencia
      LEFT JOIN precificacao_produto pp ON pp.referencia=co.referencia
      LEFT JOIN produto_foto pf ON pf.referencia=co.referencia
      LEFT JOIN preco_produto pr ON pr.referencia=co.referencia
      LEFT JOIN anuncio_cat_visao cv ON cv.referencia=co.referencia
      WHERE co.na_tabela_155 AND co.no_anymarket IS NOT TRUE
      ORDER BY (COALESCE(an.foto, pf.link_principal) IS NOT NULL) DESC, co.referencia`)).rows;

    const revendedores=(await c.queryObject`SELECT nome seller_nick, 'Mercado Livre' marketplace, cnpj_digitos, razao_social, cidade municipio, uf, n_catalogos n_anuncios, eh_cliente, cnpj_status, ('https://www.mercadolivre.com.br/perfil/'||nome) seller_url, anuncios FROM v_revendedor_anuncios ORDER BY n_catalogos DESC NULLS LAST`).rows;

    const ofertas=(await c.queryObject`SELECT pp.referencia ref, json_agg(json_build_object('preco',ra.price,'seller',COALESCE(sm.nome,ra.seller_nick),'url',ra.url,'oficial',ra.is_official_store,'full',ra.is_full,'titulo',ra.title,'mp',ra.marketplace,'tipo',ra.listing_type,'catalogo',ra.catalog_id,'eh_nitron',ra.eh_nitron) ORDER BY ra.price) m FROM revenda_anuncio ra JOIN preco_produto pp ON pp.ean=ra.ean_busca LEFT JOIN revenda_seller_ml sm ON sm.seller_id::text=ra.seller_id::text WHERE ra.price>0 GROUP BY pp.referencia`).rows;
    // concorrência SHOPEE (shopee-conc-scan): ofertas de outras lojas por referência
    const ofsh=(await c.queryObject`SELECT referencia ref, max(captured_em) em, json_agg(json_build_object('preco',preco::float,'loja',loja_nome,'shop_id',shop_id,'nome',nome,'url',url,'vendidos',vendidos,'rating',rating,'oficial',oficial,'eh_nosso',eh_nosso) ORDER BY preco) m FROM shopee_concorrente WHERE preco>0 GROUP BY referencia`).rows as any[];
    const ofertas_shopee:any={}; for(const o of ofsh) ofertas_shopee[o.ref]={em:o.em,ofertas:o.m};
    const shopee_scan=(await c.queryObject`SELECT count(*)::int refs, count(*) FILTER (WHERE erro IS NULL)::int ok, max(scan_em) ultimo, (array_agg(erro ORDER BY scan_em DESC) FILTER (WHERE erro IS NOT NULL))[1] ultimo_erro FROM shopee_conc_scan`).rows[0];

    const conc=(await c.queryObject(`
      WITH acc AS (SELECT referencia, marketplace, ${EMP} empresa, count(*) n FROM anymarket_anuncio WHERE marketplace<>'SHOPIFY' GROUP BY 1,2,3),
      accj AS (SELECT referencia, json_object_agg(marketplace||'|'||empresa, n) m FROM acc GROUP BY referencia),
      realml AS (SELECT ref_casada referencia, 'MERCADO_LIVRE|'||loja k, count(*) n FROM anuncio_proprio WHERE plataforma='ML' AND ref_casada IS NOT NULL GROUP BY 1,2),
      realsh AS (SELECT referencia, 'SHOPEE|'||loja k, count(*) n FROM shopee_produto sp WHERE referencia IS NOT NULL AND ${SHVIVO} GROUP BY 1,2),
      realj AS (SELECT referencia, json_object_agg(k, n) m FROM (SELECT * FROM realml UNION ALL SELECT * FROM realsh) x GROUP BY referencia),
      rep AS (SELECT DISTINCT ON (referencia, marketplace, ${EMP}) referencia, marketplace, ${EMP} empresa, preco, permalink, id oid, id_no_marketplace mpid, marketplace_status st FROM anymarket_anuncio WHERE marketplace<>'SHOPIFY' ORDER BY referencia, marketplace, ${EMP}, (marketplace_status='active') DESC, preco),
      precoj AS (SELECT referencia, json_object_agg(marketplace||'|'||empresa, json_build_object('preco',preco,'link',permalink,'oid',oid,'mpid',mpid,'st',st)) m FROM rep GROUP BY referencia)
      SELECT co.referencia ref, co.descricao, co.is_kit, co.na_tabela_155 na_155, co.custo_final::float custo_final, co.estoque_disp estoque, co.no_anymarket, co.any_ml, co.real_ml,
        (SELECT linha FROM precificacao_produto pl WHERE pl.referencia=co.referencia) linha,
        (SELECT product_id FROM anymarket_sku s WHERE s.referencia=co.referencia LIMIT 1) product_id, ${FOTO} foto, ${SHREAL} shopee_real, ${MLREAL} ml_real,
        accj.m any_canais, realj.m real_canais, precoj.m preco_canais
      FROM v_conciliacao_ref co LEFT JOIN accj ON accj.referencia=co.referencia LEFT JOIN realj ON realj.referencia=co.referencia LEFT JOIN precoj ON precoj.referencia=co.referencia
      ORDER BY co.referencia`)).rows as any[];
    for(const x of conc){ const m=x.preco_canais||{}; for(const k of Object.keys(m)){ if(k.startsWith('SHOPEE|')){ const r=shSt[String(m[k].mpid||'')]; if(r){ m[k].st_any=m[k].st; m[k].st=r.st; } } } }

    const vendas=(await c.queryObject`SELECT
      (SELECT json_build_object('receita',round(sum(total)::numeric,0),'pedidos',count(*),'itens',(SELECT count(*) FROM anymarket_pedido_item),'de',min(payment_date),'ate',max(payment_date)) FROM anymarket_pedido WHERE status NOT IN ('CANCELED','CANCELLED')) resumo,
      (SELECT json_agg(x ORDER BY (x->>'receita')::numeric DESC) FROM (SELECT json_build_object('mp',marketplace,'pedidos',count(*),'receita',round(sum(total)::numeric,0)) x FROM anymarket_pedido WHERE status NOT IN ('CANCELED','CANCELLED') AND marketplace IS NOT NULL GROUP BY marketplace) a) por_mp,
      (SELECT json_agg(x ORDER BY (x->>'receita')::numeric DESC) FROM (SELECT json_build_object('emp',empresa,'pedidos',count(*),'receita',round(sum(total)::numeric,0)) x FROM anymarket_pedido WHERE status NOT IN ('CANCELED','CANCELLED') AND empresa IS NOT NULL GROUP BY empresa) a) por_emp,
      (SELECT json_agg(x ORDER BY (x->>'mes')) FROM (SELECT json_build_object('mes',to_char(date_trunc('month',payment_date),'YYYY-MM'),'receita',round(sum(total)::numeric,0),'pedidos',count(*)) x FROM anymarket_pedido WHERE status NOT IN ('CANCELED','CANCELLED') AND payment_date IS NOT NULL GROUP BY date_trunc('month',payment_date)) a) por_mes,
      (SELECT json_agg(x ORDER BY (x->>'classe')) FROM (SELECT json_build_object('classe',classe_abc,'refs',count(*),'receita',round(sum(receita)::numeric,0)) x FROM v_vendas_ref GROUP BY classe_abc) a) abc` ).rows[0];
    const vendas_top=(await c.queryObject`SELECT referencia ref, round(qtd::numeric,0)::float qtd, round(receita::numeric,0)::float receita, classe_abc classe, round(COALESCE(qtd_ml,0)::numeric,0)::float qtd_ml, round(COALESCE(qtd_shopee,0)::numeric,0)::float qtd_shopee, round(COALESCE(qtd_nitron,0)::numeric,0)::float qtd_nitron, round(COALESCE(qtd_mundoud,0)::numeric,0)::float qtd_mundoud, pct_receita::float pct, pedidos::int pedidos, ultima, (SELECT titulo FROM anymarket_pedido_item ai WHERE ai.referencia=v.referencia AND titulo IS NOT NULL LIMIT 1) descr, (SELECT (COALESCE(estoque_nitron,0)+COALESCE(estoque_extrema,0))::int FROM precificacao_produto pp WHERE pp.referencia=v.referencia) estoque_cd, (SELECT (COALESCE(estoque_nitron,0)+COALESCE(estoque_extrema,0)-COALESCE(reservado_nitron,0)-COALESCE(reservado_extrema,0))::int FROM precificacao_produto pp WHERE pp.referencia=v.referencia) disp FROM v_vendas_ref v ORDER BY receita DESC LIMIT 300`).rows;
    const taxa_real_rows=(await c.queryObject`SELECT referencia ref, loja, fee_pct::float fee_pct, unidades FROM v_taxa_real_ml`).rows;
    const taxa_real:any={}; for(const t of taxa_real_rows as any[]){(taxa_real[t.ref]=taxa_real[t.ref]||{})[t.loja]={pct:t.fee_pct,un:t.unidades};}

    const ofMap:any={}; for(const o of ofertas as any[]) ofMap[o.ref]=o.m;

    const v30rows=(await c.queryObject`SELECT i.referencia ref, SUM(i.amount)::float qtd, SUM(i.total)::float receita FROM anymarket_pedido_item i JOIN anymarket_pedido p ON p.id=i.pedido_id WHERE p.payment_date > now()-interval '30 days' AND p.status NOT IN ('CANCELED','CANCELLED') AND i.referencia IS NOT NULL GROUP BY 1`).rows;
    const vendas30:any={}; for(const v of v30rows as any[]){ vendas30[v.ref]={qtd:v.qtd,receita:v.receita}; }

    const r10rows=(await c.queryObject`SELECT DISTINCT ON (offer_id) offer_id::text oid, preco_novo::float preco, em FROM anymarket_preco_log WHERE origem='floor10-todos' AND resultado='ok' ORDER BY offer_id, em DESC`).rows;
    const reprec10:any={}; for(const r of r10rows as any[]){ reprec10[r.oid]={p:r.preco,em:r.em}; }

    const hubrows=(await c.queryObject`SELECT DISTINCT ON (offer_id) offer_id::text oid, preco_novo::float p, em FROM anymarket_preco_log WHERE resultado='ok' AND preco_novo IS NOT NULL AND em>now()-interval '21 days' ORDER BY offer_id, em DESC`).rows;
    const precohub:any={}; for(const r of hubrows as any[]){ precohub[r.oid]={p:r.p,em:r.em}; }

    const anyrows=(await c.queryObject`SELECT id::text oid, preco::float p, atualizado_em em FROM anymarket_anuncio WHERE marketplace IN ('MERCADO_LIVRE','SHOPEE') AND preco>0`).rows;
    const precoany:any={}; for(const r of anyrows as any[]){ precoany[r.oid]={p:r.p,em:r.em}; }

    const pendrows=(await c.queryObject`WITH last AS (SELECT DISTINCT ON (offer_id, marketplace) offer_id::text oid, referencia ref, marketplace, conta, preco_novo::float preco_novo, http, resultado, em FROM anymarket_preco_log WHERE em>now()-interval '30 days' ORDER BY offer_id, marketplace, em DESC) SELECT oid, ref, marketplace, conta, preco_novo, http, substring(resultado for 180) motivo, em FROM last WHERE resultado<>'ok' ORDER BY ref`).rows;
    const pendencias={auto_calc:pendrows};

    const fora_hub=(await c.queryObject`WITH sp AS (SELECT referencia, min(loja) loja, min(item_id) item_id, round(min(preco)::numeric,2) preco, (array_agg('https://shopee.com.br/product/'||shop_id||'/'||item_id ORDER BY preco))[1] url FROM shopee_produto WHERE referencia IS NOT NULL AND preco>0 AND COALESCE(status,'NORMAL') NOT IN ('SELLER_DELETE','SHOPEE_DELETE') AND char_length(referencia)=11 AND referencia LIKE '___.___.___' AND referencia NOT IN (SELECT referencia FROM anymarket_anuncio WHERE marketplace='SHOPEE') AND referencia NOT IN (SELECT referencia FROM anymarket_sku) GROUP BY referencia) SELECT referencia ref, loja, item_id::text item_id, preco::float preco, url, (SELECT custo155::float FROM precificacao_produto p WHERE p.referencia=sp.referencia) custo, (SELECT (COALESCE(estoque_nitron,0)+COALESCE(estoque_extrema,0))::int FROM precificacao_produto p WHERE p.referencia=sp.referencia) estoque, (sp.referencia IN (SELECT referencia FROM v_conciliacao_ref WHERE na_tabela_155)) na_155, (sp.referencia IN (SELECT ref_casada FROM anuncio_proprio WHERE plataforma='ML')) tem_ml FROM sp ORDER BY (SELECT custo155 FROM precificacao_produto p WHERE p.referencia=sp.referencia) DESC NULLS LAST, referencia`).rows;

    return new Response(JSON.stringify({gerado_em:new Date().toISOString(),resumo,plataformas,linhas,empresas,canais_disponiveis:canais,any_counts,real_counts,shopee_counts,config,taxa_shopee,taxa_ml,grupos,criar,revendedores,ofertas:ofMap,ofertas_shopee,shopee_scan,conciliacao:conc,vendas,vendas_top,taxa_real,vendas30,reprec10,precohub,precoany,pendencias,fora_hub},(_k,v)=>typeof v==='bigint'?Number(v):v),{headers:CORS});
  }catch(e){ return new Response(JSON.stringify({error:String(e).slice(0,500)}),{status:500,headers:CORS}); } finally{ await c.end(); }
});
