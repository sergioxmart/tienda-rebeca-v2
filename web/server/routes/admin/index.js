// Entry point del router admin. Combina los sub-routers de TechStore + el
// legacy de Rebeca. El orden importa: primero los routers de TechStore
// (más específicos), después el legacy como fallback.
//
// Cada sub-router expone `tryHandle(req, res) → boolean`. Si devuelve
// `true`, matcheó (sea 200, 404 con error específico, 401, 403, etc.) y
// el admin no sigue. Si devuelve `false`, NO era para él y probamos el
// siguiente. Si ninguno matchea, fallback al legacy.

import { json } from '../../lib/json.js';
import { tryHandleAttributes } from './attributes.js';
import { tryHandleAttributeValues } from './attribute-values.js';
import { tryHandleCategories } from './categories.js';
import { tryHandleProducts } from './products.js';
import { tryHandleVariants } from './variants.js';
import { tryHandleProductMedia } from './product-media.js';
import { tryHandleInventory } from './inventory.js';
import { tryHandleSiteConfig } from './site-config.js';
import { tryHandleUsers } from './users.js';
import { tryHandlePageModules } from './page-modules.js';
import { tryHandleThemes } from './themes.js';
import { tryHandleOrders } from './orders.js';
import { tryHandleSales } from './sales.js';
import { tryHandleBuilder } from './builder.js';
import { handleAdmin as handleAdminLegacy } from './legacy.js';

// Sub-routers de TechStore. Cada uno decide si matchea o no.
const subRouters = [
  tryHandleAttributes,
  tryHandleAttributeValues,
  tryHandleCategories,
  tryHandleProducts,
  tryHandleVariants,
  tryHandleProductMedia,
  tryHandleInventory,
  tryHandleSiteConfig,
  tryHandleUsers,
  tryHandlePageModules,
  tryHandleThemes,
  tryHandleOrders,
  tryHandleSales,
  tryHandleBuilder,
];

/**
 * handleAdmin(req, res) — el entry point que usa server.js.
 *
 * Intenta primero con los sub-routers de TechStore. Si ninguno matchea,
 * cae al legacy de Rebeca. Si ninguno matchea tampoco, 404.
 */
export async function handleAdmin(req, res) {
  // Health check primero
  if ((req.url || '/').split('?')[0] === '/api/admin/health') {
    return json(res, 200, { ok: true, scope: 'admin' });
  }

  for (const tryHandle of subRouters) {
    const handled = await tryHandle(req, res);
    if (handled) return;
  }

  // Fallback al legacy
  return handleAdminLegacy(req, res);
}
