// any-oferta-reenviar: força nova transmissão de ofertas (anúncios) do Anymarket com PUT do próprio conteúdo da oferta.
// acao:'pausar'|'ativar' muda o status da oferta (PAUSED/ACTIVE).
// POST {secret, senha, confirmar?, acao?, itens:[{sku_id, offer_id}]}  (até 20 por chamada; sem confirmar = prévia). Log em anymarket_reenvio_log.
import { Client } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';
const DB=Deno.env.get('SUPABASE_DB_URL')!;
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,apikey','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json'};
const J=(o:any,s=200)=>new Response(JSON.stringify(o),{status:s,headers:CORS});
async function sha(s:string){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:CORS});
  const c=new Client(DB); await c.connect();
  try{
    const b=await req.json().catch(()=>({}));
    const app=(await c.queryObject`SELECT state_secret FROM ml_oauth_app WHERE id=1`).rows[0] as any;
    if(!app||b.secret!==app.state_secret) return J({error:'secret'},403);
    const conf=(await c.queryObject`SELECT senha_hash FROM comando_config WHERE id=1`).rows[0] as any;
    if(conf?.senha_hash && await sha(String(b.senha||''))!==conf.senha_hash) return J({error:'senha'},401);
    const cfg=(await c.queryObject`SELECT token, base_url FROM anymarket_config WHERE id=1`).rows[0] as any;
    const base=(cfg.base_url||'https://api.anymarket.com.br/v2').replace(/\/$/,''); const H={'gumgaToken':cfg.token,'Content-Type':'application/json'};
    await c.queryObject(`CREATE TABLE IF NOT EXISTS anymarket_reenvio_log (id bigserial primary key, sku_id text, offer_id text, http int, resposta text, em timestamptz default now())`);
    const out:any[]=[];
    for(const it of (b.itens||[]).slice(0,20)){
      const g=await fetch(`${base}/skus/${it.sku_id}/marketplaces`,{headers:H}); const arr:any=await g.json().catch(()=>[]);
      const o=(Array.isArray(arr)?arr:[]).find((x:any)=>String(x.id)===String(it.offer_id));
      if(!o){ out.push({...it,erro:'oferta não encontrada'}); continue; }
      if(b.confirmar!==true){ out.push({...it,acc:o.idAccount,tr:o.transmissionStatus}); continue; }
      if(b.acao==='pausar'||b.acao==='ativar'){
        const st=b.acao==='pausar'?'PAUSED':'ACTIVE'; const tent:any[]=[];
        for(const [m,p,bd] of [['PUT',`/skus/${it.sku_id}/marketplaces/${it.offer_id}`,{price:o.price,discountPrice:o.discountPrice,fields:o.fields||{},additionalTime:o.additionalTime||0,publicationStatus:st,status:st}]] as any){
          const r=await fetch(base+p,{method:m,headers:H,body:JSON.stringify(bd)}); const t=await r.text(); let ps=null; try{ps=JSON.parse(t).publicationStatus;}catch{}
          tent.push({m,p,http:r.status,ps,t:t.slice(0,200)});
          await c.queryObject({text:`INSERT INTO anymarket_reenvio_log (sku_id,offer_id,http,resposta) VALUES ($1,$2,$3,$4)`,args:[String(it.sku_id),String(it.offer_id),r.status,(b.acao+' '+t).slice(0,400)]});
          if(r.status<300) break;
        }
        out.push({...it,acc:o.idAccount,antes:o.publicationStatus,tent}); continue;
      }
      const body={price:o.price,discountPrice:o.discountPrice,fields:o.fields||{},additionalTime:o.additionalTime||0};
      const r=await fetch(`${base}/skus/${it.sku_id}/marketplaces/${it.offer_id}`,{method:'PUT',headers:H,body:JSON.stringify(body)}); const t=await r.text();
      await c.queryObject({text:`INSERT INTO anymarket_reenvio_log (sku_id,offer_id,http,resposta) VALUES ($1,$2,$3,$4)`,args:[String(it.sku_id),String(it.offer_id),r.status,t.slice(0,400)]});
      let tr=null; try{tr=JSON.parse(t).transmissionStatus;}catch{}
      out.push({...it,ok:r.status>=200&&r.status<300,http:r.status,tr,erro:r.status>=300?t.slice(0,300):undefined});
    }
    return J({confirmar:b.confirmar===true,out});
  }catch(e){ return J({error:String(e).slice(0,400)},500); } finally{ await c.end(); }
});
