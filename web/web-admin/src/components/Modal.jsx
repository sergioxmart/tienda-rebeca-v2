// Modal genérico. Se monta en document.body para quedar fuera de los stacking
// contexts de main/sidebar y centrarse siempre respecto al viewport.
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
import { createPortal } from 'react-dom';

export default function Modal({ open, onClose, title, size = 'md', footer, children, layerClassName }) {
  if (!open) return null;
  const sizeClass = size === 'lg' ? 'modal modal-lg' : 'modal';
  const layerClass = layerClassName || 'modal-backdrop';
  const modal = (
    <div className={layerClass} onClick={onClose}>
      <div className={sizeClass} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
  return createPortal(modal, document.body);
}
