// RoleGate: oculta children si el user logueado no puede escribir en la sección.
// Defensivo: si `me` aún no llegó, muestra children (el `useMe` del padre los
// reemplazará cuando llegue la respuesta). Esconder en ese momento causaría
// parpadeo de "Cargando…" en cada navegación.
//
// Uso: <RoleGate section="products"> ... botones de crear/editar ... </RoleGate>

import { canWrite } from '../lib/permissions.js';

export default function RoleGate({ section, me, fallback = null, children }) {
  if (!me) return children;     // aún sin info → no esconder
  if (!canWrite(section, me.role)) return fallback;
  return children;
}
