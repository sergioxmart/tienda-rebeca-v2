// Modal genérico. Sin portal (z-index alto basta para el admin).
//
// Props:
//   open:        boolean
//   onClose:     () => void
//   title:       string
//   size?:       'sm' | 'md' | 'lg'  (default md → 520px)
//   footer?:     ReactNode
//   children:    ReactNode
//   layerClassName?: string (clase alternativa para la capa exterior)

import React from 'react';

export default function Modal({ open, onClose, title, size = 'md', footer, children, layerClassName }) {
  if (!open) return null;
  const sizeClass = size === 'lg' ? 'modal modal-lg' : 'modal';
  const layerClass = layerClassName || 'modal-backdrop';
  return (
    <div className={layerClass} onClick={onClose}>
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
