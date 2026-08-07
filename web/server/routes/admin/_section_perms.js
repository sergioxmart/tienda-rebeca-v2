// Permisos por sección para TechStore v1.
//
// `write` aplica a métodos no seguros (POST, PATCH, DELETE).
// `read` aplica a métodos seguros (GET, HEAD, OPTIONS).
// Cualquier ruta que se agregue a un router admin debe declarar su
// `section` (el `protect()` falla con 403 si falta).

export const SECTION_PERMS = {
  // Gestión de cuentas: solo admins
  users: { write: ['admin'], read: ['admin'] },

  // Catálogo: solo admin escribe, todos leen
  categories:       { write: ['admin'],                                  read: ['admin', 'operator', 'viewer'] },
  attributes:       { write: ['admin'],                                  read: ['admin', 'operator', 'viewer'] },
  attribute_values: { write: ['admin'],                                  read: ['admin', 'operator', 'viewer'] },
  products:         { write: ['admin'],                                  read: ['admin', 'operator', 'viewer'] },
  variants:         { write: ['admin'],                                  read: ['admin', 'operator', 'viewer'] },
  media:            { write: ['admin'],                                  read: ['admin', 'operator', 'viewer'] },
  inventory:        { write: ['admin', 'operator'],                      read: ['admin', 'operator', 'viewer'] },

  // Operación: admin y operator escriben
  orders:   { write: ['admin', 'operator'], read: ['admin', 'operator', 'viewer'] },
  payments: { write: ['admin', 'operator'], read: ['admin', 'operator', 'viewer'] },
  sales:   { write: ['admin', 'operator'], read: ['admin', 'operator', 'viewer'] },

  // Config: solo admin escribe, todos leen
  site_config: { write: ['admin'], read: ['admin', 'operator', 'viewer'] },
};
