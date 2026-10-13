// shopee-produtos v3: status FIEL por anúncio. Busca TODOS os item_status (NORMAL/UNLIST/BANNED/REVIEWING/*_DELETE),
// grava estoque (item e variações em shopee_modelo) e, com &auto=1, controla o próprio offset em comando_config
// (sem wrap fixo — volta a 0 só quando a Shopee diz has_next_page=false).
// ?secret=…&shop=426417349&offset=N[&auto=1][&pages=2]
import { Client } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';
const DB=Deno.env.get('SUPABASE_DB_URL')!;
const N=(v:any)=>{const f=Number(v);return isFinite(f)?f:null;};
const STATUSES=['NORMAL','UNLIST','BANNED','REVIEWING','SELLER_DELETE','SHOPEE_DELETE'];
async function hmac(key:string,msg:string){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);const s=await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(msg));return Array.from(new Uint8Array(s)).map(b=>b.toString(16).padStart(2,'0')).join('');}
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
Deno.serve(async(req)=>{
  const u=new URL(req.url); const c=new Client(DB); await c.connect();
  try{
    const app1=(await c.queryObject`SELECT state_secret FROM shopee_oauth_app WHERE id=1`).rows[0] as any;
    if(!app1||u.searchParams.get('secret')!==app1.state_secret) return new Response(JSON.stringify({error:'secret'}),{status:403});
    const sid=u.searchParams.get('shop')||'704493455';
    const tok=(await c.queryObject({text:`SELECT access_token, loja, COALESCE((raw->>'app')::int, CASE WHEN shop_id='704493455' THEN 1 ELSE 2 END) app_id FROM shopee_conta_token WHERE shop_id=$1`,args:[sid]})).rows[0] as any;
    if(!tok?.access_token) return new Response(JSON.stringify({error:'sem token p/ shop '+sid}),{status:400});
    const app=(await c.queryObject({text:`SELECT partner_id, partner_key, host FROM shopee_oauth_app WHERE id=$1`,args:[tok.app_id]})).rows[0] as any;
    if(!app?.partner_key) return new Response(JSON.stringify({error:'app '+tok.app_id+' sem partner_key'}),{status:400});
    const host=(app.host||'https://partner.shopeemobile.com').replace(/\/$/,''); const pid=String(app.partner_id); const at=tok.access_token; const loja=tok.loja||(sid==='704493455'?'Nitron':'Mundo UD');
    const call=async(path:string,extra:string)=>{ const ts=Math.floor(Date.now()/1000); const sign=await hmac(String(app.partner_key),pid+path+ts+at+sid); const url=`${host}${path}?partner_id=${pid}&timestamp=${ts}&access_token=${at}&shop_id=${sid}&sign=${sign}${extra}`; const r=await fetch(url); return await r.json().catch(()=>({})); };
    const auto=u.searchParams.get('auto')==='1';
    const offCol=sid==='704493455'?'shopee_offset':'shopee_offset_mud';
    let offset=Number(u.searchParams.get('offset')||0);
    if(auto){ offset=Number(((await c.queryObject(`SELECT COALESCE(${offCol},0) o FROM comando_config WHERE id=1`)).rows[0] as any)?.o||0); }
    const pages=Math.min(4,Math.max(1,Number(u.searchParams.get('pages')||2)));
    const stQ=STATUSES.map(s=>'&item_status='+s).join('');
    let grav=0, modelos=0, total:any=null, hasNext=false, nextOff=offset; const porStatus:Record<string,number>={};
    for(let p=0;p<pages;p++){
      const lst=await call('/api/v2/product/get_item_list',`&offset=${nextOff}&page_size=50${stQ}`);
      if(lst.error){ return new Response(JSON.stringify({error:lst.error,message:lst.message,app:tok.app_id,offset:nextOff}),{status:500}); }
      const items=(lst.response?.item||[]).map((i:any)=>i.item_id); total=lst.response?.total_count; hasNext=!!lst.response?.has_next_page; const nOff=lst.response?.next_offset;
      if(items.length){
        const bi=await call('/api/v2/product/get_item_base_info',`&item_id_list=${items.join(',')}`);
        for(const it of (bi.response?.item_list||[])){
          let preco=N((it.price_info?.[0]||{}).current_price); const temVar=!!it.has_model;
          let estoque=N(it.stock_info_v2?.summary_info?.total_available_stock);
          if(temVar){
            const ml=await call('/api/v2/product/get_model_list',`&item_id=${it.item_id}`);
            const ms=(ml.response?.model||[]) as any[];
            const precos:number[]=[]; let somaEst=0, temEst=false;
            for(const m of ms){
              const mp=N((m.price_info?.[0]||{}).current_price); if(mp&&mp>0) precos.push(mp);
              const me=N(m.stock_info_v2?.summary_info?.total_available_stock); if(me!=null){somaEst+=me;temEst=true;}
              await c.queryObject({text:`INSERT INTO shopee_modelo (model_id,item_id,shop_id,loja,model_sku,preco,estoque,atualizado_em) VALUES ($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT (model_id) DO UPDATE SET item_id=EXCLUDED.item_id,shop_id=EXCLUDED.shop_id,loja=EXCLUDED.loja,model_sku=EXCLUDED.model_sku,preco=EXCLUDED.preco,estoque=EXCLUDED.estoque,atualizado_em=now()`,args:[m.model_id,it.item_id,sid,loja,m.model_sku||null,mp,me]}); modelos++;
            }
            if((preco==null||preco===0)&&precos.length) preco=Math.min(...precos);
            if(temEst) estoque=somaEst;
            await sleep(60);
          }
          porStatus[it.item_status||'?']=(porStatus[it.item_status||'?']||0)+1;
          await c.queryObject({text:`INSERT INTO shopee_produto (item_id,shop_id,loja,item_sku,referencia,nome,preco,estoque,status,tem_variacao,atualizado_em) VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,now()) ON CONFLICT (item_id) DO UPDATE SET shop_id=EXCLUDED.shop_id,loja=EXCLUDED.loja,item_sku=EXCLUDED.item_sku,referencia=EXCLUDED.referencia,nome=EXCLUDED.nome,preco=EXCLUDED.preco,estoque=EXCLUDED.estoque,status=EXCLUDED.status,tem_variacao=EXCLUDED.tem_variacao,atualizado_em=now()`,args:[it.item_id,sid,loja,it.item_sku||null,it.item_name||null,preco,estoque,it.item_status||null,temVar]}); grav++;
        }
      }
      nextOff=hasNext?(nOff??nextOff+50):0;
      if(!hasNext) break;
      await sleep(80);
    }
    if(auto) await c.queryObject(`UPDATE comando_config SET ${offCol}=${Number(nextOff)||0} WHERE id=1`);
    const cont=(await c.queryObject({text:`SELECT count(*)::int prod, count(DISTINCT referencia)::int refs, count(*) FILTER (WHERE preco>0)::int com_preco FROM shopee_produto WHERE shop_id=$1`,args:[sid]})).rows[0] as any;
    cont.por_status=((await c.queryObject({text:`SELECT json_object_agg(COALESCE(status,'?'),n) m FROM (SELECT status, count(*)::int n FROM shopee_produto WHERE shop_id=$1 GROUP BY status) s`,args:[sid]})).rows[0] as any)?.m;
    return new Response(JSON.stringify({shop:sid,loja,app:tok.app_id,total_na_shopee:total,offset_inicial:offset,gravados_lote:grav,modelos_lote:modelos,status_lote:porStatus,proximo_offset:nextOff,fim:!hasNext,no_banco:cont},null,2),{headers:{'Content-Type':'application/json'}});
  }catch(e){ return new Response(JSON.stringify({error:String(e).slice(0,400)}),{status:500}); } finally{ await c.end(); }
});
