export const STORE_THEME_DEFAULTS = Object.freeze({
  store_accent_color: '#B89A5E',
  store_primary_color: '#1A1D21',
  store_surface_color: '#FFFFFF',
  store_background_color: '#FAF7F2',
  store_heading_color: '#1A1D21',
  store_product_name_color: '#1A1D21',
  store_price_color: '#B89A5E',
  store_body_text_color: '#1A1D21',
});

const HEX_COLOR = /^#[0-9A-F]{6}$/i;

export const STORE_THEME_FIELDS = [
  { key: 'store_accent_color', label: 'Color de acento', description: 'Botones destacados, badges y elementos activos.' },
  { key: 'store_primary_color', label: 'Color primario', description: 'Botones principales, enlaces y navegación.' },
  { key: 'store_surface_color', label: 'Color de contenedores', description: 'Tarjetas, bloques de contenido y superficies.' },
  { key: 'store_background_color', label: 'Fondo principal', description: 'Lienzo general detrás de los contenedores.' },
  { key: 'store_heading_color', label: 'Títulos generales', description: 'Encabezados h1, h2 y h3.' },
  { key: 'store_product_name_color', label: 'Nombres de productos', description: 'Nombres en tarjetas y detalle de producto.' },
  { key: 'store_price_color', label: 'Precios de productos', description: 'Precios principales y totales.' },
  { key: 'store_body_text_color', label: 'Descripciones y texto base', description: 'Texto general y descripciones del catálogo.' },
];

export function normalizeStoreTheme(config = {}) {
  return Object.fromEntries(Object.entries(STORE_THEME_DEFAULTS).map(([key, fallback]) => [
    key,
    HEX_COLOR.test(String(config[key] || '')) ? String(config[key]).toUpperCase() : fallback,
  ]));
}
