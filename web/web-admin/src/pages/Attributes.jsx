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
  { value: 'select', label: 'Lista' },
];

export default function Attributes() {
  const toast = useToast();
  const [attrs, setAttrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [values, setValues] = useState({});   // { [attrId]: [{id, value, slug, display_order}] }
  const [editingAttr, setEditingAttr] = useState(null);
  const [editingVal, setEditingVal] = useState(null);  // { mode: 'new'|'edit', attrId, ... }
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);

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
  const openNewAttr = () => setEditingAttr({ name: '', slug: '', type: 'text', display_order: 0 });
  const openEditAttr = (a) => setEditingAttr({ id: a.id, name: a.name, slug: a.slug, type: a.type || 'text', display_order: a.display_order ?? 0 });

  const saveAttr = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      const body = {
        name: editingAttr.name,
        slug: editingAttr.slug || slugify(editingAttr.name),
        type: editingAttr.type,
        display_order: Number(editingAttr.display_order) || 0,
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
  const openNewVal = (attrId) => setEditingVal({ mode: 'new', attrId, value: '', display_order: 0 });
  const openEditVal = (attrId, v) => setEditingVal({ mode: 'edit', attrId, id: v.id, value: v.value, display_order: v.display_order ?? 0 });

  const saveVal = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      if (editingVal.mode === 'new') {
        await api.post(`/api/admin/attributes/${editingVal.attrId}/values`, {
          value: editingVal.value,
          display_order: Number(editingVal.display_order) || 0,
        });
        toast.success('Valor creado');
      } else {
        await api.patch(`/api/admin/attribute-values/${editingVal.id}`, {
          value: editingVal.value,
          display_order: Number(editingVal.display_order) || 0,
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

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Atributos</h1>
        <button className="btn btn-primary" onClick={openNewAttr}>+ Nuevo atributo</button>
      </div>
      <p style={{ color: 'var(--color-muted)' }}>Definí los atributos que el cliente puede elegir (color, talla, capacidad, etc.).</p>

      {attrs.length === 0 ? (
        <Empty title="Sin atributos" description="Creá el primero para empezar." action={
          <button className="btn btn-primary" onClick={openNewAttr}>+ Nuevo atributo</button>
        } />
      ) : (
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
              }} onClick={() => toggleExpand(a.id)}>
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
                    <button className="btn btn-sm btn-primary" onClick={() => openNewVal(a.id)}>+ Nuevo valor</button>
                  </div>
                  {(values[a.id] || []).length === 0 ? (
                    <div style={{ color: 'var(--color-muted)', fontSize: 13 }}>Sin valores todavía.</div>
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr><th>Valor</th><th>Orden</th><th style={{ textAlign: 'right' }}>Acciones</th></tr>
                      </thead>
                      <tbody>
                        {(values[a.id] || []).map((v) => (
                          <tr key={v.id}>
                            <td>{v.value}</td>
                            <td>{v.display_order}</td>
                            <td className="table-actions">
                              <button className="btn btn-sm" onClick={() => openEditVal(a.id, v)}>Editar</button>
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
              </div>
              <div className="form-group">
                <label>Tipo</label>
                <select className="select" value={editingAttr.type}
                        onChange={(e) => setEditingAttr({ ...editingAttr, type: e.target.value })}>
                  {ATTR_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Orden</label>
              <input className="input" type="number" min={0}
                     value={editingAttr.display_order}
                     onChange={(e) => setEditingAttr({ ...editingAttr, display_order: e.target.value })} />
            </div>
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
            <div className="form-group">
              <label>Orden</label>
              <input className="input" type="number" min={0}
                     value={editingVal.display_order}
                     onChange={(e) => setEditingVal({ ...editingVal, display_order: e.target.value })} />
            </div>
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
