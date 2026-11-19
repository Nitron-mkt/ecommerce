// anymarket-estoque-cd v7: fonte:'sankhya' (padrão do cron) usa o DISPONÍVEL do Sankhya (AD_VW_COM_ESTOQUE = estoque − reservado, negativo vira 0).
// v6: estoque = Estoque CD (estoque_nitron+estoque_extrema). PUT /stocks [{partnerId,quantity,additionalTime:0,stockLocalId:54829}].
// ROBUSTO: chunk 25 + pausa; se o chunk falha, tenta 1 a 1 (pula ref ruim). POST {secret,confirmar?,refs?,limit?,offset?,so_com_dado?,manual?}
// v6: so_com_dado só considera "com dado" quem tem estoque_nitron OU estoque_extrema preenchido (antes, linha com estoque NULL mandava 0 e apagava o estoque do Any).
//     manual:[{ref,qtd}] grava a quantidade informada direto no Any (para acertar estoque sem dado no CD).
import { Client } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';
const DB=Deno.env.get('SUPABASE_DB_URL')!;
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,apikey','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json'};
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function skLogin(){ const base=(Deno.env.get('SANKHYA_URL')||'').replace(/\/$/,''); const r=await fetch(`${base}/mge/service.sbr?serviceName=MobileLoginSP.login&outputType=json`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({serviceName:'MobileLoginSP.login',requestBody:{NOMUSU:{$:Deno.env.get('SANKHYA_USER')},INTERNO:{$:Deno.env.get('SANKHYA_PASS')},KEEPCONNECTED:{$:'true'}}})}); const d=JSON.parse(new TextDecoder('iso-8859-1').decode(await r.arrayBuffer())); const js=String(d?.responseBody?.jsessionid?.$??d?.responseBody?.jsessionid??''); return {base,js}; }
async function skQuery(s:any,sql:string){ const r=await fetch(`${s.base}/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json&mgeSession=${encodeURIComponent(s.js)}`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:`JSESSIONID=${s.js}`},body:JSON.stringify({serviceName:'DbExplorerSP.executeQuery',requestBody:{sql}})}); const d=JSON.parse(new TextDecoder('iso-8859-1').decode(await r.arrayBuffer())); if(d?.status!=='1'&&!d?.responseBody?.rows) throw new Error('sankhya: '+JSON.stringify(d).slice(0,200)); return (d?.responseBody?.rows??[]) as any[][]; }
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:CORS});
  const c=new Client(DB); await c.connect();
  try{
    const body=await req.json().catch(()=>({}));
    const app=(await c.queryObject`SELECT state_secret FROM ml_oauth_app WHERE id=1`).rows[0] as any;
    if(!app||body.secret!==app.state_secret) return new Response(JSON.stringify({error:'secret'}),{status:403,headers:CORS});
    const cfg=(await c.queryObject`SELECT token, base_url FROM anymarket_config WHERE id=1`).rows[0] as any;
    const base=(cfg.base_url||'https://api.anymarket.com.br/v2').replace(/\/$/,''); const H={'gumgaToken':cfg.token,'Content-Type':'application/json'};
    async function put(arr:any[]){ const pr=await fetch(base+'/stocks',{method:'PUT',headers:H,body:JSON.stringify(arr)}); const t=await pr.text(); return {ok:pr.status>=200&&pr.status<300, http:pr.status, t}; }
    if(Array.isArray(body.manual)){
      const arr=body.manual.slice(0,100).map((m:any)=>({partnerId:String(m.ref),quantity:Math.max(0,Math.floor(Number(m.qtd)||0)),additionalTime:0,stockLocalId:54829}));
      if(body.confirmar!==true) return new Response(JSON.stringify({confirmar:false,manual:arr}),{headers:CORS});
      const out:any[]=[];
      for(const it of arr){ const r=await put([it]); out.push({ref:it.partnerId,qtd:it.quantity,ok:r.ok,http:r.http,erro:r.ok?undefined:r.t.slice(0,150)});
        if(r.ok){ try{ await c.queryObject({text:`UPDATE anymarket_sku SET estoque=$2, atualizado_em=now() WHERE referencia=$1`,args:[it.partnerId,it.quantity]}); }catch(_){} } await sleep(60); }
      return new Response(JSON.stringify({confirmar:true,manual:out}),{headers:CORS});
    }
    if(body.fonte==='sankhya'){
      const sk=await skLogin(); if(!sk.js) throw new Error('login sankhya falhou');
      const rowsSk=await skQuery(sk,`SELECT REFERENCIA, DISPONIVEL FROM AD_VW_COM_ESTOQUE`);
      if(rowsSk.length<500) return new Response(JSON.stringify({error:'sankhya devolveu poucas linhas ('+rowsSk.length+'); nada gravado'}),{status:502,headers:CORS});
      const SK:Record<string,number>={}; for(const r of rowsSk){ if(r[0]) SK[String(r[0]).trim()]=Math.max(0,Math.floor(Number(r[1])||0)); }
      const skus=(await c.queryObject(`SELECT sku_id, referencia, estoque FROM anymarket_sku WHERE referencia NOT LIKE 'KIT%' AND referencia NOT LIKE '%\\_inativo' ESCAPE '\\'`)).rows as any[];
      const alvoS=skus.filter(r=>SK[r.referencia]!==undefined).map(r=>({sku_id:r.sku_id,referencia:r.referencia,cd:SK[r.referencia],antes:Number(r.estoque)}));
      const sem=skus.filter(r=>SK[r.referencia]===undefined).map(r=>r.referencia);
      if(body.confirmar!==true) return new Response(JSON.stringify({confirmar:false,fonte:'sankhya',linhas_sankhya:rowsSk.length,alvo:alvoS.length,mudam:alvoS.filter(r=>r.cd!==r.antes).length,sem_no_sankhya:sem.length,ex_sem:sem.slice(0,15),amostra:alvoS.filter(r=>r.cd!==r.antes).slice(0,15).map(r=>[r.referencia,r.antes,r.cd])}),{headers:CORS});
      let okN=0,errN=0; const bad:any[]=[];
      const itemS=(r:any)=>({partnerId:r.referencia,quantity:r.cd,additionalTime:0,stockLocalId:54829});
      for(let i=0;i<alvoS.length;i+=25){ const lote=alvoS.slice(i,i+25); const res=await put(lote.map(itemS));
        if(res.ok){ okN+=lote.length; for(const r of lote){ try{ await c.queryObject({text:`UPDATE anymarket_sku SET estoque=$2, atualizado_em=now() WHERE sku_id=$1`,args:[String(r.sku_id),r.cd]}); }catch(_){} } }
        else { for(const r of lote){ const r1=await put([itemS(r)]); if(r1.ok){ okN++; try{ await c.queryObject({text:`UPDATE anymarket_sku SET estoque=$2, atualizado_em=now() WHERE sku_id=$1`,args:[String(r.sku_id),r.cd]}); }catch(_){} } else { errN++; if(bad.length<15) bad.push({ref:r.referencia,http:r1.http,resp:r1.t.slice(0,120)}); } await sleep(60); } }
        await sleep(200); }
      return new Response(JSON.stringify({confirmar:true,fonte:'sankhya',alvo:alvoS.length,ok:okN,erros:errN,bad}),{headers:CORS});
    }
    const refs=Array.isArray(body.refs)?body.refs:null;
    const lim=Math.min(Number(body.limit)||1000,2000); const off=Number(body.offset)||0;
    let q=`SELECT s.sku_id, s.referencia, (COALESCE(pp.estoque_nitron,0)+COALESCE(pp.estoque_extrema,0))::int cd, (pp.estoque_nitron IS NOT NULL OR pp.estoque_extrema IS NOT NULL) tem
           FROM anymarket_sku s LEFT JOIN precificacao_produto pp ON pp.referencia=s.referencia`;
    const args:any[]=[];
    if(refs){ q+=` WHERE s.referencia = ANY($1)`; args.push(refs); }
    q+=` ORDER BY s.referencia`;
    if(!refs){ q+=` LIMIT ${lim} OFFSET ${off}`; }
    const rows=(await c.queryObject({text:q,args})).rows as any[];
    const alvo=rows.filter(r=> body.so_com_dado===true ? r.tem : true);
    if(body.confirmar!==true){ return new Response(JSON.stringify({confirmar:false, no_lote:rows.length, alvo:alvo.length, sem_dado_cd:alvo.filter(r=>!r.tem).length}),{headers:CORS}); }
    const item=(r:any)=>({ partnerId:r.referencia, quantity:Number(r.cd)||0, additionalTime:0, stockLocalId:54829 });
    let okN=0, errN=0; const bad:any[]=[];
    for(let i=0;i<alvo.length;i+=25){
      const lote=alvo.slice(i,i+25);
      let res=await put(lote.map(item));
      if(res.ok){ okN+=lote.length; }
      else { // fallback 1 a 1
        for(const r of lote){ const r1=await put([item(r)]); if(r1.ok) okN++; else { errN++; if(bad.length<15) bad.push({ref:r.referencia, http:r1.http, resp:r1.t.slice(0,120)}); } await sleep(60); }
      }
      for(const r of lote){ if(res.ok){ try{ await c.queryObject({text:`UPDATE anymarket_sku SET estoque=$2, atualizado_em=now() WHERE sku_id=$1`,args:[String(r.sku_id),Number(r.cd)||0]}); }catch(_){}} }
      await sleep(200);
    }
    return new Response(JSON.stringify({confirmar:true, alvo:alvo.length, ok:okN, erros:errN, proximo_offset:off+rows.length, bad}),{headers:CORS});
  }catch(e){ return new Response(JSON.stringify({error:String(e).slice(0,400)}),{status:500,headers:CORS}); } finally{ await c.end(); }
});
