// Estado vacío. Reusado en catalog y cart.

import React from 'react';

export default function Empty({ title, description, action }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
