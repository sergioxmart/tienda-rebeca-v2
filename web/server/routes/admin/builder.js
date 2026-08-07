// Draft separado del Web Builder.
//
// El estado publicado continúa en page_modules + site_config y es el único
// que consume 5173. Este router permite editar/aplicar temas en un snapshot
// aislado y publicarlo explícitamente.

import { query, tx } from '../../lib/db.js';
import { json } from '../../lib/json.js';
import { log } from '../../lib/logger.js';
import { protect, recordAudit, notFound } from './_helpers.js';

export const BUILDER_CONFIG_KEYS = [
  'site_name', 'contact_email', 'contact_phone', 'contact_phone_display',
  'contact_address', 'contact_instagram', 'contact_facebook', 'admin_login_bg',
  'navbar_enabled', 'navbar_announcement', 'navbar_show_announcement',
  'navbar_show_search', 'navbar_show_cart', 'navbar_show_categories', 'navbar_links',
];

export async function snapshotPublished(client = null) {
  const runner = client || { query };
  const modules = await runner.query(
    `SELECT id, type, position, settings, active
       FROM page_modules
      ORDER BY position, id`,
  );
  const config = await runner.query(
    `SELECT key, value FROM site_config WHERE key = ANY($1)`,
    [BUILDER_CONFIG_KEYS],
  );
  return {
    modules: modules.rows,
    site_config_subset: Object.fromEntries(config.rows.map((row) => [row.key, row.value])),
  };
}

function validateDraft(data) {
  if (!data || !Array.isArray(data.modules)) return 'modules debe ser un array';
  if (data.modules.length > 100) return 'demasiados módulos';
  if (data.modules.some((module) => !module || typeof module.type !== 'string' || !module.type.trim())) {
    return 'cada módulo necesita un type';
  }
  if (data.site_config_subset !== undefined && (typeof data.site_config_subset !== 'object' || Array.isArray(data.site_config_subset))) {
    return 'site_config_subset debe ser un objeto';
  }
  return null;
}

export async function upsertDraft(data, sourceThemeId = null, user = null, req = null) {
  const error = validateDraft(data);
  if (error) throw Object.assign(new Error(error), { status: 400 });
  const published = await snapshotPublished();
  const config = { ...published.site_config_subset, ...(data.site_config_subset || {}) };
  const { rows } = await query(
    `INSERT INTO builder_drafts (id, modules, site_config_subset, source_theme_id)
     VALUES (1, $1::jsonb, $2::jsonb, $3)
     ON CONFLICT (id) DO UPDATE SET
       modules = EXCLUDED.modules,
       site_config_subset = EXCLUDED.site_config_subset,
       source_theme_id = EXCLUDED.source_theme_id,
       updated_at = NOW()
     RETURNING id, modules, site_config_subset, source_theme_id, created_at, updated_at`,
    [JSON.stringify(data.modules), JSON.stringify(config), sourceThemeId],
  );
  if (req && user) await recordAudit(user.id, 'builder.draft.save', req.ip, { sourceThemeId });
  return rows[0];
}

export async function getDraft(req, res) {
  const { rows } = await query('SELECT * FROM builder_drafts WHERE id = 1');
  if (rows.length > 0) {
    return json(res, 200, { ok: true, has_draft: true, draft: rows[0] });
  }
  const snapshot = await snapshotPublished();
  return json(res, 200, { ok: true, has_draft: false, draft: snapshot });
}

export async function saveDraft(req, res) {
  const draft = await upsertDraft(req.body || {}, null, req.user, req);
  return json(res, 200, { ok: true, has_draft: true, draft });
}

export async function applyThemeToDraft(req, res, themeId) {
  const { rows } = await query('SELECT id, name, data FROM themes WHERE id = $1', [themeId]);
  if (rows.length === 0) return notFound(res);
  const data = rows[0].data || {};
  const draft = await upsertDraft({
    modules: Array.isArray(data.modules) ? data.modules : [],
    site_config_subset: data.site_config_subset || {},
  }, Number(themeId), req.user, req);
  log.info('theme loaded into builder draft', { id: themeId, name: rows[0].name, by: req.user?.email });
  return json(res, 200, { ok: true, draft, theme: { id: rows[0].id, name: rows[0].name } });
}

export async function discardDraft(req, res) {
  await query('DELETE FROM builder_drafts WHERE id = 1');
  await recordAudit(req.user?.id, 'builder.draft.discard', req.ip, {});
  return json(res, 200, { ok: true });
}

export async function publishDraft(req, res) {
  const { rows } = await query('SELECT modules, site_config_subset FROM builder_drafts WHERE id = 1');
  if (rows.length === 0) return json(res, 409, { ok: false, error: 'draft_required' });
  const draft = rows[0];
  const error = validateDraft(draft);
  if (error) return json(res, 400, { ok: false, error: 'invalid_draft', message: error });

  await tx(async (client) => {
    await client.query('DELETE FROM page_modules');
    for (let index = 0; index < draft.modules.length; index++) {
      const module = draft.modules[index];
      await client.query(
        `INSERT INTO page_modules (type, position, settings, active)
         VALUES ($1, $2, $3::jsonb, COALESCE($4, TRUE))`,
        [module.type, index + 1, JSON.stringify(module.settings || {}), module.active],
      );
    }
    for (const [key, value] of Object.entries(draft.site_config_subset || {})) {
      if (!BUILDER_CONFIG_KEYS.includes(key)) continue;
      await client.query(
        `INSERT INTO site_config (key, value, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, JSON.stringify(value)],
      );
    }
    await client.query('DELETE FROM builder_drafts WHERE id = 1');
  });
  await recordAudit(req.user?.id, 'builder.draft.publish', req.ip, {});
  log.info('builder draft published', { by: req.user?.email });
  return json(res, 200, { ok: true });
}

const routes = [
  { method: 'GET', pattern: /^\/api\/admin\/builder\/draft\/?$/, handler: getDraft, section: 'site_config' },
  { method: 'POST', pattern: /^\/api\/admin\/builder\/draft\/?$/, handler: saveDraft, section: 'site_config' },
  { method: 'POST', pattern: /^\/api\/admin\/builder\/draft\/from-theme\/(\d+)\/?$/, handler: applyThemeToDraft, section: 'site_config' },
  { method: 'DELETE', pattern: /^\/api\/admin\/builder\/draft\/?$/, handler: discardDraft, section: 'site_config' },
  { method: 'POST', pattern: /^\/api\/admin\/builder\/publish\/?$/, handler: publishDraft, section: 'site_config' },
];

export async function tryHandleBuilder(req, res) {
  const method = req.method || 'GET';
  const pathname = (req.url || '/').split('?')[0];
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = route.pattern.exec(pathname);
    if (!match) continue;
    return protect(route.handler, route.section)(req, res, match[1]) || true;
  }
  return false;
}
