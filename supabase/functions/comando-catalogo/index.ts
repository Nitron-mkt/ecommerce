// comando-catalogo v3: + estoque CD (Sankhya Filial+Extrema − reservado) e linha. Posse pela NOSSA presenca real (anuncio catalogo no Anymarket) + preco. ?secret
import { Client } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';
const DB=Deno.env.get('SUPABASE_DB_URL')!;
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,apikey','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json'};
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:CORS});
  const u=new URL(req.url); const c=new Client(DB); await c.connect();
  try{
    const app=(await c.queryObject`SELECT state_secret FROM ml_oauth_app WHERE id=1`).rows[0] as any;
    if(!app||u.searchParams.get('secret')!==app.state_secret) return new Response(JSON.stringify({error:'secret'}),{status:403,headers:CORS});
    const rows=(await c.queryObject(`
      WITH aml AS (
        SELECT referencia, count(*) FILTER (WHERE is_catalog) cat, count(*) FILTER (WHERE NOT is_catalog) classico,
               min(preco) FILTER (WHERE is_catalog AND preco>0) our_cat_min,
               json_agg(json_build_object('conta',conta,'is_catalog',is_catalog,'st',marketplace_status,'id_mp',id_no_marketplace,'preco',preco) ORDER BY is_catalog DESC, preco) anuncios
        FROM anymarket_anuncio WHERE marketplace='MERCADO_LIVRE' GROUP BY referencia),
      own AS (
        SELECT pp.referencia,
          min(ra.price) FILTER (WHERE NOT ra.eh_nitron) comp_min,
          count(DISTINCT ra.catalog_id) n_catalogos,
          count(*) FILTER (WHERE NOT ra.eh_nitron) n_comp
        FROM revenda_anuncio ra JOIN preco_produto pp ON pp.ean=ra.ean_busca WHERE ra.catalog_id IS NOT NULL AND ra.price>0 GROUP BY pp.referencia)
      SELECT s.referencia ref, COALESCE(pp.descrprod,s.product_title) descr, s.product_id, (s.ean IS NOT NULL AND s.ean<>'') tem_ean, s.ean, pp.linha,
        COALESCE(aml.cat,0)::int cat, COALESCE(aml.classico,0)::int classico, aml.our_cat_min::float our_cat_min, aml.anuncios,
        o.comp_min::float comp_min, COALESCE(o.n_catalogos,0)::int n_catalogos, COALESCE(o.n_comp,0)::int n_comp,
        (SELECT link_principal FROM produto_foto pf WHERE pf.referencia=s.referencia LIMIT 1) foto,
        CASE WHEN pp.referencia IS NOT NULL THEN (COALESCE(pp.estoque_nitron,0)+COALESCE(pp.estoque_extrema,0))::float END estoque_cd,
        CASE WHEN pp.referencia IS NOT NULL THEN (COALESCE(pp.reservado_nitron,0)+COALESCE(pp.reservado_extrema,0))::float END reservado,
        CASE WHEN pp.referencia IS NOT NULL THEN (COALESCE(pp.estoque_nitron,0)+COALESCE(pp.estoque_extrema,0)-COALESCE(pp.reservado_nitron,0)-COALESCE(pp.reservado_extrema,0))::float END disp
      FROM anymarket_sku s
      LEFT JOIN precificacao_produto pp ON pp.referencia=s.referencia
      LEFT JOIN aml ON aml.referencia=s.referencia
      LEFT JOIN own o ON o.referencia=s.referencia
      WHERE COALESCE(aml.cat,0)+COALESCE(aml.classico,0) > 0 OR o.referencia IS NOT NULL
      ORDER BY COALESCE(aml.classico,0) DESC, s.referencia`)).rows;
    for(const r of rows as any[]){
      const presente = r.cat>0;                 // temos anuncio de CATALOGO no Anymarket
      let dono;
      if(presente){ dono = (r.comp_min!=null && r.our_cat_min!=null && +r.comp_min < +r.our_cat_min) ? 'concorrente ganhando' : 'Nitron ganhando'; }
      else if(r.n_comp>0){ dono='Nitron ausente'; }
      else if(r.classico>0){ dono='só clássico'; }
      else dono='sem dados';
      r.dono=dono; r.presente=presente;
      r.acao = r.classico>0 ? 'converter p/ catálogo'
             : dono==='Nitron ausente' ? 'entrar no catálogo'
             : dono==='concorrente ganhando' ? 'disputar preço'
             : !r.tem_ean ? 'cadastrar EAN'
             : 'ok';
    }
    const R=rows as any[];
    const resumo={ total:R.length, com_classico:R.filter(r=>r.classico>0).length, sem_ean:R.filter(r=>!r.tem_ean).length,
      nitron_ausente:R.filter(r=>r.dono==='Nitron ausente').length, concorrente_ganhando:R.filter(r=>r.dono==='concorrente ganhando').length,
      nitron_ganhando:R.filter(r=>r.dono==='Nitron ganhando').length, so_classico:R.filter(r=>r.dono==='só clássico').length,
      sem_estoque:R.filter(r=>r.disp!=null&&r.disp<=0).length };
    return new Response(JSON.stringify({resumo,rows},(_k,v)=>typeof v==='bigint'?Number(v):v),{headers:CORS});
  }catch(e){ return new Response(JSON.stringify({error:String(e).slice(0,400)}),{status:500,headers:CORS}); } finally{ await c.end(); }
});
