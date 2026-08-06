// Resuelve la IP del cliente detrás de proxies/CDN.
// Orden: Cloudflare (cf-connecting-ip) > X-Forwarded-For (primera) > socket.
// Si no hay nada, devuelve string vacío (no null, para no romper SQL inserts).

export function clientIp(req) {
  const cf = req.headers['cf-connecting-ip'];
  if (cf) return String(cf).split(',')[0].trim();
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket?.remoteAddress || '';
}
