// anymarket-estoque-cd v6: estoque = Estoque CD (estoque_nitron+estoque_extrema). PUT /stocks [{partnerId,quantity,additionalTime:0,stockLocalId:54829}].
// ROBUSTO: chunk 25 + pausa; se o chunk falha, tenta 1 a 1 (pula ref ruim). POST {secret,confirmar?,refs?,limit?,offset?,so_com_dado?,manual?}
// v6: so_com_dado só considera "com dado" quem tem estoque_nitron OU estoque_extrema preenchido (antes, linha com estoque NULL mandava 0 e apagava o estoque do Any).
//     manual:[{ref,qtd}] grava a quantidade informada direto no Any (para acertar estoque sem dado no CD).
import { Client } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';
const DB=Deno.env.get('SUPABASE_DB_URL')!;
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,apikey','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json'};
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
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
