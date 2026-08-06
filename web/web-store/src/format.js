// Helpers de formato compartidos. Precios en pesos colombianos (COP).

const fmtCOP = new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
});

export function money(n) {
  return fmtCOP.format(Number(n) || 0);
}

export function date(s) {
  if (!s) return '';
  return new Date(String(s).slice(0, 10) + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function shortDate(s) {
  if (!s) return '';
  return new Date(String(s).slice(0, 10) + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
}

// Tipos habilitados de un producto. `types` (array) es lo nuevo; `type`
// (string) queda como fallback para datos viejos.
export function productTypes(p) {
  return Array.isArray(p.types) && p.types.length ? p.types : [p.type].filter(Boolean);
}

export const TYPE_LABELS = {
  venta: 'Venta',
  alquiler: 'Alquiler',
  alquiler_nuevo: 'Alquiler como nuevo',
};

export function typeBadge(p) {
  const t = productTypes(p);
  const sells = t.includes('venta');
  const rents = t.includes('alquiler') || t.includes('alquiler_nuevo');
  if (sells && rents) return 'Venta y alquiler';
  if (rents && t.length > 1) return 'Alquiler';
  return TYPE_LABELS[t[0]] || '';
}

export function priceLabel(p) {
  const t = productTypes(p);
  const parts = [];
  if (t.includes('venta'))          parts.push(money(salePrice(p)));
  if (t.includes('alquiler'))       parts.push(`Alquiler · ${money(p.rental_price)}`);
  if (t.includes('alquiler_nuevo')) parts.push(`Como nuevo · ${money(p.rental_new_price)}`);
  return parts.join(' · ') || '—';
}

// Precio de venta efectivo: con promo vigente, el promocional (calculado por
// el server). La tienda refleja precios, nunca los decide.
export function salePrice(p) {
  return p.promo ? Number(p.promo.final_price) : Number(p.price) || 0;
}
