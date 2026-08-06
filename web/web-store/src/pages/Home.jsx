// Home: renderiza los page_modules activos en orden desde el backend
// (Web Builder). El admin decide qué bloques aparecen y en qué orden.
//
//   GET /api/public/page-modules → { modules: [{id, type, position, settings}] }
//
// Cada tipo tiene su renderer en src/modules/registry.js. Si el admin
// agrega un type nuevo, hay que sumarlo al registry Y al backend.

import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { MODULE_RENDERERS } from '../modules/registry.js';

export default function Home() {
  const [modules, setModules] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.pageModules()
      .then((d) => setModules(d.modules || []))
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="empty">
        <h3>No se pudo cargar la home</h3>
        <p>{error}</p>
      </div>
    );
  }
  if (modules === null) {
    return <div className="center"><span className="spinner" /></div>;
  }
  if (modules.length === 0) {
    return (
      <div className="empty">
        <h3>La home está vacía</h3>
        <p>El admin aún no agregó módulos desde el Web Builder.</p>
      </div>
    );
  }

  return (
    <div>
      {modules.map((m) => {
        const Renderer = MODULE_RENDERERS[m.type];
        if (!Renderer) {
          // Tipo desconocido (probablemente agregado al backend pero no
          // al registry del front). Mostramos placeholder para que se note.
          return (
            <div key={m.id} className="empty" style={{ padding: 16, marginBottom: 16 }}>
              <p>Módulo de tipo <code>{m.type}</code> no soportado por esta versión del front.</p>
            </div>
          );
        }
        return <Renderer key={m.id} settings={m.settings || {}} />;
      })}
    </div>
  );
}
