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
  const numericValue = Number(value);
  const numericCompare = Number(compare);
  const hasValue = value !== null && value !== undefined && value !== '';
  const hasCompare = hasValue && Number.isFinite(numericValue) && Number.isFinite(numericCompare) && numericCompare > numericValue;
  return (
    <span className={className}>
      {formatCOP(value)}
      {hasCompare && (
        <span className="price-compare">{formatCOP(compare)}</span>
      )}
    </span>
  );
}
