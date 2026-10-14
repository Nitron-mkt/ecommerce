-- Espelho público (CDN) das fotos de produto enviadas ao Anymarket: o servidor de origem (produto.nitron.com.br)
-- é lento p/ o processador de imagens do Anymarket ("servidor da imagem demorou para responder").
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('fotos-any','fotos-any',true,10485760,ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT (id) DO NOTHING;
