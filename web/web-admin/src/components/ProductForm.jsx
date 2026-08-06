// Formulario de producto (Gestión Tienda): la faceta VITRINA del catálogo
// unificado. Acá se edita lo que se ve en la tienda: colección, nombre,
// descripción, fotos y destacado. La sustancia (SKU, precios, costo, tallas,
// stock, promos) vive en Gestión General → Inventario y acá solo se muestra.

import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { priceLines } from '../lib/products.js';
import { money } from '../lib/format.js';

export default function ProductForm({ editing, setEditing, collections, err }) {
  function updateField(k, v) { setEditing((p) => ({ ...p, [k]: v })); }

  if (!editing) return null;

  const stockTotal = Number(editing.stock_total ?? (editing.use_colors
    ? (editing.variants || []).reduce((acc, variant) => acc + (Number(variant.stock) || 0), 0)
    : (editing.sizes || []).reduce((acc, size) => acc + (Number(size.stock) || 0), 0)));

  return (
    <div className="form">
      {err && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</div>}

      <div className="form-hint" style={{ marginBottom: 4 }}>
        Estado:{' '}
        <span className={`badge ${editing.published ? 'ok' : 'off'}`}>
          {editing.published ? 'Publicado' : 'No publicado'}
        </span>
        {stockTotal === 0 && <span className="badge off" style={{ marginLeft: 4 }}>Agotado</span>}
      </div>

      <div className="form-row">
        <label>Colecciones públicas {!editing.published && '(al menos una obligatoria para publicar)'}</label>
        <div className="form-hint" style={{ marginTop: 2 }}>
          “Destacado” se administra abajo para el carrusel; no es una colección pública.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6, maxHeight: 150, overflowY: 'auto', border: '1px solid var(--gray-200)', padding: '8px 10px', borderRadius: 6, background: 'var(--gray-50)' }}>
          {collections.filter(c => !c.is_system).map((c) => {
            const isChecked = (editing.collection_ids || []).map(Number).includes(Number(c.id));
            return (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', fontWeight: 'normal', cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => {
                    const current = (editing.collection_ids || []).map(Number);
                    const next = e.target.checked
                      ? [...current, Number(c.id)]
                      : current.filter(id => id !== Number(c.id));
                    updateField('collection_ids', next);
                  }}
                  style={{ width: 'auto', marginRight: 8 }}
                />
                {c.name}
              </label>
            );
          })}
        </div>
      </div>

      <div className="form-row">
        <label>Nombre *</label>
        <input
          value={editing.name}
          onChange={(e) => updateField('name', e.target.value)}
          placeholder="Ej: Vestido Aurora"
        />
      </div>

      <div className="form-row">
        <label>Descripción</label>
        <textarea
          rows={3}
          value={editing.description || ''}
          onChange={(e) => updateField('description', e.target.value)}
          placeholder="Corte, tela, detalles..."
        />
      </div>

      {/* Solo lectura: la sustancia se edita en Gestión General → Inventario.
          La tienda refleja precios y stock, nunca los decide. */}
      <div className="form-row">
        <label>Precios y stock</label>
        <div className="form-hint" style={{ display: 'grid', gap: 4 }}>
          {editing.sku && <div>SKU: <span style={{ fontFamily: 'monospace' }}>{editing.sku}</span></div>}
          {priceLines(editing).map((line) => (
            <div key={line.label}>{line.label}: <strong>{line.price}</strong></div>
          ))}
          {editing.promo && (
            <div>
              Promo: <span className="badge ok">
                {editing.promo.kind === 'percent' ? `−${Number(editing.promo.value)}%` : `−${money(editing.promo.value)}`}
              </span>{' '}
              hasta el {editing.promo.ends_at}
            </div>
          )}
          <div>
            Stock: <strong>{stockTotal}</strong>
            {(editing.sizes || []).length > 0 && (
              <> ({(editing.sizes || []).map((s) => `${s.label ?? 'Única'}: ${s.stock}`).join(' · ')})</>
            )}
          </div>
          <div style={{ marginTop: 2 }}>
            Se editan en <strong>Gestión General → Inventario</strong> (es el mismo producto).
          </div>
        </div>
      </div>

      {editing.id ? (
        <ProductPhotos
          productId={editing.id}
          useColors={!!editing.use_colors}
          productColors={editing.colors || []}
        />
      ) : (
        <div className="form-row">
          <label>Fotos</label>
          <div className="form-hint">Crea el producto primero; el formulario queda abierto para subir las fotos.</div>
        </div>
      )}

      <div className="form-row-inline" style={{ gap: 24 }}>
        <label>
          <input
            type="checkbox"
            checked={!!editing.featured}
            onChange={(e) => updateField('featured', e.target.checked)}
            style={{ width: 'auto', marginRight: 6 }}
          />
          Destacado (aparece en el carrusel)
        </label>
      </div>
    </div>
  );
}

// Fotos del producto: subir, mover a color, quitar o eliminar. Si el
// producto maneja colores, se puede asignar cada foto a un color (o
// dejarla "general" como fallback). El catálogo de colores del producto
// viene por prop (lo trae la página desde el GET del item).
function ProductPhotos({ productId, useColors, productColors }) {
  const [photos, setPhotos] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  // Selector "Asignar a" para los nuevos uploads. '' = general.
  const [uploadColorId, setUploadColorId] = useState('');
  // Filtro de la galería por color. '' = todas, 'general' = solo generales,
  // número = ese color.
  const [filterColor, setFilterColor] = useState('');
  const fileRef = useRef(null);

  async function load() {
    const r = await api(`/api/admin/media?product_id=${productId}&kind=image`);
    if (r.ok) setPhotos(r.data.data);
  }
  useEffect(() => { load(); }, [productId]);

  async function onUpload(e) {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    setErr('');
    for (const file of files) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('product_id', String(productId));
      if (useColors && uploadColorId) fd.append('color_id', String(uploadColorId));
      const r = await api('/api/admin/media', { method: 'POST', body: fd });
      if (!r.ok) {
        setErr(r.data?.error || 'Error al subir');
        break;
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
    load();
  }

  async function moveToColor(m, colorId) {
    const r = await api(`/api/admin/media/${m.id}`, {
      method: 'PATCH',
      body: { color_id: colorId === '' ? null : Number(colorId) },
    });
    if (r.ok) load();
    else alert(r.data?.error || 'Error al reasignar');
  }

  async function unassign(m) {
    const r = await api(`/api/admin/media/${m.id}`, { method: 'PATCH', body: { product_id: null } });
    if (r.ok) load();
  }

  async function remove(m) {
    if (!confirm('¿Eliminar esta foto? Queda 30 días en papelera antes de borrarse.')) return;
    const r = await api(`/api/admin/media/${m.id}`, { method: 'DELETE' });
    if (r.ok) load();
  }

  // Filtro en cliente: la query ya devuelve las del producto. El filtro
  // aplica en el render (la página chica, no vale la pena pedir de nuevo).
  const visible = (photos || []).filter((m) => {
    if (!filterColor && filterColor !== 'general') return true;
    if (filterColor === 'general') return m.color_id == null;
    return Number(m.color_id) === Number(filterColor);
  });

  // Helper: swatch inline de un color.
  function ColorDot({ color, size = 12 }) {
    return (
      <span
        style={{
          width: size, height: size, borderRadius: '50%',
          background: color?.hex || 'transparent',
          border: '1px solid var(--gray-300)',
          display: 'inline-block',
        }}
        title={color?.label || 'sin color'}
      />
    );
  }

  return (
    <div className="form-row">
      <label>Fotos del producto</label>

      {useColors && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
          <span className="form-hint" style={{ marginRight: 4 }}>Subir a:</span>
          <button
            type="button"
            className={`row-btn ${uploadColorId === '' ? 'on' : ''}`}
            onClick={() => setUploadColorId('')}
            style={{ background: uploadColorId === '' ? 'var(--gold-soft)' : 'white', borderColor: uploadColorId === '' ? 'var(--accent)' : 'var(--gray-300)' }}
          >
            General
          </button>
          {(productColors || []).map((c) => (
            <button
              key={c.id}
              type="button"
              className={`row-btn ${Number(uploadColorId) === Number(c.id) ? 'on' : ''}`}
              onClick={() => setUploadColorId(String(c.id))}
              style={{ background: Number(uploadColorId) === Number(c.id) ? 'var(--gold-soft)' : 'white', borderColor: Number(uploadColorId) === Number(c.id) ? 'var(--accent)' : 'var(--gray-300)' }}
            >
              <ColorDot color={c} size={10} /> {c.label}
            </button>
          ))}
        </div>
      )}

      {useColors && (productColors || []).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
          <span className="form-hint" style={{ marginRight: 4 }}>Filtrar:</span>
          <button
            type="button"
            className={`row-btn ${!filterColor ? 'on' : ''}`}
            onClick={() => setFilterColor('')}
            style={{ background: !filterColor ? 'var(--gold-soft)' : 'white' }}
          >
            Todas ({photos?.length || 0})
          </button>
          <button
            type="button"
            className={`row-btn ${filterColor === 'general' ? 'on' : ''}`}
            onClick={() => setFilterColor('general')}
            style={{ background: filterColor === 'general' ? 'var(--gold-soft)' : 'white' }}
          >
            Generales ({(photos || []).filter((m) => m.color_id == null).length})
          </button>
          {(productColors || []).map((c) => {
            const n = (photos || []).filter((m) => Number(m.color_id) === Number(c.id)).length;
            return (
              <button
                key={c.id}
                type="button"
                className={`row-btn ${Number(filterColor) === Number(c.id) ? 'on' : ''}`}
                onClick={() => setFilterColor(String(c.id))}
                style={{ background: Number(filterColor) === Number(c.id) ? 'var(--gold-soft)' : 'white' }}
              >
                <ColorDot color={c} size={10} /> {c.label} ({n})
              </button>
            );
          })}
        </div>
      )}

      <div className="photo-grid">
        {visible.map((m) => (
          <div key={m.id} className="photo-cell">
            <img src={m.url} alt={m.alt_text || ''} onError={(e) => { e.target.style.display = 'none'; }} />
            {useColors && (
              <div style={{ position: 'absolute', top: 4, left: 4, display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.92)', padding: '2px 6px', borderRadius: 10, fontSize: 11 }}>
                {m.color_id
                  ? <><ColorDot color={m} size={10} /> {m.color_label}</>
                  : <span style={{ color: 'var(--gray-500)' }}>General</span>}
              </div>
            )}
            <div className="photo-cell-actions">
              {useColors && (productColors || []).length > 0 && (
                <select
                  value={m.color_id == null ? '' : String(m.color_id)}
                  onChange={(e) => moveToColor(m, e.target.value)}
                  title="Mover a color"
                  style={{ maxWidth: 130 }}
                >
                  <option value="">General</option>
                  {(productColors || []).map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              )}
              <button type="button" className="row-btn" onClick={() => unassign(m)} title="Quitar del producto (queda en Media como huérfana)">Quitar</button>
              <button type="button" className="row-btn danger" onClick={() => remove(m)}>Eliminar</button>
            </div>
          </div>
        ))}
        <label className={`photo-add ${uploading ? 'is-busy' : ''}`}>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            onChange={onUpload}
            disabled={uploading}
            style={{ display: 'none' }}
          />
          {uploading ? 'Subiendo…' : '+ Subir fotos'}
        </label>
      </div>
      {err && <div className="form-hint" style={{ color: 'var(--danger)' }}>{err}</div>}
      <div className="form-hint">
        {useColors
          ? 'Recomendado: 3 a 5 fotos por producto. La primera es la principal. Las "Generales" se muestran cuando un color no tiene fotos propias.'
          : 'Recomendado: 3 a 5 fotos por producto. La primera es la principal.'}
      </div>
    </div>
  );
}
