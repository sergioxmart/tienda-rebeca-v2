// Diálogo de confirmación. Wrapper de Modal para el caso típico de "borrar".
//
// Uso:
//   const [pending, setPending] = useState(null);
//   <Confirm
//     open={!!pending}
//     title="¿Eliminar categoría?"
//     message="Esta acción no se puede deshacer."
//     onCancel={() => setPending(null)}
//     onConfirm={async () => { await api.delete(...); setPending(null); }}
//   />

import React, { useState } from 'react';
import Modal from './Modal.jsx';

export default function Confirm({ open, title, message, confirmLabel = 'Confirmar', danger, onCancel, onConfirm }) {
  const [loading, setLoading] = useState(false);
  const handle = async () => {
    setLoading(true);
    try { await onConfirm(); } finally { setLoading(false); }
  };
  return (
    <Modal
      open={open}
      onClose={loading ? undefined : onCancel}
      title={title}
      footer={
        <>
          <button className="btn" onClick={onCancel} disabled={loading}>Cancelar</button>
          <button className={danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={handle} disabled={loading}>
            {loading ? <span className="spinner" /> : confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{message}</p>
    </Modal>
  );
}
