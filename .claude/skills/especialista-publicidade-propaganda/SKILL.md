---
name: especialista-publicidade-propaganda
description: >
  Especialista em publicidade e propaganda para a Nitron e a Mundo UD: mídia paga nos marketplaces
  (Mercado Ads / Product Ads, Shopee Ads, TikTok Shop Ads), Meta Ads (Facebook/Instagram), Google Shopping,
  copy e criativos (texto, roteiro de vídeo, briefing de foto/arte), calendário promocional e leitura de
  resultados (ACOS, TACOS, ROAS, CPC, CTR, conversão). Use para planejar campanhas, definir verba e lance,
  escrever anúncios e peças, avaliar o que está dando prejuízo e decidir o que escalar ou pausar.
user-invocable: true
argument-hint: "<objetivo | produto/linha | canal | período>"
metadata:
  complementa: "especialista-anuncios-marketplace (título/descrição/ficha) — esta skill cuida da mídia paga e da comunicação"
---

# Especialista em Publicidade e Propaganda

Regra de ouro: **anúncio pago só em produto que dá lucro depois da mídia.** Antes de qualquer campanha,
calcule a margem de contribuição do produto no canal e o ACOS máximo que ele aguenta.

## 1. Conta da margem (sempre primeiro)

Margem de contribuição por venda = Preço − imposto − comissão do canal − frete/tarifa fixa − embalagem − custo.
- Nitron (Lucro Real): imposto 27,25% sobre a venda, com crédito sobre o custo (custo líquido = custo × 0,7275).
- Mundo UD (Simples): 8% sobre a venda.
- Embalagem R$ 3. ML: comissão real do anúncio (ou 13%), frete a partir de R$ 79, tarifa fixa abaixo de R$ 79.
  Shopee: 20% + tarifa fixa por faixa. Fonte dos números: `precificacao_config`, `anuncio_proprio` (fee_real, frete_real).
- **ACOS de equilíbrio = margem de contribuição ÷ preço.** ACOS alvo = ACOS de equilíbrio − margem líquida desejada
  (padrão da empresa: 10% líquido). Se o ACOS alvo ficar abaixo de ~5%, **não anuncie** esse item: ajuste preço ou kit.

Fórmulas: ACOS = gasto ÷ receita do anúncio · ROAS = receita ÷ gasto = 1/ACOS · TACOS = gasto ÷ receita total do item ·
CPA = gasto ÷ vendas · Lance máx. por clique = preço × ACOS alvo × taxa de conversão.

## 2. Onde colocar a verba (ordem de prioridade)

1. **Mercado Ads – Product Ads** (maior intenção de compra). Campanha automática para descobrir termos e uma manual
   com os campeões. Agrupe por **margem/ACOS alvo parecido**, não por categoria.
2. **Shopee Ads** – Anúncio de busca por palavra-chave nos itens com avaliação e preço competitivo; "Descoberta"
   só para itens com estoque alto. Use cupons de loja junto com o anúncio.
3. **TikTok Shop** – vídeo curto mostrando uso (antes/depois de organizar), afiliados e lives; GMV Max quando houver catálogo ativo.
4. **Meta Ads** (Facebook/Instagram) – remarketing e lançamento de linha (Teca, Nitron-Mob, Organização);
   catálogo dinâmico apontando para a loja/marketplace. Ferramentas META_MCP disponíveis nesta sessão (ler antes de criar).
5. **Google Shopping/PMax** – só quando houver loja própria com feed.

Divisão inicial sugerida da verba: 60% marketplaces (ML 40, Shopee 20), 20% TikTok, 20% Meta. Rebalancear a cada 14 dias pelo ROAS.

## 3. Quais produtos anunciar

- **Escalar:** curva A de vendas, margem boa, estoque ≥ 60 dias, avaliação ≥ 4,5, preço até 10% acima do concorrente.
- **Testar:** lançamentos e curva B com margem alta (verba pequena, 7–14 dias).
- **Não anunciar:** preço abaixo de R$ 12,50 no ML (tarifa fixa come a margem), estoque baixo, anúncio pausado ou com
  ficha incompleta, item com margem negativa. Para itens baratos, **anuncie o kit** (ex.: Kit 6 Potes) e não a unidade.
- Antes de anunciar: título, fotos e ficha prontos (skill `especialista-anuncios-marketplace`), frete grátis acima de R$ 79 no ML.

## 4. Gestão semanal

| Situação (últimos 14 dias) | Ação |
|---|---|
| ACOS ≤ alvo e vendendo | Aumentar orçamento 20–30% |
| ACOS entre alvo e equilíbrio | Baixar lance 10–15%, negativar termos ruins |
| ACOS > equilíbrio | Pausar o item ou o termo |
| Muitos cliques, sem venda (> 2× CPA alvo) | Revisar preço, foto principal e avaliação; pausar |
| Impressões baixas | Subir lance ou melhorar título/categoria |
| Sem estoque ≥ 15 dias | Pausar antes de acabar |

Nunca mexa em tudo de uma vez: uma mudança por campanha por semana, para saber o que funcionou.

## 5. Copy e criativos

- **Promessa clara em 1 frase:** benefício + prova. Ex.: "Organize a geladeira em 5 minutos — potes empilháveis com trava".
- Estrutura AIDA (Atenção, Interesse, Desejo, Ação) ou PAS (Problema, Agitação, Solução) para vídeo.
- Vídeo curto (9:16, 15–30 s): gancho nos 2 primeiros segundos (o problema: armário bagunçado), produto em uso, resultado, CTA.
- Fotos: principal em fundo branco (regra do ML); secundárias com uso real, medidas e "o que vem na caixa".
- Use sempre a marca, cores reais do produto e argumentos verdadeiros (BPA free, Teca FSC, trava, empilhável) — nada que o produto não comprove.
- Datas-chave: Dia das Mães, Dia dos Pais, Black Friday/Cyber Monday, Natal, "volta às aulas" (marmitas/potes),
  datas duplas da Shopee (9.9, 10.10, 11.11, 12.12), Dia do Consumidor (15/03).

## 6. Entregáveis padrão

- **Plano de campanha:** objetivo, produtos (com margem e ACOS alvo de cada um), canal, verba diária, lance, período, KPI.
- **Pacote de criativos:** 3 títulos/headlines, 3 textos, 1 roteiro de vídeo, briefing de foto/arte.
- **Relatório:** gasto, receita, ACOS/ROAS/TACOS por item, o que escalar, o que pausar e por quê.

Detalhes de cálculo e modelos em `references/modelos.md`.
