# Regras por canal

## Mercado Livre
- Título: até 60 caracteres. Proibido: promoções, frete, preço, emojis, links, nome de outra marca.
- Os atributos da categoria (`/categories/<id>/attributes`) alimentam busca, filtros e o catálogo; os obrigatórios
  bloqueiam ou derrubam a exposição se faltarem. GTIN (EAN) é obrigatório na maioria das categorias.
- Descrição: texto puro (o Anymarket converte o HTML). Sem dados de contato ou links.
- Buscas em alta: `/trends/MLB/<category_id>` (token da conta). Mudam toda semana: consulte na hora.
- Variações: cor é variação (atributo COLOR/MAIN_COLOR), não vai no título.

## Shopee
- Título: até 120 caracteres; repetir a palavra principal no começo. Como o Anymarket manda um título só,
  priorize o limite do ML (60).
- Descrição: até 3.000 caracteres, sem links externos. Tópicos ajudam a leitura no app.
- Atributos da categoria Shopee também aparecem nos filtros: material, capacidade, marca, quantidade.

## Anymarket
- O título e a descrição do PRODUTO valem para todos os canais; a ficha técnica fica em "Características"
  (colunas NOME n / VALOR n da planilha).
- Importação: tela de **atualização** de produtos (os SKUs já existem). Mantenha as colunas do modelo.
- **Nunca** preencha ou altere NOME/VALOR VARIAÇÃO de um produto que já existe: o Any recusa a linha inteira
  ("Não é possível editar os valores de variação de produtos com variação"). Se o produto não tem cor como variação,
  coloque a cor só na ficha técnica (característica "Cor") e no TÍTULO SKU.
- Cálculo de preço "Manual - Anúncio": o preço do anúncio não é sobrescrito pela planilha.

## Base SEO (adaptada de claude-seo / seo-ecommerce)
- Palavra-chave principal no título e na abertura da descrição.
- Conteúdo único (≥ 200 palavras), com tabela/lista de especificações.
- ≥ 3 imagens (principal, detalhe, uso); alta resolução.
- Nada de texto escrito "para o robô": a descrição tem de responder a quem compra.
