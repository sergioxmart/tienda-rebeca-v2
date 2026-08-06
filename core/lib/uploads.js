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

// Escribe un buffer a uploads/<yyyy>/<mm>/<uuid>.<ext>.
// Devuelve { url, size_bytes, path }.
export async function writeUploadFile(buffer, mime) {
  const ext = MIME_TO_EXT[mime];
  if (!ext) throw new Error(`unsupported_mime:${mime}`);

  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dir = join(env.UPLOADS_DIR, yyyy, mm);
  await mkdir(dir, { recursive: true });

  const filename = randomUUID() + ext;
  const fullPath = join(dir, filename);
  await writeFile(fullPath, buffer);

  const url = `/media/${yyyy}/${mm}/${filename}`;
  return { url, size_bytes: buffer.length, path: fullPath };
}

// Borra un archivo de uploads (para purga de huérfanas).
export async function deleteUploadFile(url) {
  if (!url || !url.startsWith('/media/')) return;
  const rel = url.replace(/^\/media\//, '');
  const fullPath = join(env.UPLOADS_DIR, rel);
  // Security: prevenir path traversal
  if (!fullPath.startsWith(env.UPLOADS_DIR)) return;
  try {
    await unlink(fullPath);
  } catch (err) {
    if (err.code !== 'ENOENT') log.warn('deleteUploadFile', err.message);
  }
}
