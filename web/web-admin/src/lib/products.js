// Lo que comparten la grilla, la tarjeta y el formulario de productos.

import { money } from './format.js';

// Tipos de oferta. Un producto puede tener varios a la vez, cada uno con su
// precio (venta → price, alquiler → rental_price, como nuevo → rental_new_price).
export const TYPES = [
  { value: 'venta',          label: 'Venta',            priceKey: 'price',            priceLabel: 'Precio de venta' },
  { value: 'alquiler',       label: 'Alquiler',         priceKey: 'rental_price',     priceLabel: 'Precio de alquiler' },
  { value: 'alquiler_nuevo', label: 'Alquiler como nuevo', priceKey: 'rental_new_price', priceLabel: 'Precio alquiler como nuevo' },
];

export function productTypes(p) {
  return Array.isArray(p.types) && p.types.length ? p.types : [p.type].filter(Boolean);
}

export function priceLines(p) {
  const t = productTypes(p);
  return TYPES.filter((x) => t.includes(x.value))
    .map((x) => ({ label: x.label, price: money(p[x.priceKey]) }));
}
