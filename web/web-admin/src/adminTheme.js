// Paleta configurable del panel de administración.

export const ADMIN_THEME_DEFAULTS = Object.freeze({
  admin_sidebar_bg: '#0F2A47',
  admin_active_color: '#FF6B35',
  admin_main_bg: '#F4F6F8',
  admin_surface_bg: '#FFFFFF',
  admin_text_color: '#1A2733',
});

export const ADMIN_BACKGROUND_DEFAULTS = Object.freeze({
  admin_sidebar_bg_mode: 'solid',
  admin_sidebar_bg_image_url: null,
  admin_sidebar_bg_position_x: 50,
  admin_sidebar_bg_position_y: 50,
  admin_sidebar_bg_zoom: 100,
  admin_main_bg_mode: 'solid',
  admin_main_bg_image_url: null,
  admin_main_bg_position_x: 50,
  admin_main_bg_position_y: 50,
  admin_main_bg_zoom: 100,
  admin_login_bg_position_x: 50,
  admin_login_bg_position_y: 50,
  admin_login_bg_zoom: 100,
});

export const ADMIN_THEME_FIELDS = [
  { key: 'admin_active_color', label: 'Elemento activo' },
  { key: 'admin_surface_bg', label: 'Fondo de contenedores' },
  { key: 'admin_text_color', label: 'Texto general' },
];

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function validColor(value, fallback) {
  return HEX_COLOR_RE.test(String(value || '')) ? String(value).toUpperCase() : fallback;
}

function validNumber(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function normalizedAdminTheme(config = {}) {
  const theme = Object.keys(ADMIN_THEME_DEFAULTS).reduce((result, key) => {
    result[key] = validColor(config[key], ADMIN_THEME_DEFAULTS[key]);
    return result;
  }, { ...ADMIN_BACKGROUND_DEFAULTS });
  for (const prefix of ['admin_sidebar', 'admin_main']) {
    theme[`${prefix}_bg_mode`] = config[`${prefix}_bg_mode`] === 'image' ? 'image' : 'solid';
    theme[`${prefix}_bg_image_url`] = typeof config[`${prefix}_bg_image_url`] === 'string' ? config[`${prefix}_bg_image_url`] : null;
    theme[`${prefix}_bg_position_x`] = validNumber(config[`${prefix}_bg_position_x`], 50, 0, 100);
    theme[`${prefix}_bg_position_y`] = validNumber(config[`${prefix}_bg_position_y`], 50, 0, 100);
    theme[`${prefix}_bg_zoom`] = validNumber(config[`${prefix}_bg_zoom`], 100, 100, 220);
  }
  return theme;
}

function cssImage(url) {
  return url ? `url(${JSON.stringify(url)})` : 'none';
}

export function applyAdminTheme(config = {}) {
  if (typeof document === 'undefined') return;
  const theme = normalizedAdminTheme(config);
  const root = document.documentElement;
  root.style.setProperty('--admin-sidebar-bg', theme.admin_sidebar_bg);
  root.style.setProperty('--color-accent', theme.admin_active_color);
  root.style.setProperty('--color-bg', theme.admin_main_bg);
  root.style.setProperty('--color-surface', theme.admin_surface_bg);
  root.style.setProperty('--color-text', theme.admin_text_color);
  root.style.setProperty('--admin-sidebar-bg-image', cssImage(theme.admin_sidebar_bg_mode === 'image' ? theme.admin_sidebar_bg_image_url : null));
  root.style.setProperty('--admin-sidebar-bg-position', `${theme.admin_sidebar_bg_position_x}% ${theme.admin_sidebar_bg_position_y}%`);
  root.style.setProperty('--admin-sidebar-bg-zoom', String(theme.admin_sidebar_bg_zoom / 100));
  root.style.setProperty('--admin-main-bg-image', cssImage(theme.admin_main_bg_mode === 'image' ? theme.admin_main_bg_image_url : null));
  root.style.setProperty('--admin-main-bg-position', `${theme.admin_main_bg_position_x}% ${theme.admin_main_bg_position_y}%`);
  root.style.setProperty('--admin-main-bg-zoom', String(theme.admin_main_bg_zoom / 100));
  // El valor estándar conserva el texto blanco sobre el sidebar oscuro;
  // cuando se personaliza el texto, también se refleja en el menú lateral.
  root.style.setProperty(
    '--admin-sidebar-text',
    theme.admin_text_color === ADMIN_THEME_DEFAULTS.admin_text_color ? '#FFFFFF' : theme.admin_text_color,
  );
}
