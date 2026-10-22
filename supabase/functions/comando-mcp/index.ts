// comando-mcp v6: + acao=criarcor (nitron_anymarket_criar_cor, com senha).
// v5: + acao=tools (lista as ferramentas do MCP, leitura); publicar repassa titulo/descricao quando informados.
// v4: + acao=addcor (adicionar_cor + previa). montar resolve ref->cod_prod. criar/addcor/publicar gated por senha.
import { Client } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';
const DB=Deno.env.get('SUPABASE_DB_URL')!;
const CORS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type,apikey','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json'};
async function sha(s:string){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function mcpRaw(url:string,key:string,method:string,params:any){
  const r=await fetch(url,{method:'POST',headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json','Accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:Date.now(),method,params})});
  const raw=await r.text(); let obj:any=null;
  const dl=raw.split(/\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim());
  for(const cand of (dl.length?dl:[raw.trim()])){ try{const j=JSON.parse(cand); if(j&&(j.result||j.error)) obj=j;}catch(_){ } }
  if(!obj){ try{obj=JSON.parse(raw);}catch(_){ return {ok:false,error:'parse',raw:raw.slice(0,200)}; } }
  return obj;
}
async function mcpCall(url:string,key:string,tool:string,args:any){
  const obj:any=await mcpRaw(url,key,'tools/call',{name:tool,arguments:args});
  if(obj.ok===false) return obj;
  if(obj.error) return {ok:false,error:obj.error.message||JSON.stringify(obj.error)};
  const cont=(obj.result&&obj.result.content)||[]; const txt=cont[0]&&cont[0].text;
  if(txt){ try{return JSON.parse(txt);}catch(_){ return {texto:txt}; } }
  return obj.result||{};
}
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:CORS});
  const c=new Client(DB); await c.connect();
  try{
    const body=req.method==='POST'?await req.json().catch(()=>({})):{};
    const sp=new URL(req.url).searchParams;
    const secret=body.secret||sp.get('secret');
    const app=(await c.queryObject`SELECT state_secret FROM ml_oauth_app WHERE id=1`).rows[0] as any;
    if(!app||secret!==app.state_secret) return new Response(JSON.stringify({error:'secret'}),{status:403,headers:CORS});
    const cfg=(await c.queryObject`SELECT mcp_url, mcp_key, senha_hash FROM comando_config WHERE id=1`).rows[0] as any;
    if(!cfg?.mcp_key) return new Response(JSON.stringify({error:'MCP nao configurado'}),{status:400,headers:CORS});
    const url=cfg.mcp_url||'https://mcp-y7bu.onrender.com/mcp'; const key=cfg.mcp_key;
    const acao=body.acao||sp.get('acao')||'montar';
    const ambiente=body.ambiente||sp.get('ambiente')||'producao';
    const checkSenha=async()=>cfg.senha_hash && await sha(String(body.senha||''))===cfg.senha_hash;
    const resolveCod=async(ref:string)=>{ const m=(await c.queryObject({text:`SELECT codprod FROM codprod_map WHERE referencia=$1`,args:[ref]})).rows[0] as any; return m?.codprod?Number(m.codprod):null; };

    if(acao==='tools'){ // leitura: nomes e parâmetros das ferramentas nitron_anymarket_*
      const o:any=await mcpRaw(url,key,'tools/list',{});
      const tools=((o.result&&o.result.tools)||[]).filter((t:any)=>/anymarket/i.test(t.name)).map((t:any)=>({name:t.name,description:String(t.description||'').slice(0,600),params:t.inputSchema?.properties?Object.fromEntries(Object.entries(t.inputSchema.properties).map(([k,v]:any)=>[k,String(v?.description||v?.type||'').slice(0,160)])):null,required:t.inputSchema?.required||[]}));
      return new Response(JSON.stringify({tools,erro:o.error||null}),{headers:CORS});
    }
    if(acao==='criarcor'){ // cria a cor no Anymarket + AD_CORESANY (não duplica: se já existe, devolve a existente)
      if(!await checkSenha()) return new Response(JSON.stringify({error:'senha incorreta'}),{status:403,headers:CORS});
      const nomes=(Array.isArray(body.nomes)?body.nomes:[body.nome]).map((x:any)=>String(x||'').trim()).filter(Boolean).slice(0,30);
      const out:any[]=[]; for(const nome of nomes){ out.push({nome,r:await mcpCall(url,key,'nitron_anymarket_criar_cor',{ambiente,nome})}); }
      return new Response(JSON.stringify({out}),{headers:CORS});
    }
    if(acao==='categorias') return new Response(JSON.stringify(await mcpCall(url,key,'nitron_anymarket_categorias',{})),{headers:CORS});
    if(acao==='cores') return new Response(JSON.stringify(await mcpCall(url,key,'nitron_anymarket_cores',{})),{headers:CORS});
    if(acao==='montar'){
      const a:any={ambiente}; let cod=body.cod_prod?Number(body.cod_prod):null;
      if(!cod && body.ref) cod=await resolveCod(String(body.ref));
      if(cod) a.cod_prod=cod; else if(body.busca) a.busca=String(body.busca); else return new Response(JSON.stringify({error:'sem cod_prod/ref/busca'}),{status:400,headers:CORS});
      let out=await mcpCall(url,key,'nitron_anymarket_montar_produto',a);
      if(out.texto && /Erro no servico/.test(out.texto)){ await new Promise(r=>setTimeout(r,900)); out=await mcpCall(url,key,'nitron_anymarket_montar_produto',a); } // 1 retry (MCP as vezes falha)
      (out as any)._cod=cod||null; (out as any)._viaBusca=!cod;
      return new Response(JSON.stringify(out),{headers:CORS});
    }
    if(acao==='criar'){
      if(!await checkSenha()) return new Response(JSON.stringify({error:'senha incorreta'}),{status:403,headers:CORS});
      let cod=body.cod_prod?Number(body.cod_prod):(body.ref?await resolveCod(String(body.ref)):null);
      if(!cod||!body.titulo||!body.descricao||!body.id_categoria) return new Response(JSON.stringify({error:'faltam campos'}),{status:400,headers:CORS});
      const cad=await mcpCall(url,key,'nitron_anymarket_cadastrar_produto',{ambiente,cod_prod:cod,titulo:String(body.titulo),descricao:String(body.descricao),id_categoria:Number(body.id_categoria),variacoes:Array.isArray(body.variacoes)?body.variacoes:[]});
      let prev=null; if(body.previa && !(cad.problemas&&cad.problemas.length) && cad.ok!==false){ prev=await mcpCall(url,key,'nitron_anymarket_publicar_produto',{ambiente,cod_prod:cod,confirmar:false}); }
      return new Response(JSON.stringify({cadastro:cad,previa:prev,cod_prod:cod}),{headers:CORS});
    }
    if(acao==='addcor'){
      if(!await checkSenha()) return new Response(JSON.stringify({error:'senha incorreta'}),{status:403,headers:CORS});
      const codAnuncio=Number(body.cod_prod_anuncio||body.cod_prod); if(!codAnuncio||!Array.isArray(body.variacoes)||!body.variacoes.length) return new Response(JSON.stringify({error:'faltam cod_prod_anuncio/variacoes'}),{status:400,headers:CORS});
      const add=await mcpCall(url,key,'nitron_anymarket_adicionar_cor',{ambiente,cod_prod_anuncio:codAnuncio,variacoes:body.variacoes});
      let prev=null; if(body.previa && !(add.problemas&&add.problemas.length) && add.ok!==false){ prev=await mcpCall(url,key,'nitron_anymarket_publicar_produto',{ambiente,cod_prod:codAnuncio,confirmar:false}); }
      return new Response(JSON.stringify({adicao:add,previa:prev,cod_prod:codAnuncio}),{headers:CORS});
    }
    if(acao==='publicar'){
      if(!await checkSenha()) return new Response(JSON.stringify({error:'senha incorreta'}),{status:403,headers:CORS});
      let cod=body.cod_prod?Number(body.cod_prod):(body.ref?await resolveCod(String(body.ref)):null);
      if(!cod) return new Response(JSON.stringify({error:'sem cod_prod'}),{status:400,headers:CORS});
      const pa:any={ambiente,cod_prod:cod,confirmar:body.confirmar_pub===true};
      if(body.titulo) pa.titulo=String(body.titulo); if(body.descricao) pa.descricao=String(body.descricao);
      const pub=await mcpCall(url,key,'nitron_anymarket_publicar_produto',pa);
      return new Response(JSON.stringify(pub),{headers:CORS});
    }
    return new Response(JSON.stringify({error:'acao?'}),{status:400,headers:CORS});
  }catch(e){ return new Response(JSON.stringify({error:String(e).slice(0,400)}),{status:500,headers:CORS}); } finally{ await c.end(); }
});
