-- Rebeca Andrade v2 — defaults de marca para la base nueva.
-- Se conserva el esquema de catálogo actual; el contenido se puede cambiar
-- desde Site Config y el Web Builder.

UPDATE site_config
   SET value = to_jsonb('Rebeca Andrade'::text), updated_at = NOW()
 WHERE key = 'site_name' AND value = to_jsonb('TechStore'::text);

UPDATE site_config
   SET value = to_jsonb('Envíos a toda Colombia · Diseños para momentos inolvidables'::text), updated_at = NOW()
 WHERE key = 'navbar_announcement'
   AND value = to_jsonb('Envíos a toda Colombia · Compra fácil y segura'::text);

UPDATE page_modules
   SET settings = jsonb_set(
     jsonb_set(settings, '{title}', to_jsonb('Tu vestido ideal para un momento inolvidable'::text), TRUE),
     '{subtitle}', to_jsonb('Descubre piezas cuidadosamente seleccionadas para celebrar tus momentos más especiales.'::text), TRUE
   ), updated_at = NOW()
 WHERE type = 'hero'
   AND settings->>'title' = 'Todo para tu celular, en un solo lugar';
