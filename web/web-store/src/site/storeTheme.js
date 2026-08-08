export const STORE_THEME_DEFAULTS = Object.freeze({
  store_accent_color: '#FF6B35',
  store_primary_color: '#0F2A47',
  store_surface_color: '#FFFFFF',
  store_background_color: '#F7F8FA',
  store_heading_color: '#0F2A47',
  store_product_name_color: '#0F2A47',
  store_price_color: '#0F2A47',
  store_body_text_color: '#172536',
});

const HEX_COLOR = /^#[0-9A-F]{6}$/i;

function normalizeHex(value, fallback) {
  return HEX_COLOR.test(String(value || '')) ? String(value).toUpperCase() : fallback;
}

function hexToRgb(hex) {
  const value = hex.slice(1);
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
}

function rgba(hex, alpha) {
  const [red, green, blue] = hexToRgb(hex);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function darken(hex, amount = 0.18) {
  const [red, green, blue] = hexToRgb(hex);
  return `#${[red, green, blue].map((channel) => Math.max(0, Math.round(channel * (1 - amount))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export function normalizeStoreTheme(config = {}) {
  return Object.fromEntries(Object.entries(STORE_THEME_DEFAULTS).map(([key, fallback]) => [
    key,
    normalizeHex(config[key], fallback),
  ]));
}

export function applyStoreTheme(config = {}) {
  const theme = normalizeStoreTheme(config);
  const root = document.documentElement;
  root.style.setProperty('--color-bg', theme.store_background_color);
  root.style.setProperty('--color-surface', theme.store_surface_color);
  root.style.setProperty('--color-text', theme.store_body_text_color);
  root.style.setProperty('--color-body-text', theme.store_body_text_color);
  root.style.setProperty('--color-primary', theme.store_primary_color);
  root.style.setProperty('--color-primary-hover', darken(theme.store_primary_color));
  root.style.setProperty('--color-accent', theme.store_accent_color);
  root.style.setProperty('--color-accent-hover', darken(theme.store_accent_color));
  root.style.setProperty('--color-heading', theme.store_heading_color);
  root.style.setProperty('--color-product-name', theme.store_product_name_color);
  root.style.setProperty('--color-price', theme.store_price_color);
  root.style.setProperty('--color-accent-soft', rgba(theme.store_accent_color, 0.1));
  root.style.setProperty('--color-accent-shadow', rgba(theme.store_accent_color, 0.22));
  root.style.setProperty('--color-primary-shadow', rgba(theme.store_primary_color, 0.1));
  root.style.setProperty('--color-focus-ring', rgba(theme.store_accent_color, 0.38));
  return theme;
}
