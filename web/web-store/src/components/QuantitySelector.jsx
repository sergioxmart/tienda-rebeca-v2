// Selector de cantidad con - N +.

import React from 'react';

export default function QuantitySelector({ value, onChange, min = 1, max = 99 }) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  return (
    <div className="qty-selector">
      <button type="button" onClick={dec} disabled={value <= min} aria-label="Restar">−</button>
      <input type="number" min={min} max={max} value={value}
             onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))} />
      <button type="button" onClick={inc} disabled={value >= max} aria-label="Sumar">+</button>
    </div>
  );
}
