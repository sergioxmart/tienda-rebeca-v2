// Valida formato de email. No verifica que el dominio exista ni que el buzón
// esté vivo — solo la forma. Para eso están los emails de verificación de
// cada tienda en su app.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(s) {
  return typeof s === 'string' && EMAIL_RE.test(s);
}
