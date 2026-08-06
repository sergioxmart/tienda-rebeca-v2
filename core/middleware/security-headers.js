// Headers de seguridad básicos que toda respuesta HTTP debería tener.
// Se aplica antes de los handlers para que incluso un 500 los traiga.

export function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
}
