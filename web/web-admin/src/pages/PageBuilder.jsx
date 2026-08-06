// Web Builder: gestión de page_modules (los bloques que se renderizan en
// la home del store).
//
// Acciones:
//   - Listar módulos en orden (con ↑↓)
//   - Crear nuevo módulo (selector de tipo)
//   - Editar módulo (form generado desde el schema del tipo)
//   - Toggle activo/inactivo
//   - Eliminar
//   - Guardar el orden nuevo después de mover ↑↓
//
// El form se genera dinámicamente desde MODULE_SCHEMAS para no tener
// que escribir un form por cada tipo de módulo. Si agregás un type
// nuevo, agregalo en:
//   - web/server/routes/admin/page-modules.js (MODULE_TYPES)
//   - web/server/routes/admin/page-modules.js (seed inicial opcional)
//   - aca en MODULE_SCHEMAS (label, icon, settings[])

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import Modal from '../components/Modal.jsx';
import Confirm from '../components/Confirm.jsx';
import Empty from '../components/Empty.jsx';

// Schema de los settings por tipo. Cada setting tiene key, label y type.
const MODULE_SCHEMAS = {
  hero: {
    label: 'Hero',
    description: 'Banner principal con título, subtítulo, imagen y un botón de acción.',
    icon: '🎯',
    settings: [
      { key: 'title',    label: 'Título',         type: 'text' },
      { key: 'subtitle', label: 'Subtítulo',      type: 'textarea' },
      { key: 'image_url',label: 'Imagen de fondo (URL)', type: 'url' },
      { key: 'cta_text', label: 'Texto del botón',type: 'text',  placeholder: 'Ver catálogo' },
      { key: 'cta_link', label: 'Link del botón', type: 'text',  placeholder: '/categoria/accesorios-telefono' },
    ],
  },
  banner: {
    label: 'Banner',
    description: 'Imagen clickeable horizontal.',
    icon: '🖼️',
    settings: [
      { key: 'image_url', label: 'Imagen (URL)', type: 'url' },
      { key: 'link',      label: 'Link al hacer click', type: 'text', placeholder: '/categoria/...' },
      { key: 'alt',       label: 'Texto alternativo',   type: 'text' },
    ],
  },
  categories: {
    label: 'Categorías (chips)',
    description: 'Lista horizontal de chips con las categorías. El admin no elige cuáles, son todas.',
    icon: '🏷️',
    settings: [
      { key: 'title', label: 'Título de la sección', type: 'text', placeholder: 'Categorías' },
    ],
  },
  categories_grid: {
    label: 'Categorías (grid)',
    description: 'Grid de cards con cada categoría, ideal para hero secundario.',
    icon: '🗂️',
    settings: [
      { key: 'title', label: 'Título de la sección', type: 'text' },
    ],
  },
  featured_products: {
    label: 'Productos destacados',
    description: 'Grid de productos con featured=TRUE.',
    icon: '⭐',
    settings: [
      { key: 'title', label: 'Título de la sección', type: 'text', placeholder: 'Destacados' },
      { key: 'limit', label: 'Cantidad máxima',      type: 'number', defaultValue: 8 },
    ],
  },
  recent_products: {
    label: 'Productos recientes',
    description: 'Grid de productos ordenados por más nuevos.',
    icon: '🆕',
    settings: [
      { key: 'title', label: 'Título de la sección', type: 'text', placeholder: 'Lo más nuevo' },
      { key: 'limit', label: 'Cantidad máxima',      type: 'number', defaultValue: 8 },
    ],
  },
};

const EMPTY_NEW = { type: 'hero', settings: {}, active: true };

function defaultSettingsForType(type) {
  const schema = MODULE_SCHEMAS[type];
  if (!schema) return {};
  const out = {};
  for (const f of schema.settings) {
    if (f.defaultValue !== undefined) out[f.key] = f.defaultValue;
    else if (f.type === 'number') out[f.key] = 0;
    else out[f.key] = '';
  }
  return out;
}

export default function PageBuilder() {
  const toast = useToast();
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);   // modulo en edición o { type, settings, active } para nuevo
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reorderDirty, setReorderDirty] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/admin/page-modules');
      setModules(data.modules || []);
      setReorderDirty(false);
    } catch (err) {
      toast.error('No se pudieron cargar los módulos', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const move = (idx, dir) => {
    const next = [...modules];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setModules(next);
    setReorderDirty(true);
  };

  const saveOrder = async () => {
    try {
      await api.patch('/api/admin/page-modules/reorder', { ids: modules.map((m) => m.id) });
      toast.success('Orden guardado');
      setReorderDirty(false);
    } catch (err) {
      toast.error('No se pudo guardar el orden', err.message);
    }
  };

  const openNew = () => setEditing({ mode: 'new', ...EMPTY_NEW, settings: defaultSettingsForType('hero') });
  const openEdit = (m) => setEditing({ mode: 'edit', id: m.id, type: m.type, settings: { ...m.settings }, active: m.active });

  const onTypeChange = (newType) => {
    setEditing((cur) => {
      if (cur.mode === 'edit') {
        // Al cambiar tipo, mantenemos settings que coincidan con el schema nuevo.
        const merged = {};
        const schema = MODULE_SCHEMAS[newType];
        for (const f of (schema?.settings || [])) {
          if (cur.settings[f.key] !== undefined) merged[f.key] = cur.settings[f.key];
        }
        // Llenar defaults si faltan
        for (const f of (schema?.settings || [])) {
          if (merged[f.key] === undefined) {
            if (f.defaultValue !== undefined) merged[f.key] = f.defaultValue;
            else if (f.type === 'number') merged[f.key] = 0;
            else merged[f.key] = '';
          }
        }
        return { ...cur, type: newType, settings: merged };
      }
      // En new, regenero todo desde el schema del tipo nuevo.
      return { ...cur, type: newType, settings: defaultSettingsForType(newType) };
    });
  };

  const setSetting = (key, value) => {
    setEditing((cur) => ({ ...cur, settings: { ...cur.settings, [key]: value } }));
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      // Coerce numbers y limpia vacíos
      const settingsOut = {};
      const schema = MODULE_SCHEMAS[editing.type];
      for (const f of (schema?.settings || [])) {
        const raw = editing.settings[f.key];
        if (raw === '' || raw === undefined || raw === null) continue;
        settingsOut[f.key] = f.type === 'number' ? Number(raw) : raw;
      }
      if (editing.mode === 'new') {
        await api.post('/api/admin/page-modules', { type: editing.type, settings: settingsOut, active: editing.active });
        toast.success('Módulo creado');
      } else {
        await api.patch(`/api/admin/page-modules/${editing.id}`, { type: editing.type, settings: settingsOut, active: editing.active });
        toast.success('Módulo actualizado');
      }
      setEditing(null);
      await load();
    } catch (err) {
      toast.error('No se pudo guardar', err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (m) => {
    try {
      await api.patch(`/api/admin/page-modules/${m.id}`, { active: !m.active });
      await load();
    } catch (err) {
      toast.error('No se pudo cambiar el estado', err.message);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/api/admin/page-modules/${deleting.id}`);
      toast.success('Módulo eliminado');
      setDeleting(null);
      await load();
    } catch (err) {
      toast.error('No se pudo eliminar', err.message);
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>;

  const schema = editing ? MODULE_SCHEMAS[editing.type] : null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Web Builder</h1>
          <p style={{ color: 'var(--color-muted)', margin: 0, fontSize: 13 }}>
            Estos bloques se renderizan en la home del store. Reordenalos con ↑↓ y guardá el orden.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {reorderDirty && (
            <button className="btn btn-primary" onClick={saveOrder}>Guardar orden</button>
          )}
          <button className="btn btn-accent" onClick={openNew}>+ Nuevo módulo</button>
        </div>
      </div>

      {modules.length === 0 ? (
        <Empty title="Sin módulos" description="La home no muestra nada. Creá el primero." action={
          <button className="btn btn-primary" onClick={openNew}>+ Nuevo módulo</button>
        } />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {modules.map((m, idx) => {
            const sch = MODULE_SCHEMAS[m.type];
            const label = sch?.label || m.type;
            const icon = sch?.icon || '📦';
            return (
              <div key={m.id} style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius)',
                padding: 12,
                opacity: m.active ? 1 : 0.55,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <button className="btn btn-sm" onClick={() => move(idx, -1)} disabled={idx === 0} title="Subir">↑</button>
                    <button className="btn btn-sm" onClick={() => move(idx, 1)} disabled={idx === modules.length - 1} title="Bajar">↓</button>
                  </div>
                  <div style={{ fontSize: 22 }}>{icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{label}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                      {sch?.description || `Tipo: ${m.type}`}
                    </div>
                  </div>
                  <span className={`badge ${m.active ? 'active' : 'inactive'}`}>{m.active ? 'Activo' : 'Inactivo'}</span>
                  <div className="table-actions">
                    <button className="btn btn-sm" onClick={() => toggleActive(m)}>
                      {m.active ? 'Desactivar' : 'Activar'}
                    </button>
                    <button className="btn btn-sm" onClick={() => openEdit(m)}>Configurar</button>
                    <button className="btn btn-sm btn-danger" onClick={() => setDeleting(m)}>×</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 16 }}>
        Tip: el store público lee los módulos activos en orden desde <code>/api/public/page-modules</code>.
        Cambios se ven al refrescar el browser (cache de 60s).
      </p>

      <Modal
        open={!!editing}
        onClose={() => !saving && setEditing(null)}
        size="lg"
        title={editing?.mode === 'new' ? 'Nuevo módulo' : `Editar módulo · ${editing?.type}`}
        footer={
          <>
            <button className="btn" onClick={() => setEditing(null)} disabled={saving}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <span className="spinner" /> : 'Guardar'}
            </button>
          </>
        }
      >
        {editing && schema && (
          <form onSubmit={handleSave}>
            <div className="form-row">
              <div className="form-group">
                <label>Tipo de módulo</label>
                <select className="select" value={editing.type} onChange={(e) => onTypeChange(e.target.value)}>
                  {Object.entries(MODULE_SCHEMAS).map(([k, s]) => (
                    <option key={k} value={k}>{s.icon} {s.label}</option>
                  ))}
                </select>
                <div className="help">{schema.description}</div>
              </div>
              <div className="form-group">
                <label>Estado</label>
                <select className="select" value={String(editing.active)}
                        onChange={(e) => setEditing({ ...editing, active: e.target.value === 'true' })}>
                  <option value="true">Activo</option>
                  <option value="false">Inactivo</option>
                </select>
              </div>
            </div>
            <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '12px 0' }} />
            {schema.settings.map((f) => (
              <div className="form-group" key={f.key}>
                <label>{f.label}</label>
                {f.type === 'textarea' ? (
                  <textarea className="textarea"
                            value={editing.settings[f.key] ?? ''}
                            onChange={(e) => setSetting(f.key, e.target.value)} />
                ) : (
                  <input className="input"
                         type={f.type === 'number' ? 'number' : (f.type === 'url' ? 'url' : 'text')}
                         value={editing.settings[f.key] ?? ''}
                         placeholder={f.placeholder || ''}
                         onChange={(e) => setSetting(f.key, e.target.value)} />
                )}
              </div>
            ))}
          </form>
        )}
      </Modal>

      <Confirm
        open={!!deleting}
        title="¿Eliminar módulo?"
        message="Se va a quitar de la home. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
