-- aplicadas em 14/10/2026 via MCP ("shopee_concorrente", "shopee_afiliado_config")
CREATE TABLE IF NOT EXISTS shopee_concorrente (
  id bigserial PRIMARY KEY, referencia text NOT NULL, keyword text, shop_id bigint, item_id bigint, nome text, preco numeric,
  vendidos integer, rating numeric, loja_nome text, oficial boolean, url text, eh_nosso boolean DEFAULT false,
  captured_em timestamptz DEFAULT now(), UNIQUE (referencia, item_id));
CREATE INDEX IF NOT EXISTS shopee_concorrente_ref_idx ON shopee_concorrente(referencia);
ALTER TABLE shopee_concorrente ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS shopee_conc_scan (referencia text PRIMARY KEY, keyword text, scan_em timestamptz, n integer, erro text);
ALTER TABLE shopee_conc_scan ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS shopee_afiliado_config (id int PRIMARY KEY DEFAULT 1, app_id text, secret text,
  endpoint text DEFAULT 'https://open-api.affiliate.shopee.com.br/graphql', atualizado_em timestamptz DEFAULT now());
ALTER TABLE shopee_afiliado_config ENABLE ROW LEVEL SECURITY;
