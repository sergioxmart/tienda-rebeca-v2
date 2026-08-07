// Galería de imágenes (product_media). Lista todas las imágenes, permite
// subir nuevas, editar alt text, y eliminar definitivamente.
//
// Endpoints:
//   GET    /api/admin/media
//   POST   /api/admin/media            multipart/form-data: file, product_id?, alt?
//   PATCH  /api/admin/media/:id        { alt_text?, display_order? }
//   DELETE /api/admin/media/:id        (borrado definitivo)
//   POST   /api/admin/media/cleanup    { older_than_days?: number }
//
// Lo mostramos como grid de cards, no tabla — más visual.

import React, { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import Empty from '../components/Empty.jsx';
import Confirm from '../components/Confirm.jsx';

function mediaUrl(url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return url;
}

export default function Media() {
  const toast = useToast();
  const fileRef = useRef(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingAlt, setEditingAlt] = useState(null);  // media item
  const [altText, setAltText] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [categories, setCategories] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [uploadCategory, setUploadCategory] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get(`/api/admin/media${categoryFilter ? `?category_id=${categoryFilter}` : ''}`);
      setItems(data.media || data.items || []);
    } catch (err) {
      toast.error('No se pudo cargar la galería', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [categoryFilter]);

  useEffect(() => {
    api.get('/api/admin/categories').then((data) => setCategories(data.categories || [])).catch(() => setCategories([]));
  }, []);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Solo se permiten imágenes');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen no puede pesar más de 5 MB');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (uploadCategory) fd.append('category_id', uploadCategory);
      await api.upload('/api/admin/media', fd);
      toast.success('Imagen subida');
      await load();
    } catch (err) {
      toast.error('No se pudo subir la imagen', err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const updateCategory = async (item, categoryId) => {
    try {
      await api.patch(`/api/admin/media/${item.id}`, { category_id: categoryId ? Number(categoryId) : null });
      setItems((current) => current.map((media) => media.id === item.id ? { ...media, category_id: categoryId ? Number(categoryId) : null } : media));
      toast.success('Categoría de imagen actualizada');
    } catch (err) { toast.error('No se pudo clasificar la imagen', err.message); }
  };

  const openAlt = (m) => {
    setEditingAlt(m);
    setAltText(m.alt_text || '');
  };

  const saveAlt = async () => {
    try {
      await api.patch(`/api/admin/media/${editingAlt.id}`, { alt_text: altText });
      toast.success('Alt text guardado');
      setEditingAlt(null);
      await load();
    } catch (err) {
      toast.error('No se pudo guardar', err.message);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/api/admin/media/${deleting.id}`);
      toast.success('Imagen eliminada');
      setDeleting(null);
      await load();
    } catch (err) {
      toast.error('No se pudo eliminar', err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Imágenes</h1>
        <div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUpload} />
          <select className="select media-upload-category" value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)} aria-label="Categoría para la imagen nueva">
            <option value="">Categoría automática</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <span className="spinner" /> : '+ Subir imagen'}
          </button>
        </div>
      </div>
      <p style={{ color: 'var(--color-muted)' }}>
        Clasifica tus imágenes por categoría y vincúlalas a un producto o variante desde su edición.
      </p>

      <div className="media-toolbar">
        <div><strong>Biblioteca multimedia</strong><span>{items.length} archivo{items.length === 1 ? '' : 's'} visibles</span></div>
        <label>Filtrar por categoría<select className="select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}><option value="">Todas las categorías</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>
      ) : items.length === 0 ? (
        <Empty title="Sin imágenes" description="Subí la primera para empezar." />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 12,
        }}>
          {items.map((m) => (
            <div key={m.id} style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}>
              <div style={{
                aspectRatio: '1/1',
                background: '#f0f0f0',
                backgroundImage: `url(${mediaUrl(m.url || m.thumb_url)})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }} />
              <div style={{ padding: 8, fontSize: 12 }}>
                <div style={{ color: 'var(--color-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.alt_text || <em>sin alt</em>}
                </div>
                <select className="select media-card-category" value={m.category_id || ''} onChange={(e) => updateCategory(m, e.target.value)} aria-label={`Categoría de ${m.alt_text || 'imagen'}`}>
                  <option value="">Sin categoría</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
                <div className="table-actions" style={{ marginTop: 6 }}>
                  <button className="btn btn-sm" onClick={() => openAlt(m)}>Alt</button>
                  <button className="btn btn-sm btn-danger" onClick={() => setDeleting(m)}>×</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingAlt && (
        <div className="modal-backdrop" onClick={() => setEditingAlt(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Editar alt text</h2>
              <button className="modal-close" onClick={() => setEditingAlt(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Alt (texto alternativo)</label>
                <input className="input" maxLength={300}
                       value={altText} onChange={(e) => setAltText(e.target.value)} />
                <div className="help">Descripción corta para accesibilidad y SEO.</div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setEditingAlt(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveAlt}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      <Confirm
        open={!!deleting}
        title="¿Eliminar imagen?"
        message="Se eliminará definitivamente el registro y el archivo físico. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
