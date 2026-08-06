// Componente que formatea precios en COP. Si `compare` está, lo muestra
// tachado al lado.

import React from 'react';

export function formatCOP(n) {
  if (n === null || n === undefined || n === '') return '—';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(n));
}

export default function Price({ value, compare, className }) {
  return (
    <span className={className}>
      {formatCOP(value)}
      {compare !== null && compare !== undefined && compare > value && (
        <span className="price-compare">{formatCOP(compare)}</span>
      )}
    </span>
  );
}
