// Rutas admin para site_config.
//
// site_config es key/value JSONB con los globals del sitio (nombre,
// contacto, moneda, branding). El admin edita y el público lee.
//
// API:
//   GET   /api/admin/site-config         → devuelve TODO (objeto)
//   PATCH /api/admin/site-config         → actualiza un subset
//                                          body: { key: value, ... }
//   POST  /api/admin/site-config/logo    → upload del logo (multipart)
//                                          guarda en uploads/site/<yyyy>/<mm>/logo.<ext>
//                                          y setea site_config.logo_url en /media/site/...
//   DELETE /api/admin/site-config/logo   → borra el logo (archivo + key)
//   POST  /api/admin/site-config/login-background → upload del fondo (multipart)
//
// El PATCH es por key, no por path. Esto permite mandar varios keys
// en una sola request. Internamente, hace UPSERT por cada key.

import { query, tx } from '../../lib/db.js';
import { log } from '../../lib/logger.js';
import { json } from '../../lib/json.js';
import { upload, writeUploadFile, deleteUploadFile } from '../../lib/uploads.js';
import { protect, recordAudit } from './_helpers.js';

function normalizeMediaUrl(value) {
  return typeof value === 'string' && value.startsWith('/site/')
    ? `/media/site/${value.slice('/site/'.length)}`
    : value;
}

const ADMIN_BACKGROUND_TARGETS = {
  sidebar: {
    imageKey: 'admin_sidebar_bg_image_url',
    modeKey: 'admin_sidebar_bg_mode',
    filename: 'admin-sidebar-background',
  },
  main: {
    imageKey: 'admin_main_bg_image_url',
    modeKey: 'admin_main_bg_mode',
    filename: 'admin-main-background',
  },
};

const ADMIN_COLOR_KEYS = [
  'admin_sidebar_bg',
  'admin_active_color',
  'admin_main_bg',
  'admin_surface_bg',
  'admin_text_color',
];
const ADMIN_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const ADMIN_BACKGROUND_PREFIXES = [
  { prefix: 'admin_sidebar', modes: ['solid', 'image'] },
  { prefix: 'admin_main', modes: ['solid', 'image'] },
  { prefix: 'admin_login', modes: ['solid', 'gradient', 'image'] },
];

// --- Handlers -------------------------------------------------------------

export async function getSiteConfig(req, res) {
  const { rows } = await query(
    `SELECT key, value, updated_at FROM site_config ORDER BY key`,
  );
  // Devolvemos como objeto { key: value } en vez de array, más cómodo para el cliente.
  const out = {};
  for (const r of rows) {
    out[r.key] = ['logo_url', 'admin_login_bg_image_url', 'admin_sidebar_bg_image_url', 'admin_main_bg_image_url'].includes(r.key)
      ? normalizeMediaUrl(r.value)
      : r.value;
  }
  return json(res, 200, { ok: true, config: out });
}

export async function updateSiteConfig(req, res) {
  const p = req.body || {};
  const keys = Object.keys(p);
  if (keys.length === 0) {
    return json(res, 400, { ok: false, error: 'empty_payload' });
  }
  // Validación: todas las keys son strings no vacíos.
  for (const k of keys) {
    if (typeof k !== 'string' || !k.trim()) {
      return json(res, 400, { ok: false, error: 'invalid_key', key: k });
    }
  }
  for (const key of ADMIN_COLOR_KEYS) {
    if (p[key] !== undefined && (typeof p[key] !== 'string' || !ADMIN_COLOR_RE.test(p[key]))) {
      return json(res, 400, { ok: false, error: 'invalid_admin_color', key });
    }
  }
  for (const { prefix, modes } of ADMIN_BACKGROUND_PREFIXES) {
    const modeKey = `${prefix}_bg_mode`;
    if (p[modeKey] !== undefined && !modes.includes(p[modeKey])) {
      return json(res, 400, { ok: false, error: 'invalid_admin_background_mode', key: modeKey });
    }
    for (const key of [`${prefix}_bg_position_x`, `${prefix}_bg_position_y`]) {
      if (p[key] !== undefined && (!Number.isFinite(Number(p[key])) || Number(p[key]) < 0 || Number(p[key]) > 100)) {
        return json(res, 400, { ok: false, error: 'invalid_admin_background_position', key });
      }
    }
    const zoomKey = `${prefix}_bg_zoom`;
    if (p[zoomKey] !== undefined && (!Number.isFinite(Number(p[zoomKey])) || Number(p[zoomKey]) < 100 || Number(p[zoomKey]) > 220)) {
      return json(res, 400, { ok: false, error: 'invalid_admin_background_zoom', key: zoomKey });
    }
  }
  if (p.admin_login_bg !== undefined &&
      (typeof p.admin_login_bg !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(p.admin_login_bg))) {
    return json(res, 400, { ok: false, error: 'invalid_login_background_color' });
  }
  if (p.admin_login_bg_secondary !== undefined &&
      (typeof p.admin_login_bg_secondary !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(p.admin_login_bg_secondary))) {
    return json(res, 400, { ok: false, error: 'invalid_login_background_secondary_color' });
  }
  if (p.admin_login_bg_mode !== undefined && !['solid', 'gradient', 'image'].includes(p.admin_login_bg_mode)) {
    return json(res, 400, { ok: false, error: 'invalid_login_background_mode' });
  }

  // UPSERT atómico de cada key. ON CONFLICT (key) DO UPDATE.
  await tx(async (client) => {
    for (const key of keys) {
      await client.query(
        `INSERT INTO site_config (key, value, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE
           SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, JSON.stringify(p[key])],
      );
    }
  });
  await recordAudit(req.user?.id, 'site_config.update', req.ip, { keys });
  log.info('site_config updated', { keys, by: req.user?.email });

  // Devolvemos el estado nuevo.
  const { rows } = await query(`SELECT key, value FROM site_config WHERE key = ANY($1)`, [keys]);
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return json(res, 200, { ok: true, config: out });
}

// --- Logo upload ----------------------------------------------------------

export async function uploadLogo(req, res) {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      log.warn('logo upload error', { msg: err.message });
      return json(res, 400, { ok: false, error: 'upload_failed', message: err.message });
    }
    if (!req.file) return json(res, 400, { ok: false, error: 'file_required' });

    // Borrar el logo viejo si existe (best-effort)
    const { rows: old } = await query(`SELECT value FROM site_config WHERE key = 'logo_url'`);
    if (old[0]?.value && typeof old[0].value === 'string') {
      try { await deleteUploadFile(old[0].value); } catch { /* ignore */ }
    }

    // Escribir el nuevo. Forzamos nombre estable "logo" para que el
    // browser pueda cachearlo por URL.
    const result = await writeUploadFile(req.file, { subdir: 'site', filename: 'logo' });
    const { url } = result;

    await tx(async (client) => {
      await client.query(
        `INSERT INTO site_config (key, value, updated_at)
         VALUES ('logo_url', $1::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [JSON.stringify(url)],
      );
    });
    await recordAudit(req.user?.id, 'site_config.logo_upload', req.ip, { url });
    log.info('logo uploaded', { url, by: req.user?.email });
    return json(res, 200, { ok: true, logo_url: url });
  });
}

export async function deleteLogo(req, res) {
  const { rows } = await query(`SELECT value FROM site_config WHERE key = 'logo_url'`);
  const current = rows[0]?.value;
  if (current && typeof current === 'string') {
    try { await deleteUploadFile(current); } catch { /* ignore */ }
  }
  await query(
    `INSERT INTO site_config (key, value, updated_at)
     VALUES ('logo_url', 'null'::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
  );
  await recordAudit(req.user?.id, 'site_config.logo_delete', req.ip, {});
  log.info('logo deleted', { by: req.user?.email });
  return json(res, 200, { ok: true });
}

export async function uploadLoginBackground(req, res) {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      log.warn('login background upload error', { msg: err.message });
      return json(res, 400, { ok: false, error: 'upload_failed', message: err.message });
    }
    if (!req.file) return json(res, 400, { ok: false, error: 'file_required' });

    const { rows: old } = await query(`SELECT value FROM site_config WHERE key = 'admin_login_bg_image_url'`);
    if (old[0]?.value && typeof old[0].value === 'string') {
      try { await deleteUploadFile(old[0].value); } catch { /* ignore */ }
    }

    const { url } = await writeUploadFile(req.file, { subdir: 'site', filename: 'login-background' });
    await tx(async (client) => {
      await client.query(
        `INSERT INTO site_config (key, value, updated_at)
         VALUES ('admin_login_bg_image_url', $1::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [JSON.stringify(url)],
      );
      await client.query(
        `INSERT INTO site_config (key, value, updated_at)
         VALUES ('admin_login_bg_mode', '"image"'::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      );
    });
    await recordAudit(req.user?.id, 'site_config.login_background_upload', req.ip, { url });
    return json(res, 200, { ok: true, image_url: url });
  });
}

export async function deleteLoginBackground(req, res) {
  const { rows } = await query(`SELECT value FROM site_config WHERE key = 'admin_login_bg_image_url'`);
  const current = rows[0]?.value;
  if (current && typeof current === 'string') {
    try { await deleteUploadFile(current); } catch { /* ignore */ }
  }
  await query(
    `INSERT INTO site_config (key, value, updated_at)
     VALUES ('admin_login_bg_image_url', 'null'::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = 'null'::jsonb, updated_at = NOW()`,
  );
  await query(
    `INSERT INTO site_config (key, value, updated_at)
     VALUES ('admin_login_bg_mode', '"solid"'::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
  );
  await recordAudit(req.user?.id, 'site_config.login_background_delete', req.ip, {});
  return json(res, 200, { ok: true });
}

export function uploadAdminBackground(req, res, scope) {
  const target = ADMIN_BACKGROUND_TARGETS[scope];
  if (!target) return json(res, 404, { ok: false, error: 'not_found' });
  upload.single('file')(req, res, async (err) => {
    if (err) {
      log.warn('admin background upload error', { scope, msg: err.message });
      return json(res, 400, { ok: false, error: 'upload_failed', message: err.message });
    }
    if (!req.file) return json(res, 400, { ok: false, error: 'file_required' });

    const { rows: old } = await query(`SELECT value FROM site_config WHERE key = $1`, [target.imageKey]);
    if (old[0]?.value && typeof old[0].value === 'string') {
      try { await deleteUploadFile(old[0].value); } catch { /* ignore */ }
    }

    const { url } = await writeUploadFile(req.file, { subdir: 'site', filename: target.filename });
    await tx(async (client) => {
      await client.query(
        `INSERT INTO site_config (key, value, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [target.imageKey, JSON.stringify(url)],
      );
      await client.query(
        `INSERT INTO site_config (key, value, updated_at)
         VALUES ($1, '"image"'::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [target.modeKey],
      );
    });
    await recordAudit(req.user?.id, `site_config.${scope}_background_upload`, req.ip, { url });
    return json(res, 200, { ok: true, image_url: url, mode: 'image' });
  });
}

export async function deleteAdminBackground(req, res, scope) {
  const target = ADMIN_BACKGROUND_TARGETS[scope];
  if (!target) return json(res, 404, { ok: false, error: 'not_found' });
  const { rows } = await query(`SELECT value FROM site_config WHERE key = $1`, [target.imageKey]);
  const current = rows[0]?.value;
  if (current && typeof current === 'string') {
    try { await deleteUploadFile(current); } catch { /* ignore */ }
  }
  await tx(async (client) => {
    await client.query(
      `INSERT INTO site_config (key, value, updated_at)
       VALUES ($1, 'null'::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = 'null'::jsonb, updated_at = NOW()`,
      [target.imageKey],
    );
    await client.query(
      `INSERT INTO site_config (key, value, updated_at)
       VALUES ($1, '"solid"'::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [target.modeKey],
    );
  });
  await recordAudit(req.user?.id, `site_config.${scope}_background_delete`, req.ip, {});
  return json(res, 200, { ok: true });
}

// --- Router ---------------------------------------------------------------

const routes = [
  { method: 'GET',    pattern: /^\/api\/admin\/site-config\/?$/,       handler: getSiteConfig,    section: 'site_config' },
  { method: 'PATCH',  pattern: /^\/api\/admin\/site-config\/?$/,       handler: updateSiteConfig, section: 'site_config' },
  { method: 'POST',   pattern: /^\/api\/admin\/site-config\/logo\/?$/, handler: uploadLogo,       section: 'site_config' },
  { method: 'DELETE', pattern: /^\/api\/admin\/site-config\/logo\/?$/, handler: deleteLogo,       section: 'site_config' },
  { method: 'POST',   pattern: /^\/api\/admin\/site-config\/login-background\/?$/, handler: uploadLoginBackground, section: 'site_config' },
  { method: 'DELETE', pattern: /^\/api\/admin\/site-config\/login-background\/?$/, handler: deleteLoginBackground, section: 'site_config' },
  { method: 'POST',   pattern: /^\/api\/admin\/site-config\/admin-(sidebar|main)-background\/?$/, handler: uploadAdminBackground, section: 'site_config' },
  { method: 'DELETE', pattern: /^\/api\/admin\/site-config\/admin-(sidebar|main)-background\/?$/, handler: deleteAdminBackground, section: 'site_config' },
];

export async function tryHandleSiteConfig(req, res) {
  const method = req.method || 'GET';
  const pathname = (req.url || '/').split('?')[0];
  for (const route of routes) {
    if (route.method !== method) continue;
    const m = route.pattern.exec(pathname);
    if (!m) continue;
    return protect(route.handler, route.section)(req, res, m[1]) || true;
  }
  return false;
}
