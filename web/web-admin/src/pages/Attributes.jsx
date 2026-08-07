// CRUD de atributos. Cada atributo es expandible para ver/editar sus valores.
//
// Endpoints:
//   GET    /api/admin/attributes
//   POST   /api/admin/attributes                  { name, slug?, type?, display_order? }
//   PATCH  /api/admin/attributes/:id              { name?, slug?, type?, display_order? }
//   DELETE /api/admin/attributes/:id
//   GET    /api/admin/attributes/:id/values
//   POST   /api/admin/attributes/:id/values       { value, slug?, display_order? }
//   PATCH  /api/admin/attribute-values/:id        { value?, slug?, display_order? }
//   DELETE /api/admin/attribute-values/:id

import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import Modal from '../components/Modal.jsx';
import Confirm from '../components/Confirm.jsx';
import Empty from '../components/Empty.jsx';

function slugify(s) {
  return s.toString().toLowerCase().trim()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const ATTR_TYPES = [
  { value: 'text', label: 'Texto' },
  { value: 'color', label: 'Color' },
  { value: 'number', label: 'Número' },
];
function ChevronIcon({ direction }) {
  return <svg className="icon-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d={direction === 'up' ? 'm6 14 6-6 6 6' : 'm6 10 6 6 6-6'} /></svg>;
}

export default function Attributes() {
  const toast = useToast();
  const [attrs, setAttrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [values, setValues] = useState({});   // { [attrId]: [{id, value, hex, display_order}] }
  const [editingAttr, setEditingAttr] = useState(null);
  const [editingVal, setEditingVal] = useState(null);  // { mode: 'new'|'edit', attrId, ... }
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selectedAttrId, setSelectedAttrId] = useState(null);
  const [selectedValueIds, setSelectedValueIds] = useState({});
  const [moving, setMoving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/admin/attributes');
      setAttrs(data.attributes || []);
    } catch (err) {
      toast.error('No se pudieron cargar los atributos', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const loadValues = async (attrId) => {
    try {
      const data = await api.get(`/api/admin/attributes/${attrId}/values`);
      setValues((cur) => ({ ...cur, [attrId]: data.values || [] }));
    } catch (err) {
      toast.error('No se pudieron cargar los valores', err.message);
    }
  };

  const toggleExpand = (id) => {
    if (expanded === id) {
      setExpanded(null);
    } else {
      setExpanded(id);
      if (!values[id]) loadValues(id);
    }
  };

  // --- Attribute CRUD ----------------------------------------------------
  const openNewAttr = () => setEditingAttr({ name: '', slug: '', type: 'text' });
  const openEditAttr = (a) => setEditingAttr({ id: a.id, name: a.name, slug: a.slug, type: a.type || 'text' });

  const saveAttr = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      const body = {
        name: editingAttr.name,
        slug: editingAttr.slug || slugify(editingAttr.name),
        type: editingAttr.type,
        display_order: editingAttr.id ? undefined : attrs.length,
      };
      if (editingAttr.id) {
        await api.patch(`/api/admin/attributes/${editingAttr.id}`, body);
        toast.success('Atributo actualizado');
      } else {
        await api.post('/api/admin/attributes', body);
        toast.success('Atributo creado');
      }
      setEditingAttr(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'slug_already_exists') {
        toast.error('Ya existe un atributo con ese slug');
      } else {
        toast.error('No se pudo guardar', err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteAttr = async () => {
    try {
      await api.delete(`/api/admin/attributes/${deleting.id}`);
      toast.success('Atributo eliminado');
      setDeleting(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'attribute_in_use') {
        toast.error('No se puede eliminar', 'Hay productos o variantes que usan este atributo.');
      } else {
        toast.error('No se pudo eliminar', err.message);
      }
    }
  };

  // --- Value CRUD --------------------------------------------------------
  const openNewVal = (attrId, attrType) => setEditingVal({ mode: 'new', attrId, attrType, value: '', hex: '#2563EB' });
  const openEditVal = (attrId, attrType, v) => setEditingVal({ mode: 'edit', attrId, attrType, id: v.id, value: v.value, hex: v.hex || '#2563EB' });

  const saveVal = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      if (editingVal.mode === 'new') {
        await api.post(`/api/admin/attributes/${editingVal.attrId}/values`, {
          value: editingVal.value,
          display_order: (values[editingVal.attrId] || []).length,
          hex: editingVal.attrType === 'color' ? editingVal.hex : null,
        });
        toast.success('Valor creado');
      } else {
        await api.patch(`/api/admin/attribute-values/${editingVal.id}`, {
          value: editingVal.value,
          hex: editingVal.attrType === 'color' ? editingVal.hex : null,
        });
        toast.success('Valor actualizado');
      }
      setEditingVal(null);
      await loadValues(editingVal.attrId);
    } catch (err) {
      toast.error('No se pudo guardar', err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteVal = async (attrId, valId) => {
    try {
      await api.delete(`/api/admin/attribute-values/${valId}`);
      toast.success('Valor eliminado');
      await loadValues(attrId);
    } catch (err) {
      toast.error('No se pudo eliminar', err.message);
    }
  };

  const moveAttr = async (direction) => {
    const index = attrs.findIndex((item) => item.id === selectedAttrId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= attrs.length) return;
    const current = attrs[index];
    const target = attrs[targetIndex];
    setMoving(true);
    try {
      await Promise.all([
        api.patch(`/api/admin/attributes/${current.id}`, { display_order: target.display_order }),
        api.patch(`/api/admin/attributes/${target.id}`, { display_order: current.display_order }),
      ]);
      await load();
    } catch (err) { toast.error('No se pudo cambiar el orden', err.message); }
    finally { setMoving(false); }
  };

  const moveValue = async (attrId, direction) => {
    const list = values[attrId] || [];
    const selected = selectedValueIds[attrId];
    const index = list.findIndex((item) => item.id === selected);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= list.length) return;
    const current = list[index];
    const target = list[targetIndex];
    setMoving(true);
    try {
      await Promise.all([
        api.patch(`/api/admin/attribute-values/${current.id}`, { display_order: target.display_order }),
        api.patch(`/api/admin/attribute-values/${target.id}`, { display_order: current.display_order }),
      ]);
      await loadValues(attrId);
    } catch (err) { toast.error('No se pudo cambiar el orden', err.message); }
    finally { setMoving(false); }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Atributos</h1>
        <button className="btn btn-primary" onClick={openNewAttr}>+ Nuevo atributo</button>
      </div>
      <p style={{ color: 'var(--color-muted)' }}>Define los atributos que el cliente puede elegir (color, talla, capacidad, etc.).</p>

      {attrs.length === 0 ? (
        <Empty title="Sin atributos" description="Crea el primero para empezar." action={
          <button className="btn btn-primary" onClick={openNewAttr}>+ Nuevo atributo</button>
        } />
      ) : (
        <>
          <div className="order-toolbar">
            <span>{selectedAttrId ? 'Atributo seleccionado' : 'Selecciona un atributo para cambiar su posición'}</span>
            <div className="order-toolbar-actions">
              <button className="btn btn-sm" aria-label="Subir atributo" title="Subir" disabled={!selectedAttrId || moving || attrs.findIndex((a) => a.id === selectedAttrId) <= 0} onClick={() => moveAttr(-1)}><ChevronIcon direction="up" /></button>
              <button className="btn btn-sm" aria-label="Bajar atributo" title="Bajar" disabled={!selectedAttrId || moving || attrs.findIndex((a) => a.id === selectedAttrId) === attrs.length - 1} onClick={() => moveAttr(1)}><ChevronIcon direction="down" /></button>
            </div>
          </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {attrs.map((a) => (
            <div key={a.id} style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius)',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: 12, cursor: 'pointer',
              }} onClick={() => { setSelectedAttrId(a.id); toggleExpand(a.id); }}>
                <div>
                  <strong>{a.name}</strong>{' '}
                  <code style={{ color: 'var(--color-muted)' }}>{a.slug}</code>{' '}
                  <span className="badge">{a.type}</span>
                </div>
                <div className="table-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn-sm" onClick={() => openEditAttr(a)}>Editar</button>
                  <button className="btn btn-sm btn-danger" onClick={() => setDeleting(a)}>Eliminar</button>
                  <span style={{ color: 'var(--color-muted)', fontSize: 12, marginLeft: 8 }}>{expanded === a.id ? '▲' : '▼'}</span>
                </div>
              </div>
              {expanded === a.id && (
                <div style={{ borderTop: '1px solid var(--color-border)', padding: 12 }}>
                  <div className="page-header" style={{ marginBottom: 12 }}>
                    <h3 style={{ margin: 0 }}>Valores</h3>
                    <button className="btn btn-sm btn-primary" onClick={() => openNewVal(a.id, a.type)}>+ Nuevo valor</button>
                  </div>
                  {(values[a.id] || []).length > 0 && <div className="order-toolbar order-toolbar-nested">
                    <span>{selectedValueIds[a.id] ? 'Valor seleccionado' : 'Selecciona un valor para cambiar su posición'}</span>
                    <div className="order-toolbar-actions">
                      <button className="btn btn-sm" aria-label="Subir valor" title="Subir" disabled={!selectedValueIds[a.id] || moving || (values[a.id] || []).findIndex((v) => v.id === selectedValueIds[a.id]) <= 0} onClick={() => moveValue(a.id, -1)}><ChevronIcon direction="up" /></button>
                      <button className="btn btn-sm" aria-label="Bajar valor" title="Bajar" disabled={!selectedValueIds[a.id] || moving || (values[a.id] || []).findIndex((v) => v.id === selectedValueIds[a.id]) === (values[a.id] || []).length - 1} onClick={() => moveValue(a.id, 1)}><ChevronIcon direction="down" /></button>
                    </div>
                  </div>}
                  {(values[a.id] || []).length === 0 ? (
                    <div style={{ color: 'var(--color-muted)', fontSize: 13 }}>Sin valores todavía.</div>
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr><th>Valor</th>{a.type === 'color' && <th>Color</th>}<th style={{ textAlign: 'right' }}>Acciones</th></tr>
                      </thead>
                      <tbody>
                        {(values[a.id] || []).map((v) => (
                          <tr key={v.id} className={selectedValueIds[a.id] === v.id ? 'row-selected' : ''} onClick={() => setSelectedValueIds((cur) => ({ ...cur, [a.id]: v.id }))}>
                            <td>{v.value}</td>
                            {a.type === 'color' && <td><span className="color-swatch" style={{ background: v.hex || '#E5E7EB' }} /> <code>{v.hex || 'sin hex'}</code></td>}
                            <td className="table-actions">
                              <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); openEditVal(a.id, a.type, v); }}>Editar</button>
                              <button className="btn btn-sm btn-danger" onClick={() => deleteVal(a.id, v.id)}>×</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        </>
      )}

      {/* Modal de atributo */}
      <Modal
        open={!!editingAttr}
        onClose={() => !saving && setEditingAttr(null)}
        title={editingAttr?.id ? 'Editar atributo' : 'Nuevo atributo'}
        footer={
          <>
            <button className="btn" onClick={() => setEditingAttr(null)} disabled={saving}>Cancelar</button>
            <button className="btn btn-primary" onClick={saveAttr} disabled={saving}>
              {saving ? <span className="spinner" /> : 'Guardar'}
            </button>
          </>
        }
      >
        {editingAttr && (
          <form onSubmit={saveAttr}>
            <div className="form-group">
              <label>Nombre</label>
              <input className="input" required maxLength={80}
                     value={editingAttr.name} onChange={(e) => setEditingAttr({ ...editingAttr, name: e.target.value })} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Slug <span style={{ color: 'var(--color-muted)' }}>(opcional)</span></label>
                <input className="input" maxLength={60} pattern="[a-z0-9-]+"
                       value={editingAttr.slug} onChange={(e) => setEditingAttr({ ...editingAttr, slug: e.target.value })} />
                <p className="form-hint">Es el identificador técnico estable que usan filtros, variantes y la API. Ejemplo: <code>color</code>. Evita cambiarlo después de usarlo.</p>
              </div>
              <div className="form-group">
                <label>Tipo</label>
                <select className="select" value={editingAttr.type}
                        onChange={(e) => setEditingAttr({ ...editingAttr, type: e.target.value })}>
                  {ATTR_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <p className="form-hint">El orden se cambia desde las flechas de la lista.</p>
          </form>
        )}
      </Modal>

      {/* Modal de valor */}
      <Modal
        open={!!editingVal}
        onClose={() => !saving && setEditingVal(null)}
        title={editingVal?.mode === 'new' ? 'Nuevo valor' : 'Editar valor'}
        footer={
          <>
            <button className="btn" onClick={() => setEditingVal(null)} disabled={saving}>Cancelar</button>
            <button className="btn btn-primary" onClick={saveVal} disabled={saving}>
              {saving ? <span className="spinner" /> : 'Guardar'}
            </button>
          </>
        }
      >
        {editingVal && (
          <form onSubmit={saveVal}>
            <div className="form-group">
              <label>Valor</label>
              <input className="input" required maxLength={100}
                     value={editingVal.value} onChange={(e) => setEditingVal({ ...editingVal, value: e.target.value })} />
            </div>
            {editingVal.attrType === 'color' && <div className="form-group">
              <label>Color hexadecimal</label>
              <div className="color-picker-field">
                <input type="color" value={editingVal.hex || '#2563EB'} aria-label="Seleccionar color"
                       onChange={(e) => setEditingVal({ ...editingVal, hex: e.target.value.toUpperCase() })} />
                <input className="input" maxLength={7} pattern="#[0-9A-Fa-f]{6}" value={editingVal.hex || ''}
                       onChange={(e) => setEditingVal({ ...editingVal, hex: e.target.value.toUpperCase() })} />
                <span className="color-swatch" style={{ background: editingVal.hex || '#E5E7EB' }} />
              </div>
              <p className="form-hint">Elige el tono visualmente o escribe un código #RRGGBB.</p>
            </div>}
          </form>
        )}
      </Modal>

      <Confirm
        open={!!deleting}
        title="¿Eliminar atributo?"
        message={`Vas a eliminar "${deleting?.name}". Si hay productos o variantes usándolo, va a fallar.`}
        confirmLabel="Eliminar"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={deleteAttr}
      />
    </div>
  );
}
