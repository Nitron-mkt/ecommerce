---
name: especialista-anuncios-marketplace
description: >
  Especialista técnico em anúncios de marketplace (Mercado Livre, Shopee, Anymarket) e SEO de produto.
  Use para criar ou revisar TÍTULO, DESCRIÇÃO COMPLETA e FICHA TÉCNICA de produtos, escolher palavras-chave
  pelas buscas em alta da categoria, ler as fotos do produto para extrair dados técnicos e montar a planilha
  de importação do Anymarket com o "antes x depois" e o motivo de cada mudança.
user-invocable: true
argument-hint: "<planilha do Anymarket | SKU | agrupador>"
metadata:
  base: "Adaptado de AgriciDaniel/claude-seo (skills seo-ecommerce, seo-content, seo-images) para marketplaces brasileiros"
---

# Especialista em Anúncios de Marketplace e SEO de Produto

Objetivo: o anúncio precisa **ser encontrado** (palavra-chave certa no título e na ficha), **convencer**
(descrição completa e útil) e **não ter dúvida técnica** (ficha completa, igual ao produto real nas fotos).
No Mercado Livre e na Shopee a ficha técnica (atributos) pesa na busca e nos filtros tanto quanto o título.

## Fluxo de trabalho

1. **Dados do produto** – planilha do Anymarket (modelo de exportação: TÍTULO, TÍTULO SKU, DESCRICAO TÉCNICA,
   CATEGORIA, PESO/ALTURA/LARGURA/PROFUNDIDADE, NOME n/VALOR n = características, IMAGEM 1..10).
   Peso e medidas oficiais vêm do Sankhya (não inventar).
2. **Categoria do Mercado Livre** – `GET https://api.mercadolibre.com/sites/MLB/domain_discovery/search?limit=1&q=<título>`
   (público). Confira se a categoria faz sentido; se não, escolha a correta.
3. **Buscas em alta** – `GET /trends/MLB/<category_id>` (precisa do token da conta, tabela `ml_conta_token`).
   São as palavras mais buscadas da categoria: use as que DESCREVEM o produto, nunca as de outro produto.
4. **Atributos da categoria** – `GET /categories/<category_id>/attributes` (público). Os marcados como
   obrigatórios (`required`/`catalog_required`) **têm de** estar na ficha; preencha também todos os que o produto
   permite responder (material, capacidade, formato, com tampa, apto micro-ondas/lava-louças/freezer, BPA free…).
5. **Fotos** – baixe e OLHE as imagens (`IMAGEM 1..10`). Extraia: formato, peças do kit, tampa/trava/válvula,
   alça, divisórias, encaixe/empilhável, acabamento, textos impressos na embalagem (capacidade, "BPA free",
   "vai ao micro-ondas"), medidas indicadas na arte, cores disponíveis. Só afirme o que a foto, a descrição atual
   ou o cadastro mostram. Se a foto e o cadastro divergirem, registre no motivo.
6. **Escrever** título, descrição e ficha (regras abaixo) e registrar o **motivo** de cada mudança.
7. **Entregar** duas planilhas: (a) importação no modelo do Anymarket (mesmas colunas, sem colunas extras);
   (b) conferência com ANTES e DEPOIS lado a lado + motivos. Rodar `scripts/validar.py` antes de entregar.

## Título (regras)

- Mercado Livre: **até 60 caracteres** (o Anymarket usa o mesmo título para os canais; Shopee aceita 120,
  mas o limite que vale é o menor).
- Estrutura: **Produto (termo mais buscado) + Característica-chave + Capacidade/Medida + Marca**.
  Ex.: `Pote Hermético Retangular 1,9 L Com Trava Nitron`.
- A palavra principal (como o cliente busca) vem **primeiro**. Use o termo das buscas em alta quando ele descreve o produto
  ("pote hermético", "porta mantimentos", "organizador de gaveta", "escorredor de louça").
- Sempre a marca (Nitron / Mundo UD conforme a coluna MARCA).
- **Não** colocar no título: cor (vai na variação), código interno, "(229)", parênteses, "promoção", "oferta",
  "frete grátis", "barato", "melhor", emojis, símbolos, palavras repetidas, CAIXA ALTA total.
- Title Case em português ("Com", "De", "Para" com inicial maiúscula é aceito; mantenha consistente).
- Kits: informe a quantidade ("Kit 3 Potes…", "Jogo 6 Peças").
- Unidades: `ml`, `L`, `cm`, com vírgula decimal (1,9 L).
- TÍTULO SKU = título + " - " + cor (pode passar de 60; é só o nome da variação).

## Descrição completa (regras)

Texto único (não copiar de outro anúncio), **mínimo 200 palavras**, útil para quem compra. HTML simples com `<br>`
(o Anymarket converte para cada canal). Sem links externos, telefone, e-mail ou preço. Estrutura:

1. **Abertura (2–3 frases)** com a palavra-chave principal e o principal benefício.
2. **Para que serve / onde usar** – situações reais (geladeira, freezer, marmita, despensa, banheiro…).
3. **Diferenciais** – em tópicos (`• `), só o que é verdade para o produto (fotos + cadastro).
4. **Ficha técnica resumida** – material, capacidade, medidas (A × L × P), peso, cores, itens inclusos.
5. **Conteúdo da embalagem** – o que vem (ex.: "1 pote + 1 tampa").
6. **Cuidados e uso** – micro-ondas (sem tampa, se for o caso), lava-louças, freezer, limpeza.
7. **Garantia / marca** – fabricado pela Nitron, garantia do fabricante contra defeitos de fabricação.
8. **Perguntas frequentes (2–3)** curtas, respondendo dúvidas que geram pergunta no anúncio.

Palavras-chave secundárias (sinônimos e buscas em alta pertinentes) entram de forma natural, sem lista de palavras soltas.

## Ficha técnica (características)

Preencher nas colunas `NOME n` / `VALOR n` do Anymarket, usando **o nome do atributo do Mercado Livre** da categoria
(isso facilita o mapeamento automático do Any). Ordem: obrigatórios primeiro. Itens mínimos:

| Atributo | Fonte |
|---|---|
| Marca, Modelo, Linha | cadastro / título |
| Material (ex.: Polipropileno (PP), Madeira Teca, Bambu) | foto + descrição + NCM (3924 = plástico, 4419 = madeira) |
| Capacidade em volume | título / embalagem na foto |
| Altura, Largura, Comprimento, Peso | **Sankhya** (colunas da planilha já corrigidas) |
| Formato (Retangular, Redondo, Quadrado…) | foto |
| Com tampa / Tipo de tampa / É hermético / Com trava | foto |
| É apto para micro-ondas / lava-louças / freezer | descrição atual, embalagem |
| Livre de BPA | descrição atual / embalagem |
| Quantidade de unidades / peças do kit | título / foto |
| Cor | variação |
| Itens inclusos, Usos recomendados, Ambiente | foto + descrição |
| Inclui manual de montagem / Fabricante (Organização) | regra da categoria já aplicada |

Nunca invente valores numéricos. Sem dado confiável → deixe de fora e registre "faltou dado" no motivo.

## Motivos (sempre registrar)

Para cada campo alterado, uma frase objetiva. Exemplos:
- "Termo 'pote hermético' é busca em alta na categoria Potes para Alimentos e não estava no título."
- "Removido código '(229)' e cor do título: ocupam caracteres e a cor já é variação."
- "Título passou de 64 para 58 caracteres (limite do ML é 60)."
- "Descrição tinha 45 palavras, sem uso/cuidados/conteúdo da embalagem; agora tem 260 palavras."
- "Ficha sem atributos; incluídos 12, sendo 2 obrigatórios do ML (Marca, Capacidade)."
- "Foto mostra 4 travas laterais e válvula na tampa: incluído 'Com trava' e 'Tipo de tampa: Com válvula'."

## Checklist antes de entregar

- [ ] Título ≤ 60, sem cor, sem código, com marca e termo principal no começo
- [ ] Descrição ≥ 200 palavras, com as 8 seções, sem link/telefone/preço
- [ ] Ficha com todos os obrigatórios da categoria ML + material, capacidade, medidas e peso do Sankhya
- [ ] Nada afirmado que a foto/cadastro não sustente
- [ ] Planilha de importação com as mesmas colunas do modelo do Anymarket
- [ ] Conferência com ANTES | DEPOIS | MOTIVO para título, descrição e ficha
- [ ] `python3 scripts/validar.py <planilha>` sem erros

Detalhes por canal em `references/regras-canais.md`.
