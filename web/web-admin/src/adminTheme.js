// Paleta configurable del panel de administración.

export const ADMIN_THEME_DEFAULTS = Object.freeze({
  admin_sidebar_bg: '#0F2A47',
  admin_active_color: '#FF6B35',
  admin_main_bg: '#F4F6F8',
  admin_surface_bg: '#FFFFFF',
  admin_text_color: '#1A2733',
});

export const ADMIN_THEME_FIELDS = [
  { key: 'admin_sidebar_bg', label: 'Fondo de la barra lateral' },
  { key: 'admin_active_color', label: 'Elemento activo' },
  { key: 'admin_main_bg', label: 'Fondo principal' },
  { key: 'admin_surface_bg', label: 'Fondo de contenedores' },
  { key: 'admin_text_color', label: 'Texto general' },
];

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function validColor(value, fallback) {
  return HEX_COLOR_RE.test(String(value || '')) ? String(value).toUpperCase() : fallback;
}

export function normalizedAdminTheme(config = {}) {
  return ADMIN_THEME_FIELDS.reduce((theme, field) => {
    theme[field.key] = validColor(config[field.key], ADMIN_THEME_DEFAULTS[field.key]);
    return theme;
  }, {});
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
  // El valor estándar conserva el texto blanco sobre el sidebar oscuro;
  // cuando se personaliza el texto, también se refleja en el menú lateral.
  root.style.setProperty(
    '--admin-sidebar-text',
    theme.admin_text_color === ADMIN_THEME_DEFAULTS.admin_text_color ? '#FFFFFF' : theme.admin_text_color,
  );
}
