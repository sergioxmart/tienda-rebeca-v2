// GET /media/<yyyy>/<mm>/<file>: sirve archivos de uploads/.
// Acepta imágenes (jpg/png/webp/avif) y video (mp4/webm). Soporta Range
// requests. El handler delega la lectura a core/lib/file.js.

import { existsSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { env } from '../lib/env.js';
import { serveFile } from '../../../core/lib/file.js';

const CONTENT_TYPES = {
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
};

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
}

export async function handleMedia(req, res) {
  const url = new URL(req.url, 'http://x');
  const pathname = decodeURIComponent(url.pathname);

  if (!pathname.startsWith('/media/')) return notFound(res);
  const rel = pathname.slice('/media/'.length);
  if (!rel || rel.includes('..')) return notFound(res);

  const fullPath = normalize(join(env.UPLOADS_DIR, rel));
  if (!fullPath.startsWith(env.UPLOADS_DIR)) return notFound(res);

  if (!existsSync(fullPath)) return notFound(res);
  return serveFile(fullPath, req, res, {
    contentTypes: CONTENT_TYPES,
    alwaysAcceptRanges: true,  // videos piden range
  });
}
