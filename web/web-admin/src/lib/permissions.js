// Permisos del panel de administración, espejados del backend
// (web/server/routes/admin.js → SECTION_PERMS).
//
// Regla: el frontend oculta lo que no se puede usar, pero el backend
// siempre es la fuente de verdad. Si el rol del user cambia, el JWT
// sigue siendo válido hasta que expire; los rechazos reales los hace el
// server (403 forbidden).

export const ROLES = ['admin', 'operator', 'viewer'];

export const SECTION_PERMS = {
  users:         { write: ['admin'],                                read: ['admin'] },
  collections:   { write: ['admin'],                                read: ['admin', 'operator', 'viewer'] },
  sizes:         { write: [],                                       read: ['admin', 'operator', 'viewer'] },
  size_systems:  { write: ['admin'],                                read: ['admin', 'operator', 'viewer'] },
  color_systems: { write: ['admin'],                                read: ['admin', 'operator', 'viewer'] },
  products:      { write: ['admin'],                                read: ['admin', 'operator', 'viewer'] },
  media:         { write: ['admin'],                                read: ['admin', 'operator', 'viewer'] },
  inventory:     { write: ['admin', 'operator'],                    read: ['admin', 'operator', 'viewer'] },
  sales:         { write: ['admin', 'operator'],                    read: ['admin', 'operator', 'viewer'] },
  cash:          { write: ['admin', 'operator'],                    read: ['admin', 'operator', 'viewer'] },
  reservations:  { write: ['admin', 'operator'],                    read: ['admin', 'operator', 'viewer'] },
  closures:      { write: ['admin'],                                read: ['admin', 'operator', 'viewer'] },
  modules:       { write: ['admin'],                                read: ['admin', 'operator', 'viewer'] },
  site_config:   { write: ['admin'],                                read: ['admin', 'operator', 'viewer'] },
};

export function canRead(section, role) {
  if (!role) return false;
  return SECTION_PERMS[section]?.read?.includes(role) ?? false;
}

export function canWrite(section, role) {
  if (!role) return false;
  return SECTION_PERMS[section]?.write?.includes(role) ?? false;
}

// Mapeo de rutas del sidebar a secciones (para filtrar links).
// Coincide con la config `SECTIONS` de App.jsx → ModuleLayout.
export const SIDEBAR_SECTION_MAP = {
  // Gestión General
  '/admin/general':            'dashboard',
  '/admin/general/inventario': 'inventory',
  '/admin/general/colecciones': 'collections',
  '/admin/general/ventas':     'sales',
  '/admin/general/caja':       'cash',
  '/admin/general/cierres':    'closures',
  '/admin/general/reservas':   'reservations',
  // Gestión Tienda
  '/admin/tienda/colecciones': 'collections',
  '/admin/tienda/productos':   'products',
  '/admin/tienda/config':      'site_config',
  '/admin/tienda/pagina':      'modules',
  '/admin/tienda/media':       'media',
  // Home (topbar)
  '/admin/ajustes':            'size_systems',
  '/admin/usuarios':           'users',
};

export function isLinkVisible(path, role) {
  const section = SIDEBAR_SECTION_MAP[path];
  if (!section) return true; // ruta sin sección explícita (ej: home) → visible
  return canRead(section, role);
}
