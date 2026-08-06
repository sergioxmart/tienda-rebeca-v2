// Factory para servir archivos estáticos de 2 SPAs (store público + admin)
// con SPA fallback a index.html. Soporta Range requests.
//
// Uso:
//   const { createStaticHandler } from '.../static.js';
//   const serveStatic = createStaticHandler({
//     publicDir: '/path/to/public',   // requerido: contiene 'store/' y 'admin/'
//     storePath: '/',                // default '/'
//     adminPath: '/admin',           // default '/admin'
//     // adminPath: '/' sirve el admin desde la raíz (host dedicado).
//   });
//   http.createServer(serveStatic);
//
// La lectura de archivos en disco la hace `core/lib/file.js` (que también usa
// web/server/routes/media.js para /media/*).
//
// La export `serveStatic` queda como wrapper default que apunta a un
// `publicDir` relativo al archivo de core (compat con versiones viejas).

import { statSync, existsSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { serveFile as serveFileBase } from './file.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
}

function safeJoin(base, rel) {
  // Evita path traversal (.. sale de base).
  const joined = normalize(join(base, rel));
  if (!joined.startsWith(base)) return null;
  return joined;
}
// Exportado para tests; el llamador nunca lo necesita.
export { safeJoin };

export function createStaticHandler({
  publicDir,
  storePath = '/',
  adminPath = '/admin',
} = {}) {
  if (!publicDir) {
    throw new Error('createStaticHandler: publicDir es obligatorio');
  }

  const STORE_DIR = join(publicDir, 'store');
  const ADMIN_DIR = join(publicDir, 'admin');

  // Normalizamos para que startsWith() no falle por trailing slash.
  const STORE_DIR_N = normalize(STORE_DIR);
  const ADMIN_DIR_N = normalize(ADMIN_DIR);

  // SPA fallback por defecto: index.html de cada dir.
  const STORE_FALLBACK = join(STORE_DIR, 'index.html');
  const ADMIN_FALLBACK = join(ADMIN_DIR, 'index.html');

  // Quitar trailing slash para comparar startsWith correctamente.
  const storePrefix = storePath.endsWith('/') ? storePath.slice(0, -1) : storePath;
  const adminPrefix = adminPath.endsWith('/') ? adminPath.slice(0, -1) : adminPath;
  const adminAtRoot = adminPath === '/';

  return function serveStatic(req, res) {
    const url = new URL(req.url, 'http://x');
    const pathname = decodeURIComponent(url.pathname);

    // Admin en un hostname dedicado: todas las rutas estáticas corresponden
    // a esa SPA. El caller debe filtrar antes /api y /media si las proxya.
    if (adminAtRoot) {
      const direct = safeJoin(ADMIN_DIR_N, pathname === '/' ? '/index.html' : pathname);
      if (direct === null) return notFound(res);
      if (existsSync(direct) && statSync(direct).isFile()) {
        return serveFileBase(direct, req, res);
      }
      return serveFileBase(ADMIN_FALLBACK, req, res);
    }

    // Admin (prefijo)
    if (adminPrefix && pathname.startsWith(adminPrefix + '/')) {
      const rel = pathname.slice(adminPrefix.length) || '/';
      const direct = safeJoin(ADMIN_DIR_N, rel === '/' ? '/index.html' : rel);
      if (direct === null) return notFound(res); // path traversal
      if (existsSync(direct) && statSync(direct).isFile()) {
        return serveFileBase(direct, req, res);
      }
      return serveFileBase(ADMIN_FALLBACK, req, res);
    }

    // /admin (sin trailing slash) → redirigir al index
    if (adminPrefix && pathname === adminPrefix) {
      res.writeHead(302, { Location: adminPrefix + '/' });
      return res.end();
    }

    // Tienda pública (todo lo demás, salvo /api y /media que se filtran antes)
    if (pathname.startsWith('/api/') || pathname.startsWith('/media/')) {
      return notFound(res);
    }

    const direct = safeJoin(STORE_DIR_N, pathname === '/' ? '/index.html' : pathname);
    if (direct === null) return notFound(res); // path traversal
    if (existsSync(direct) && statSync(direct).isFile()) {
      return serveFileBase(direct, req, res);
    }
    return serveFileBase(STORE_FALLBACK, req, res);
  };
}

// Default legacy: mismo path de antes, por compat con cualquier importador
// que todavía use `serveStatic` sin factory. Apunta a <core>/../public, que
// no es donde la tienda tiene los dists (están en web/server/public/) — el
// server de cada cliente debe llamar createStaticHandler con el path
// correcto. Esto queda solo para no romper tests o scripts externos.
const LEGACY_PUBLIC_DIR = join(__dirname, '..', 'public');
export const serveStatic = createStaticHandler({ publicDir: LEGACY_PUBLIC_DIR });
