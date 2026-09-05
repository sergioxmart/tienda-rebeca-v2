// CRUD de categorías. Modelo para los demás CRUDs (mismo patrón).
//
// Backend:
//   GET    /api/admin/categories
//   POST   /api/admin/categories        { name, slug?, description?, hero_image?, display_order?, active? }
//   PATCH  /api/admin/categories/:id    cualquiera de los anteriores
//   DELETE /api/admin/categories/:id

import React, { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import Modal from '../components/Modal.jsx';
import Confirm from '../components/Confirm.jsx';
import Empty from '../components/Empty.jsx';

const EMPTY = { name: '', slug: '', description: '', hero_image: '', accent_color: '', background_color: '', active: true };
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function pickerColor(value, fallback) {
  if (!HEX_COLOR_RE.test(value || '')) return fallback;
  if (value.length === 4) {
    return `#${value.slice(1).split('').map((character) => character + character).join('')}`;
  }
  return value;
}

function CategoryColorField({ id, label, value, onChange, fallback }) {
  return (
    <div className="form-group">
      <label htmlFor={id}>{label} <span style={{ color: 'var(--color-muted)' }}>(opcional)</span></label>
      <div className="color-field">
        <input id={id} className="color-picker" type="color" value={pickerColor(value, fallback)} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label={`Elegir ${label.toLowerCase()}`} />
        <input className="input color-hex-input" type="text" inputMode="text" pattern="#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} placeholder={fallback} />
        <span className="color-preview" style={{ background: pickerColor(value, fallback) }} aria-hidden="true" />
      </div>
    </div>
  );
}

function slugify(s) {
  return s.toString().toLowerCase().trim()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function ChevronIcon({ direction }) {
  return <svg className="icon-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d={direction === 'up' ? 'm6 14 6-6 6 6' : 'm6 10 6 6 6-6'} /></svg>;
}

export default function Categories() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);   // { ...form } o null
  const [deleting, setDeleting] = useState(null); // item a borrar o null
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [moving, setMoving] = useState(false);
  const movingRef = useRef(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/admin/categories');
      setItems(data.categories || []);
    } catch (err) {
      toast.error('No se pudieron cargar las categorías', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => setEditing({ ...EMPTY });
  const openEdit = (c) => setEditing({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description || '',
    hero_image: c.hero_image || '',
    accent_color: c.accent_color || '',
    background_color: c.background_color || '',
    active: c.active,
  });

  const moveSelected = async (direction) => {
    const index = items.findIndex((item) => item.id === selectedId);
    const targetIndex = index + direction;
    if (movingRef.current || index < 0 || targetIndex < 0 || targetIndex >= items.length) return;
    const reordered = [...items];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    movingRef.current = true;
    setMoving(true);
    try {
      await api.patch('/api/admin/categories/reorder', {
        ids: reordered.map((category) => category.id),
      });
      setItems(reordered.map((category, position) => ({ ...category, display_order: position })));
      toast.success('Orden actualizado');
    } catch (err) {
      toast.error('No se pudo cambiar el orden', err.message);
    } finally {
      movingRef.current = false;
      setMoving(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        name: editing.name,
        slug: editing.slug || slugify(editing.name),
        description: editing.description || '',
        hero_image: editing.hero_image || null,
        accent_color: editing.accent_color || null,
        background_color: editing.background_color || null,
        display_order: editing.id ? undefined : items.length,
        active: !!editing.active,
      };
      if (editing.id) {
        await api.patch(`/api/admin/categories/${editing.id}`, body);
        toast.success('Categoría actualizada');
      } else {
        await api.post('/api/admin/categories', body);
        toast.success('Categoría creada');
      }
      setEditing(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'slug_already_exists') {
        toast.error('Ya existe una categoría con ese slug');
      } else {
        toast.error('No se pudo guardar', err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/api/admin/categories/${deleting.id}`);
      toast.success('Categoría eliminada');
      setDeleting(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'category_in_use') {
        toast.error('No se puede eliminar', 'Hay productos usando esta categoría.');
      } else {
        toast.error('No se pudo eliminar', err.message);
      }
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Categorías</h1>
        <button className="btn btn-primary" onClick={openNew}>+ Nueva categoría</button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>
      ) : items.length === 0 ? (
        <Empty title="Sin categorías" description="Crea la primera para empezar." action={
          <button className="btn btn-primary" onClick={openNew}>+ Nueva categoría</button>
        } />
      ) : (
        <>
        <div className="order-toolbar">
          <span>{selectedId ? 'Categoría seleccionada' : 'Selecciona una categoría para cambiar su posición'}</span>
          <div className="order-toolbar-actions">
            <button className="btn btn-sm" title="Subir" aria-label="Subir categoría" disabled={!selectedId || moving || items.findIndex((c) => c.id === selectedId) <= 0} onClick={() => moveSelected(-1)}><ChevronIcon direction="up" /></button>
            <button className="btn btn-sm" title="Bajar" aria-label="Bajar categoría" disabled={!selectedId || moving || items.findIndex((c) => c.id === selectedId) === items.length - 1} onClick={() => moveSelected(1)}><ChevronIcon direction="down" /></button>
          </div>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Slug</th>
              <th>Estado</th>
              <th style={{ textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className={selectedId === c.id ? 'row-selected' : ''} onClick={() => setSelectedId(c.id)}>
                <td>{c.name}</td>
                <td><code>{c.slug}</code></td>
                <td>
                  {c.active
                    ? <span className="badge active">Activa</span>
                    : <span className="badge inactive">Inactiva</span>}
                </td>
                <td className="table-actions">
                  <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); openEdit(c); }}>Editar</button>
                  <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); setDeleting(c); }}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </>
      )}

      <Modal
        open={!!editing}
        onClose={() => !saving && setEditing(null)}
        title={editing?.id ? 'Editar categoría' : 'Nueva categoría'}
        footer={
          <>
            <button className="btn" onClick={() => setEditing(null)} disabled={saving}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <span className="spinner" /> : 'Guardar'}
            </button>
          </>
        }
      >
        {editing && (
          <form onSubmit={handleSave}>
            <div className="form-group">
              <label>Nombre</label>
              <input className="input" required maxLength={100}
                     value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Slug <span style={{ color: 'var(--color-muted)' }}>(opcional, se genera del nombre)</span></label>
              <input className="input" maxLength={60} pattern="[a-z0-9-]+"
                     value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Descripción</label>
              <textarea className="textarea" maxLength={1000}
                        value={editing.description}
                        onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </div>
            <div className="form-row">
              <CategoryColorField
                id="category-accent-color"
                label="Color de acento"
                value={editing.accent_color}
                onChange={(accent_color) => setEditing({ ...editing, accent_color })}
                fallback="#B89A5E"
              />
              <CategoryColorField
                id="category-background-color"
                label="Color de fondo"
                value={editing.background_color}
                onChange={(background_color) => setEditing({ ...editing, background_color })}
                fallback="#FAF7F2"
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Estado</label>
                <select className="select" value={String(editing.active)}
                        onChange={(e) => setEditing({ ...editing, active: e.target.value === 'true' })}>
                  <option value="true">Activa</option>
                  <option value="false">Inactiva</option>
                </select>
              </div>
            </div>
          </form>
        )}
      </Modal>

      <Confirm
        open={!!deleting}
        title="¿Eliminar categoría?"
        message={`Vas a eliminar "${deleting?.name}". Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
