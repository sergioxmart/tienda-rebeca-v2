// Toast provider + hook useToast.
//
// Uso:
//   const toast = useToast();
//   toast.success('Guardado');
//   toast.error('No se pudo guardar', 'Detalle adicional');
//   toast.warning('Cuidado');

import React, { createContext, useCallback, useContext, useState } from 'react';

const ToastContext = createContext(null);

let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((type, message, detail) => {
    const id = nextId++;
    setToasts((cur) => [...cur, { id, type, message, detail }]);
    setTimeout(() => {
      setToasts((cur) => cur.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const value = {
    success: (m, d) => push('success', m, d),
    error:   (m, d) => push('error',   m, d),
    warning: (m, d) => push('warning', m, d),
    info:    (m, d) => push('info',    m, d),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`} onClick={() => remove(t.id)}>
            <div style={{ fontWeight: 500 }}>{t.message}</div>
            {t.detail && <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 4 }}>{t.detail}</div>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider');
  return ctx;
}
