// Estado vacío: ícono opcional + título + descripción + acción opcional.

import React from 'react';

export default function Empty({ title = 'No hay datos', description, action }) {
  return (
    <div className="empty">
      <h3 style={{ color: 'var(--color-muted)' }}>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
