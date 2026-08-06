// Modal genérico. Sin portal (z-index alto basta para el admin).
//
// Props:
//   open:        boolean
//   onClose:     () => void
//   title:       string
//   size?:       'sm' | 'md' | 'lg'  (default md → 520px)
//   footer?:     ReactNode
//   children:    ReactNode

import React from 'react';

export default function Modal({ open, onClose, title, size = 'md', footer, children }) {
  if (!open) return null;
  const sizeClass = size === 'lg' ? 'modal modal-lg' : 'modal';
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={sizeClass} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
