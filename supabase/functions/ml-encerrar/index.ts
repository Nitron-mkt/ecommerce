// ml-encerrar v1: EXCLUI anúncios ML parados/duplicados fora do hub (aba Pendências → "ENCERRAR no ML").
// GET  ?secret=…&acao=verificar&lids=MLB1,MLB2        → status AO VIVO no ML + se está vinculado no Anymarket (leitura)
// POST {secret,senha,confirmar:true,acao:'excluir',lids:[…]} → revalida (não ativo + sem vínculo no hub) → status=closed → deleted=true
// Log em ml_encerrar_log. Segurança: anúncio ATIVO ou vinculado no Anymarket NUNCA é excluído.
import { Client } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';
const DB=Deno.env.get('SUPABASE_DB_URL')!;
const ML='https://api.mercadolibre.com';
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,apikey','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json'};
const J=(o:any,s=200)=>new Response(JSON.stringify(o,(_k,v)=>typeof v==='bigint'?Number(v):v),{status:s,headers:CORS});
async function sha(s:string){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:CORS});
  const u=new URL(req.url); const c=new Client(DB); await c.connect();
  try{
    const body=req.method==='POST'?await req.json().catch(()=>({})):{};
    const p=(k:string)=>body[k]??u.searchParams.get(k);
    const app=(await c.queryObject`SELECT state_secret FROM ml_oauth_app WHERE id=1`).rows[0] as any;
    if(!app||p('secret')!==app.state_secret) return J({error:'secret'},403);
    const acao=p('acao')||'verificar';
    const raw=Array.isArray(body.lids)?body.lids:String(p('lids')||'').split(',');
    const lids=[...new Set(raw.map((x:any)=>String(x).trim().toUpperCase()).filter((x:string)=>/^MLB\d+$/.test(x)))].slice(0,25) as string[];
    if(!lids.length) return J({error:'lids vazio'},400);
    const toks=(await c.queryObject`SELECT loja, ml_user_id::text uid, access_token FROM ml_conta_token`).rows as any[];
    const byUid:Record<string,any>={}; for(const t of toks) byUid[t.uid]=t;
    // descobre a conta dona do anúncio (tenta cada token) e lê o status ao vivo
    const live=async(lid:string)=>{ for(const t of toks){ const r=await fetch(`${ML}/items/${lid}?attributes=id,status,sub_status,seller_id,title,price`,{headers:{'Authorization':'Bearer '+t.access_token}}); const j:any=await r.json().catch(()=>({}));
        if(r.status===200&&j.seller_id){ const dono=byUid[String(j.seller_id)]; return {http:200,status:j.status,sub_status:j.sub_status,titulo:j.title,preco:j.price,loja:dono?.loja||null,tok:dono?.access_token||null}; } }
      return {http:404,status:null,loja:null,tok:null}; };
    const vinc=async(lid:string)=>((await c.queryObject({text:`SELECT count(*)::int n FROM anymarket_anuncio WHERE marketplace='MERCADO_LIVRE' AND id_no_marketplace=$1`,args:[lid]})).rows[0] as any).n;

    if(acao==='verificar'){
      const out:any[]=[]; for(const lid of lids){ const l=await live(lid); out.push({lid,loja:l.loja,http:l.http,status:l.status,sub_status:l.sub_status,titulo:l.titulo,preco:l.preco,vinculado_any:await vinc(lid)}); }
      return J({out});
    }

    if(acao==='excluir'){
      if(body.confirmar!==true) return J({error:'confirmar:true exigido'},400);
      const conf=(await c.queryObject`SELECT senha_hash FROM comando_config WHERE id=1`).rows[0] as any;
      if(conf?.senha_hash){ if(!body.senha) return J({error:'senha exigida'},401); if(await sha(String(body.senha))!==conf.senha_hash) return J({error:'senha incorreta'},401); }
      await c.queryObject(`CREATE TABLE IF NOT EXISTS ml_encerrar_log (id bigserial primary key, listing_id text, loja text, titulo text, preco numeric, status_antes text, sub_status_antes jsonb, http_close int, http_delete int, resultado text, resposta text, em timestamptz default now())`);
      const out:any[]=[];
      for(const lid of lids){
        const l=await live(lid); const v=await vinc(lid);
        let res='', hc:number|null=null, hd:number|null=null, txt='';
        if(l.http!==200||!l.tok) res='não encontrado/sem token';
        else if(l.status==='active') res='PULADO: está ativo';
        else if(v>0) res='PULADO: vinculado no Anymarket';
        else {
          const H={'Authorization':'Bearer '+l.tok,'Content-Type':'application/json'};
          if(l.status!=='closed'){ const r=await fetch(`${ML}/items/${lid}`,{method:'PUT',headers:H,body:JSON.stringify({status:'closed'})}); hc=r.status; txt=(await r.text()).slice(0,300); }
          if(hc===null||(hc>=200&&hc<300)){ const r=await fetch(`${ML}/items/${lid}`,{method:'PUT',headers:H,body:JSON.stringify({deleted:'true'})}); hd=r.status; txt=(await r.text()).slice(0,300); }
          res=(hd!==null&&hd>=200&&hd<300)?'excluído':(hc!==null&&hc>=200&&hc<300)?'encerrado (exclusão recusada)':'ERRO';
        }
        await c.queryObject({text:`INSERT INTO ml_encerrar_log (listing_id,loja,titulo,preco,status_antes,sub_status_antes,http_close,http_delete,resultado,resposta) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,args:[lid,l.loja,l.titulo||null,l.preco??null,l.status,JSON.stringify(l.sub_status||null),hc,hd,res,res.startsWith('excluído')?null:txt]});
        if(res==='excluído'||res.startsWith('encerrado')) await c.queryObject({text:`UPDATE anuncio_proprio SET ml_status=$2 WHERE listing_id=$1 AND plataforma='ML'`,args:[lid,res==='excluído'?'deleted':'closed']}).catch(()=>{});
        out.push({lid,loja:l.loja,status_antes:l.status,resultado:res,http_close:hc,http_delete:hd,erro:res.startsWith('ERRO')||res.startsWith('encerrado')?txt.slice(0,200):undefined});
      }
      return J({out});
    }
    return J({error:'acao inválida'},400);
  }catch(e){ return J({error:String(e).slice(0,400)},500); } finally{ await c.end(); }
});
