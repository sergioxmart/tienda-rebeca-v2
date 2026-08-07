// Rutas admin para themes (temas del Web Builder).
//
// Un theme es un snapshot de:
//   - la lista de page_modules (en orden)
//   - un subset de site_config (site_name, contact_*, admin_login_bg, etc.)
//
// Endpoints:
//   GET    /api/admin/themes                  → lista
//   POST   /api/admin/themes                  → crear theme desde el estado actual
//   GET    /api/admin/themes/:id              → detalle
//   DELETE /api/admin/themes/:id              → borrar
//   POST   /api/admin/themes/:id/apply        → aplicar (reemplaza modules + subset de site_config)
//   GET    /api/admin/themes/:id/export       → descargar zip con theme.json
//   GET    /api/admin/themes/current/export   → descargar el estado aplicado ahora
//   POST   /api/admin/themes/import           → multipart zip → crea theme nuevo
//
// El zip contiene solo `theme.json`. No embebemos imágenes — esas son
// del sitio, no del theme. Si el theme referencia una imagen que no
// existe, el módulo simplemente no la muestra.

import { query, tx } from '../../lib/db.js';
import { log } from '../../lib/logger.js';
import { json } from '../../lib/json.js';
import AdmZip from 'adm-zip';
import { ZipArchive } from 'archiver';
import multer from 'multer';
import { env } from '../../lib/env.js';
import { protect, recordAudit, validators, validate, notFound } from './_helpers.js';

// Multer propio para el import: acepta CUALQUIER mime (el zip se
// anuncia como application/octet-stream y no queremos validar el
// contenido del zip acá, solo que llegue algo y que sea <= MAX_UPLOAD_BYTES).
const themeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_BYTES },
});

const THEME_VERSION = 1;
const SITE_CONFIG_KEYS_THAT_MATTER = [
  'site_name',
  'contact_email',
  'contact_phone',
  'contact_phone_display',
  'contact_address',
  'contact_instagram',
  'contact_facebook',
  'admin_login_bg',
];

// --- Helpers ---------------------------------------------------------------

async function snapshotCurrent() {
  // Toma los page_modules activos y un subset de site_config.
  const { rows: modules } = await query(
    `SELECT type, position, settings, active
       FROM page_modules
      ORDER BY position, id`,
  );
  const { rows: cfgRows } = await query(
    `SELECT key, value FROM site_config WHERE key = ANY($1)`,
    [SITE_CONFIG_KEYS_THAT_MATTER],
  );
  const site_config_subset = {};
  for (const r of cfgRows) site_config_subset[r.key] = r.value;
  return { version: THEME_VERSION, modules, site_config_subset };
}

function validateThemeShape(theme) {
  if (!theme || typeof theme !== 'object') throw new Error('theme no es un objeto');
  if (theme.version !== THEME_VERSION) throw new Error(`version no soportada: ${theme.version} (esperado ${THEME_VERSION})`);
  if (!Array.isArray(theme.modules)) throw new Error('theme.modules debe ser un array');
  for (const m of theme.modules) {
    if (!m.type || typeof m.type !== 'string') throw new Error('módulo sin type válido');
    if (m.settings !== undefined && (typeof m.settings !== 'object' || Array.isArray(m.settings))) {
      throw new Error(`módulo ${m.type} tiene settings inválido`);
    }
  }
  if (theme.site_config_subset !== undefined && (typeof theme.site_config_subset !== 'object' || Array.isArray(theme.site_config_subset))) {
    throw new Error('site_config_subset debe ser un objeto');
  }
}

// --- Handlers --------------------------------------------------------------

export async function listThemes(req, res) {
  const { rows } = await query(
    `SELECT id, name, description, version, created_at, updated_at
       FROM themes ORDER BY updated_at DESC`,
  );
  return json(res, 200, { ok: true, themes: rows });
}

export async function getTheme(req, res, id) {
  const { rows } = await query(`SELECT * FROM themes WHERE id = $1`, [id]);
  if (rows.length === 0) return notFound(res);
  return json(res, 200, { ok: true, theme: rows[0] });
}

export async function createThemeFromCurrent(req, res) {
  const p = req.body || {};
  if (!validate(res, p, [
    validators.requiredString(p.name, 'name', { max: 100 }),
  ])) return;

  const data = await snapshotCurrent();
  const { rows } = await query(
    `INSERT INTO themes (name, description, version, data)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING id, name, description, version, created_at, updated_at`,
    [p.name, p.description || '', THEME_VERSION, JSON.stringify(data)],
  );
  await recordAudit(req.user?.id, 'theme.create', req.ip, { id: rows[0].id, name: p.name });
  log.info('theme created', { id: rows[0].id, name: p.name, by: req.user?.email });
  return json(res, 201, { ok: true, theme: rows[0] });
}

export async function deleteTheme(req, res, id) {
  const { rows: existing } = await query(`SELECT id, name FROM themes WHERE id = $1`, [id]);
  if (existing.length === 0) return notFound(res);
  await query(`DELETE FROM themes WHERE id = $1`, [id]);
  await recordAudit(req.user?.id, 'theme.delete', req.ip, { id, name: existing[0].name });
  log.info('theme deleted', { id, name: existing[0].name, by: req.user?.email });
  return json(res, 200, { ok: true });
}

export async function applyTheme(req, res, id) {
  const { rows: existing } = await query(`SELECT id, name, data FROM themes WHERE id = $1`, [id]);
  if (existing.length === 0) return notFound(res);

  let theme;
  try { validateThemeShape(existing[0].data); theme = existing[0].data; }
  catch (e) { return json(res, 400, { ok: false, error: 'invalid_theme', message: e.message }); }

  await tx(async (client) => {
    // 1) Reemplazar page_modules: borrar todos y re-insertar desde el theme.
    await client.query(`DELETE FROM page_modules`);
    for (let i = 0; i < theme.modules.length; i++) {
      const m = theme.modules[i];
      await client.query(
        `INSERT INTO page_modules (type, position, settings, active)
         VALUES ($1, $2, $3::jsonb, COALESCE($4, TRUE))`,
        [m.type, i + 1, JSON.stringify(m.settings || {}), m.active],
      );
    }
    // 2) Aplicar site_config_subset (merge).
    const subset = theme.site_config_subset || {};
    for (const [k, v] of Object.entries(subset)) {
      await client.query(
        `INSERT INTO site_config (key, value, updated_at)
         VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [k, JSON.stringify(v)],
      );
    }
  });
  await recordAudit(req.user?.id, 'theme.apply', req.ip, { id, name: existing[0].name });
  log.info('theme applied', { id, name: existing[0].name, by: req.user?.email });
  return json(res, 200, { ok: true });
}

async function sendThemeZip(req, res, name, data, id = 'current') {
  const theme = { ...data, name };
  const filename = name.replace(/[^a-z0-9-]+/gi, '-').toLowerCase() + `.theme.zip`;
  // Bufferizamos el zip entero en memoria antes de mandarlo. Es más
  // simple que pelearse con archiver + streams + response nativa de
  // node:http, y los themes son chiquitos (KB).
  const { PassThrough } = await import('node:stream');
  const passthrough = new PassThrough();
  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.pipe(passthrough);
  archive.append(JSON.stringify(theme, null, 2), { name: 'theme.json' });
  const finalizePromise = archive.finalize();

  const chunks = [];
  for await (const chunk of passthrough) chunks.push(Buffer.from(chunk));
  await finalizePromise;

  const buf = Buffer.concat(chunks);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', String(buf.length));
  res.end(buf);
  log.info('theme exported', { id, name, by: req.user?.email });
}

export async function exportTheme(req, res, id) {
  const { rows } = await query(`SELECT name, data FROM themes WHERE id = $1`, [id]);
  if (rows.length === 0) return notFound(res);
  return sendThemeZip(req, res, rows[0].name, rows[0].data, id);
}

export async function exportCurrentTheme(req, res) {
  const data = await snapshotCurrent();
  return sendThemeZip(req, res, 'Tema actual', data);
}

export async function importTheme(req, res) {
  // multipart zip. multer procesa el body y nos deja req.file.buffer.
  themeUpload.single('file')(req, res, async (err) => {
    if (err) {
      return json(res, 400, { ok: false, error: 'upload_failed', message: err.message });
    }
    if (!req.file) return json(res, 400, { ok: false, error: 'file_required' });

    const buffer = req.file.buffer;
    if (buffer.length === 0) return json(res, 400, { ok: false, error: 'empty_body' });
    if (buffer.length > 10 * 1024 * 1024) return json(res, 400, { ok: false, error: 'file_too_large' });

    let theme;
    try {
      const zip = new AdmZip(buffer);
      const entry = zip.getEntry('theme.json');
      if (!entry) return json(res, 400, { ok: false, error: 'theme_json_not_found' });
      const raw = entry.getData().toString('utf8');
      theme = JSON.parse(raw);
    } catch (e) {
      return json(res, 400, { ok: false, error: 'invalid_json', message: e.message });
    }
    try {
      validateThemeShape(theme);
    } catch (e) {
      return json(res, 400, { ok: false, error: 'invalid_theme', message: e.message });
    }

    // El nombre del theme: si viene name en el JSON, lo usamos; si no, "Theme importado <fecha>".
    const name = (typeof theme.name === 'string' && theme.name.trim())
      ? theme.name.trim()
      : `Theme importado ${new Date().toISOString().slice(0, 10)}`;

    const { rows } = await query(
      `INSERT INTO themes (name, description, version, data)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING id, name, description, version, created_at, updated_at`,
      [name, 'Importado', THEME_VERSION, JSON.stringify(theme)],
    );
    await recordAudit(req.user?.id, 'theme.import', req.ip, { id: rows[0].id, name });
    log.info('theme imported', { id: rows[0].id, name, by: req.user?.email });
    return json(res, 201, { ok: true, theme: rows[0] });
  });
}

// --- Router ---------------------------------------------------------------

const routes = [
  { method: 'GET',    pattern: /^\/api\/admin\/themes\/?$/,                    handler: listThemes,        section: 'site_config' },
  { method: 'POST',   pattern: /^\/api\/admin\/themes\/?$/,                    handler: createThemeFromCurrent, section: 'site_config' },
  { method: 'GET',    pattern: /^\/api\/admin\/themes\/current\/export\/?$/, handler: exportCurrentTheme, section: 'site_config' },
  { method: 'GET',    pattern: /^\/api\/admin\/themes\/(\d+)\/?$/,             handler: getTheme,          section: 'site_config' },
  { method: 'DELETE', pattern: /^\/api\/admin\/themes\/(\d+)\/?$/,             handler: deleteTheme,       section: 'site_config' },
  { method: 'POST',   pattern: /^\/api\/admin\/themes\/(\d+)\/apply\/?$/,      handler: applyTheme,        section: 'site_config' },
  { method: 'GET',    pattern: /^\/api\/admin\/themes\/(\d+)\/export\/?$/,     handler: exportTheme,       section: 'site_config' },
  { method: 'POST',   pattern: /^\/api\/admin\/themes\/import\/?$/,            handler: importTheme,        section: 'site_config' },
];

export async function tryHandleThemes(req, res) {
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
