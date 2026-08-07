import React from 'react';

function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '';
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('es-CO', { maximumFractionDigits: 0 });
}

/**
 * Input monetario para COP enteros.
 * El usuario ve separadores de miles; el formulario recibe solo dígitos.
 */
export default function MoneyInput({ value, onChange, ...props }) {
  return (
    <input
      {...props}
      className={`input ${props.className || ''}`.trim()}
      type="text"
      inputMode="numeric"
      value={formatMoney(value)}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, ''))}
    />
  );
}
