// Helper para servir un archivo desde disco en una response de node:http.
// Usado por:
//   - core/lib/static.js   → servir los dists del front (HTML/JS/CSS/fuentes)
//   - web/server/routes/media.js → servir uploads (imágenes/video)
//
// Parametrizable:
//   - contentTypes:    mapa de extensión → Content-Type. Default = los de
//                      dists del front (HTML/JS/CSS/...). Para media,
//                      pasá los de imágenes/video.
//   - cacheControl:    valor del header Cache-Control. Default = 'public, max-age=3600'.
//                      Para media, podés setear null si no querés cache.
//   - alwaysAcceptRanges: si true, setea 'Accept-Ranges: bytes' siempre.
//                         Default = false (solo se setea cuando hay range).

import { createReadStream, statSync } from 'node:fs';
import { extname } from 'node:path';

const DEFAULT_CONTENT_TYPES = {
  '.html':  'text/html; charset=utf-8',
  '.js':    'application/javascript; charset=utf-8',
  '.mjs':   'application/javascript; charset=utf-8',
  '.css':   'text/css; charset=utf-8',
  '.json':  'application/json; charset=utf-8',
  '.svg':   'image/svg+xml',
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.jpeg':  'image/jpeg',
  '.webp':  'image/webp',
  '.avif':  'image/avif',
  '.ico':   'image/x-icon',
  '.txt':   'text/plain; charset=utf-8',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':   'font/ttf',
  '.map':   'application/json; charset=utf-8',
};

export function serveFile(absPath, req, res, opts = {}) {
  const {
    contentTypes = DEFAULT_CONTENT_TYPES,
    cacheControl = 'public, max-age=3600',
    alwaysAcceptRanges = false,
  } = opts;

  let stat;
  try { stat = statSync(absPath); } catch { return notFound(res); }
  if (!stat.isFile()) return notFound(res);

  const ext = extname(absPath).toLowerCase();
  const contentType = contentTypes[ext] || 'application/octet-stream';
  const headers = {
    'Content-Type':   contentType,
    'Content-Length': stat.size,
  };
  if (cacheControl) headers['Cache-Control'] = cacheControl;
  if (alwaysAcceptRanges) headers['Accept-Ranges'] = 'bytes';

  // Soporte de range (no es crítico para SPA, pero ayuda con assets grandes).
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      const start = m[1] ? Number(m[1]) : 0;
      const end   = m[2] ? Number(m[2]) : stat.size - 1;
      if (start >= stat.size || end >= stat.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        return res.end();
      }
      headers['Content-Range']  = `bytes ${start}-${end}/${stat.size}`;
      headers['Content-Length'] = end - start + 1;
      headers['Accept-Ranges']  = 'bytes';
      res.writeHead(206, headers);
      return createReadStream(absPath, { start, end }).pipe(res);
    }
  }

  res.writeHead(200, headers);
  createReadStream(absPath).pipe(res);
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
}
