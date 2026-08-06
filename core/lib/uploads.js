// Helpers de uploads: multer config + escritura a disco + URL pública.

import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { env } from './env.js';
import { log } from './logger.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/png':  '.png',
  'image/webp': '.webp',
  'image/avif': '.avif',
};

// Multer en memoria (límite y validación acá; la escritura a disco la hacemos
// nosotros para tener control total del path y nombre).
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_BYTES },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error(`unsupported_mime:${file.mimetype}`));
    }
    cb(null, true);
  },
});

// Escribe un archivo a `uploads/<subdir>/<yyyy>/<mm>/<filename>`.
//
// Acepta dos formas de llamada:
//
//   1) (req.file, { subdir, filename? })
//      - buffer: req.file.buffer
//      - mime:   req.file.mimetype
//      - útil cuando multer ya procesó el multipart
//
//   2) (buffer, { subdir, mime, filename? })
//      - cuando el caller ya tiene un Buffer y el mime por separado
//
// `subdir` indica la categoría ('media', 'site', etc.). Se usa como
// carpeta inmediata bajo UPLOADS_DIR; abajo va yyyy/mm/<filename>.
//
// `filename` (opcional) si se quiere nombre estable (ej. 'logo' para
// que el browser lo cachee por URL). Si no, se genera un UUID.
//
// Devuelve { url, size_bytes, path }. Las URLs públicas siempre pasan por
// `/media`, aunque el archivo esté en una subcarpeta distinta (por ejemplo,
// `/media/site/2026/08/logo.png`).
export async function writeUploadFile(fileOrBuffer, options = {}) {
  let buffer, mime, subdir, filename;

  // Detectar la forma de la llamada
  if (fileOrBuffer && typeof fileOrBuffer === 'object' && Buffer.isBuffer(fileOrBuffer.buffer) && typeof fileOrBuffer.mimetype === 'string') {
    // multer req.file
    buffer = fileOrBuffer.buffer;
    mime   = fileOrBuffer.mimetype;
    subdir    = options.subdir || 'media';
    filename  = options.filename;
  } else if (Buffer.isBuffer(fileOrBuffer)) {
    // Buffer puro
    buffer = fileOrBuffer;
    mime   = options.mime;
    subdir    = options.subdir || 'media';
    filename  = options.filename;
  } else {
    throw new Error('writeUploadFile: argumento inválido (esperaba req.file de multer o Buffer)');
  }

  if (!mime) throw new Error('writeUploadFile: falta mime');
  const ext = MIME_TO_EXT[mime];
  if (!ext) throw new Error(`unsupported_mime:${mime}`);

  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dir = join(env.UPLOADS_DIR, subdir, yyyy, mm);
  await mkdir(dir, { recursive: true });

  const finalName = filename
    ? filename + ext
    : randomUUID() + ext;
  const fullPath = join(dir, finalName);
  await writeFile(fullPath, buffer);

  // `media` mantiene su URL histórica `/media/yyyy/mm/...`; las demás
  // categorías quedan bajo `/media/<subdir>/...` para que el servidor y el
  // proxy del admin puedan servirlas con un único prefijo.
  const urlPrefix = options.urlPrefix || (subdir === 'media' ? '/media' : `/media/${subdir}`);
  const url = `${urlPrefix}/${yyyy}/${mm}/${finalName}`;
  return { url, size_bytes: buffer.length, path: fullPath };
}

// Borra un archivo de uploads. Acepta URLs nuevas (`/media/site/...`), URLs
// de media (`/media/...`) y la URL `/site/...` que se generó durante la
// primera versión del upload de logo.
export async function deleteUploadFile(url) {
  if (!url || !url.startsWith('/')) return;
  const candidates = [];
  if (url.startsWith('/media/site/')) {
    candidates.push(join(env.UPLOADS_DIR, 'site', url.slice('/media/site/'.length)));
  } else if (url.startsWith('/media/media/')) {
    candidates.push(join(env.UPLOADS_DIR, 'media', url.slice('/media/media/'.length)));
  } else if (url.startsWith('/media/')) {
    const rel = url.slice('/media/'.length);
    // Primero intentamos la ubicación actual de media y luego la ubicación
    // legacy usada antes de separar los subdirectorios.
    candidates.push(join(env.UPLOADS_DIR, 'media', rel));
    candidates.push(join(env.UPLOADS_DIR, rel));
  } else if (url.startsWith('/site/')) {
    candidates.push(join(env.UPLOADS_DIR, url.slice('/site/'.length)));
    candidates.push(join(env.UPLOADS_DIR, 'site', url.slice('/site/'.length)));
  }

  for (const fullPath of candidates) {
    // Security: prevenir path traversal y no salir de UPLOADS_DIR.
    if (!fullPath.startsWith(`${env.UPLOADS_DIR}/`)) continue;
    try {
      await unlink(fullPath);
      return;
    } catch (err) {
      if (err.code !== 'ENOENT') log.warn('deleteUploadFile', err.message);
    }
  }
}
