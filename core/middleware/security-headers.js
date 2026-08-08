// Headers de seguridad básicos que toda respuesta HTTP debería tener.
// Se aplica antes de los handlers para que incluso un 500 los traiga.

export function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');

  // Se usa CSP en lugar de X-Frame-Options para no romper la vista previa
  // del Builder, que carga la tienda de 5173 dentro del admin 5174.
  const frameAncestors = process.env.CSP_FRAME_ANCESTORS
    || "'self' http://localhost:5173 http://localhost:5174";
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    `frame-ancestors ${frameAncestors}`,
    "form-action 'self'",
    "script-src 'self' https://checkout.epayco.co https://sdk.mercadopago.com",
    "style-src 'self' 'unsafe-inline' https://unpkg.com",
    'img-src \'self\' data: blob: https:',
    'font-src \'self\' data: https:',
    "connect-src 'self' https://api.mercadopago.com https://api.epayco.co https://nominatim.openstreetmap.org",
    "frame-src 'self' https://*.mercadopago.com https://*.epayco.co",
  ].join('; '));
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}
