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
import Modal from '../components/Modal.jsx';

function mediaUrl(url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return url;
}

function mediaFileName(item) {
  const path = String(item?.url || '').split(/[?#]/, 1)[0];
  return path.split('/').filter(Boolean).at(-1) || `imagen-${item?.id || 'media'}`;
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
  const [altSearch, setAltSearch] = useState('');

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
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const validFiles = [];
    const failures = [];
    files.forEach((file) => {
      if (!file.type.startsWith('image/')) {
        failures.push(`${file.name}: solo se permiten imágenes`);
      } else if (file.size > 5 * 1024 * 1024) {
        failures.push(`${file.name}: supera el límite de 5 MB`);
      } else {
        validFiles.push(file);
      }
    });

    if (!validFiles.length) {
      toast.error('No se subieron imágenes', failures.join('. '));
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    setUploading(true);
    let uploaded = 0;
    try {
      for (const file of validFiles) {
        try {
          const fd = new FormData();
          fd.append('file', file);
          const defaultAlt = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
          fd.append('alt_text', defaultAlt || file.name);
          if (uploadCategory) fd.append('category_id', uploadCategory);
          await api.upload('/api/admin/media', fd);
          uploaded += 1;
        } catch (err) {
          failures.push(`${file.name}: ${err.message || 'no se pudo subir'}`);
        }
      }
      await load();
      if (uploaded) toast.success(`${uploaded} ${uploaded === 1 ? 'imagen subida' : 'imágenes subidas'}`);
      if (failures.length) toast.error('Algunos archivos no se subieron', failures.join('. '));
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

  const normalizedAltSearch = altSearch.trim().toLocaleLowerCase();
  const hasFilters = Boolean(normalizedAltSearch || categoryFilter);
  const visibleItems = items.filter((item) => !normalizedAltSearch
    || String(item.alt_text || '').toLocaleLowerCase().includes(normalizedAltSearch));

  return (
    <div>
      <div className="page-header">
        <h1>Imágenes</h1>
        <div>
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleUpload} />
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
        <div><strong>Biblioteca multimedia</strong><span>{visibleItems.length} archivo{visibleItems.length === 1 ? '' : 's'} visible{visibleItems.length === 1 ? '' : 's'}</span></div>
        <div className="media-toolbar-filters">
          <label>
            Buscar por alt
            <input className="input" type="search" placeholder="Ej. vestido blanco" value={altSearch} onChange={(e) => setAltSearch(e.target.value)} />
          </label>
          <label>
            Filtrar por categoría
            <select className="select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}><option value="">Todas las categorías</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
          </label>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>
      ) : visibleItems.length === 0 ? (
        <Empty
          title={items.length === 0 && !hasFilters ? 'Sin imágenes' : 'Sin resultados'}
          description={items.length === 0 && !hasFilters ? 'Sube la primera para empezar.' : 'No hay imágenes que coincidan con los filtros.'}
        />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 12,
        }}>
          {visibleItems.map((m) => (
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
                  {m.url && <a className="btn btn-sm" href={mediaUrl(m.url)} download={mediaFileName(m)} aria-label={`Descargar ${m.alt_text || 'imagen'}`} title="Descargar imagen">Descargar</a>}
                  <button className="btn btn-sm" onClick={() => openAlt(m)}>Alt</button>
                  {m.can_delete && (
                    <button className="btn btn-sm btn-danger media-delete-button" aria-label={`Eliminar definitivamente ${m.alt_text || 'imagen'}`} title="Eliminar definitivamente" onClick={() => setDeleting(m)}>
                      <svg aria-hidden="true" viewBox="0 0 20 20" width="21" height="21" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M3.5 5.5h13M8 5.5V3.75h4V5.5m-6.5 0 .7 10.1c.06.86.77 1.52 1.63 1.52h4.34c.86 0 1.57-.66 1.63-1.52l.7-10.1M8 8.5v5.5m4-5.5v5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingAlt && (
        <Modal
          open
          onClose={() => setEditingAlt(null)}
          title="Editar alt text"
          footer={(
            <>
              <button className="btn" onClick={() => setEditingAlt(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveAlt}>Guardar</button>
            </>
          )}
        >
          <div className="form-group">
            <label>Alt (texto alternativo)</label>
            <input className="input" maxLength={300}
                   value={altText} onChange={(e) => setAltText(e.target.value)} />
            <div className="help">Descripción corta para accesibilidad y SEO.</div>
          </div>
        </Modal>
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
