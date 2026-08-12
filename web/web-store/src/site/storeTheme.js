export const STORE_THEME_DEFAULTS = Object.freeze({
  store_accent_color: '#B89A5E',
  store_primary_color: '#1A1D21',
  store_surface_color: '#FFFFFF',
  store_background_color: '#FAF7F2',
  store_heading_color: '#1A1D21',
  store_product_name_color: '#1A1D21',
  store_price_color: '#B89A5E',
  store_body_text_color: '#1A1D21',
  store_padding_desktop: 24,
  store_padding_mobile: 18,
});

const HEX_COLOR = /^#(?:[0-9A-F]{3}|[0-9A-F]{6})$/i;

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

function normalizePadding(value, fallback, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(0, Math.round(number)));
}

export function normalizeStoreTheme(config = {}) {
  return {
    ...Object.fromEntries(Object.entries(STORE_THEME_DEFAULTS)
      .filter(([key]) => !key.startsWith('store_padding_'))
      .map(([key, fallback]) => [key, normalizeHex(config[key], fallback)])),
    store_padding_desktop: normalizePadding(config.store_padding_desktop, STORE_THEME_DEFAULTS.store_padding_desktop, 96),
    store_padding_mobile: normalizePadding(config.store_padding_mobile, STORE_THEME_DEFAULTS.store_padding_mobile, 48),
  };
}

export function applyStoreTheme(config = {}, category = null) {
  const theme = normalizeStoreTheme(config);
  const categoryAccent = normalizeHex(category?.accent_color, theme.store_accent_color);
  const categoryBackground = normalizeHex(category?.background_color, theme.store_background_color);
  const root = document.documentElement;
  root.style.setProperty('--color-bg', categoryBackground);
  root.style.setProperty('--color-surface', theme.store_surface_color);
  root.style.setProperty('--color-text', theme.store_body_text_color);
  root.style.setProperty('--color-body-text', theme.store_body_text_color);
  root.style.setProperty('--color-primary', theme.store_primary_color);
  root.style.setProperty('--color-primary-hover', darken(theme.store_primary_color));
  root.style.setProperty('--color-accent', categoryAccent);
  root.style.setProperty('--color-accent-hover', darken(categoryAccent));
  root.style.setProperty('--color-heading', theme.store_heading_color);
  root.style.setProperty('--color-product-name', theme.store_product_name_color);
  root.style.setProperty('--color-price', theme.store_price_color);
  root.style.setProperty('--color-accent-soft', rgba(categoryAccent, 0.1));
  root.style.setProperty('--color-accent-shadow', rgba(categoryAccent, 0.22));
  root.style.setProperty('--color-primary-shadow', rgba(theme.store_primary_color, 0.1));
  root.style.setProperty('--color-focus-ring', rgba(categoryAccent, 0.38));
  root.style.setProperty('--cream', categoryBackground);
  root.style.setProperty('--cream-2', rgba(theme.store_primary_color, 0.08));
  root.style.setProperty('--gold', categoryAccent);
  root.style.setProperty('--black', theme.store_primary_color);
  root.style.setProperty('--global-padding-desktop', `${theme.store_padding_desktop}px`);
  root.style.setProperty('--global-padding-mobile', `${theme.store_padding_mobile}px`);
  return theme;
}
