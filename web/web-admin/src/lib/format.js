// Formateo compartido entre pantallas.

const fmtCOP = new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
});

export function money(n) {
  return fmtCOP.format(Number(n) || 0);
}

export function fmtDate(s) {
  if (!s) return '—';
  return new Date(String(s).slice(0, 10) + 'T00:00:00')
    .toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

export function humanSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = Number(bytes) || 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
