# Comando Central Nitron — fontes

Espelho versionado do painel e das Edge Functions do projeto Supabase `bwbeieumxcuomtrvlqxs`.
**A fonte de verdade do painel continua sendo o bucket** `comando/index.html` (fluxo pull → editar → publish com `base_version`, ver handoff).
`painel/cc_live.html` aqui é a cópia da versão publicada no commit.

| Pasta | O quê |
|---|---|
| `painel/cc_live.html` | painel (publicado como v3 em 13/10/2026) |
| `supabase/functions/*` | Edge Functions alteradas/criadas nesta rodada |
| `supabase/migrations/*` | DDL aplicada via MCP |

## v3 (13/10/2026)

1. **Desligar frete grátis (<R$79)** — function `ml-frete` (`elegiveis`, `verificar` ao vivo, `desligar` com senha + log em `ml_frete_log`). No painel: caixa 🚚 no card de precificação ML + filtro "🚚 Frete grátis <R$79". Hoje: 0 elegíveis.
2. **Filtros no cabeçalho** em Conciliação (Sankhya, cada canal, custo, estoque), Revendedores (tipo, marketplace, nº anúncios, CNPJ, UF) e Catálogo ML (linha, EAN, catálogo/clássico, dono, ação, estoque). Também em Criar anúncios.
3. **Estoque CD** (Filial+Extrema − reservado) em Criar anúncios (`comando-dados` v25) e Catálogo ML (`comando-catalogo` v3) + filtro "⛔ Sem estoque CD".
4. **Conflitos** — nova aba ⚠️ (`comando-sku`): anúncios ML com 2+ cores no Anymarket, proposta de preço único e "Alinhar" (via `comando-preco`, todas as ofertas do anúncio). O "Aprovar preço" agora aplica em todas as cores do anúncio por padrão.
   **Manual por SKU / Automático pelo custo**: o produto está em `definitionPriceScope` `SKU`/`COST`; botão converte para `SKU_MARKETPLACE` (PUT /products/{id}), aí o PUT por canal passa a funcionar.
5. **Shopee status fiel** — `shopee-produtos` v3 busca todos os `item_status` (NORMAL/UNLIST/BANNED/REVIEWING/*_DELETE), estoque e variações (`shopee_modelo`); view `v_shopee_status`; painel mostra o status real da loja (marca "≠ hub" quando diverge do Anymarket) e ignora itens excluídos.
