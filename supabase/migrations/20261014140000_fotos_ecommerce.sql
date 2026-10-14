-- aplicada em 14/10/2026 via MCP ("fotos_ecommerce")
CREATE TABLE IF NOT EXISTS produto_foto_ecom (referencia text NOT NULL, idx int NOT NULL, url text NOT NULL, bytes int, verificado_em timestamptz DEFAULT now(), PRIMARY KEY (referencia, idx));
ALTER TABLE produto_foto_ecom ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS foto_ecom_scan (referencia text PRIMARY KEY, n int, scan_em timestamptz DEFAULT now());
ALTER TABLE foto_ecom_scan ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS produto_foto_bkp_20261014 AS SELECT * FROM produto_foto;
CREATE TABLE IF NOT EXISTS anymarket_foto_envio (product_id text PRIMARY KEY, referencias text[], n_antes int, imagens_antes jsonb, n_depois int, http int, resultado text, em timestamptz DEFAULT now());
ALTER TABLE anymarket_foto_envio ENABLE ROW LEVEL SECURITY;
