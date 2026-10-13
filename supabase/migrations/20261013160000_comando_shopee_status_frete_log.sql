-- aplicada em 13/10/2026 via MCP (apply_migration "comando_shopee_status_frete_log")
CREATE TABLE IF NOT EXISTS shopee_modelo (
  model_id bigint PRIMARY KEY,
  item_id bigint NOT NULL,
  shop_id text,
  loja text,
  model_sku text,
  preco numeric,
  estoque integer,
  atualizado_em timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shopee_modelo_item_idx ON shopee_modelo(item_id);
ALTER TABLE shopee_modelo ENABLE ROW LEVEL SECURITY;

-- status real Shopee por id (item OU variação), normalizado p/ o painel
CREATE OR REPLACE VIEW v_shopee_status AS
WITH it AS (
  SELECT item_id, shop_id, loja, status, estoque, atualizado_em FROM shopee_produto
)
SELECT item_id::text id, it.item_id, it.loja, it.status status_raw, it.estoque, it.atualizado_em,
  CASE
    WHEN it.status IN ('SELLER_DELETE','SHOPEE_DELETE') THEN 'Excluído'
    WHEN it.status='BANNED' THEN 'Banido'
    WHEN it.status='UNLIST' THEN 'Pausado'
    WHEN it.status='REVIEWING' THEN 'Em revisão'
    WHEN it.status='NORMAL' AND it.estoque IS NOT NULL AND it.estoque<=0 THEN 'Sem estoque'
    WHEN it.status='NORMAL' THEN 'Ativo'
    ELSE it.status END st
FROM it
UNION ALL
SELECT m.model_id::text, m.item_id, it.loja, it.status, m.estoque, m.atualizado_em,
  CASE
    WHEN it.status IN ('SELLER_DELETE','SHOPEE_DELETE') THEN 'Excluído'
    WHEN it.status='BANNED' THEN 'Banido'
    WHEN it.status='UNLIST' THEN 'Pausado'
    WHEN it.status='REVIEWING' THEN 'Em revisão'
    WHEN it.status='NORMAL' AND m.estoque IS NOT NULL AND m.estoque<=0 THEN 'Sem estoque'
    WHEN it.status='NORMAL' THEN 'Ativo'
    ELSE it.status END
FROM shopee_modelo m JOIN it ON it.item_id=m.item_id;

CREATE TABLE IF NOT EXISTS ml_frete_log (
  id bigserial PRIMARY KEY,
  listing_id text, loja text, referencia text,
  preco numeric, free_antes boolean, free_depois boolean,
  http integer, resultado text, origem text,
  em timestamptz DEFAULT now()
);
ALTER TABLE ml_frete_log ENABLE ROW LEVEL SECURITY;

-- crons 168/176 (shopee-produtos) passaram a usar &auto=1&pages=2 (offset controlado pela function; sem wrap fixo em 500/350)
