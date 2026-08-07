// Editor de variantes para un producto.
//
// Carga los attribute_values del catálogo al montar (los que el producto
// tiene vinculados). Permite:
//   - Listar las variantes existentes con valores legibles (no IDs).
//   - Crear variante nueva (modal).
//   - Editar variante existente (modal con mismos campos).
//   - Borrar con confirmación.
//   - Ajuste rápido de stock (input directo en la fila).
//
// Backend: ver web/server/routes/admin/variants.js. La invariante de
// "no dos variantes con la misma combinación" la enforces el server
// (409 duplicate_variant) — acá mostramos el error como toast.

import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../api.js';
import { useToast } from './Toast.jsx';
import Modal from './Modal.jsx';
import Confirm from './Confirm.jsx';
import Empty from './Empty.jsx';

function formatCOP(n) {
  if (n === null || n === undefined || n === '') return '—';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(n));
}

function ChevronIcon({ direction }) {
  return <svg className="icon-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d={direction === 'up' ? 'm6 14 6-6 6 6' : 'm6 10 6 6 6-6'} /></svg>;
}

const EMPTY = {
  sku: '',
  price: '',
  stock: 0,
  active: true,
  description: '',
  attribute_values: [],  // [{ attribute_id, attribute_value_id }]
};

export default function VariantEditor({ productId, variants, attributes, onChange }) {
  const toast = useToast();
  const [allValues, setAllValues] = useState({});  // { [attribute_id]: [{id, value}] }
  const [editing, setEditing] = useState(null);    // variant en edición o { ...EMPTY } para nueva
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [stockBusy, setStockBusy] = useState(null);  // id de variante mientras se ajusta stock
  const [selectedId, setSelectedId] = useState(null);
  const [moving, setMoving] = useState(false);
  const [media, setMedia] = useState([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');

  // Cargar todos los valores de los atributos del producto
  useEffect(() => {
    (async () => {
      const map = {};
      for (const a of attributes) {
        try {
          const { values } = await api.get(`/api/admin/attributes/${a.id}/values`);
          map[a.id] = values || [];
        } catch {
          map[a.id] = [];
        }
      }
      setAllValues(map);
    })();
  }, [attributes]);

  const reload = async () => { await onChange?.(); };

  const loadMedia = async (variantId) => {
    setMediaLoading(true);
    try {
      const data = await api.get(`/api/admin/media?product_id=${productId}&variant_id=${variantId}`);
      setMedia(data.media || []);
    } catch (err) {
      toast.error('No se pudo cargar la multimedia', err.message);
      setMedia([]);
    } finally { setMediaLoading(false); }
  };

  useEffect(() => {
    setVideoUrl('');
    if (editing?.id) loadMedia(editing.id);
    else setMedia([]);
  }, [editing?.id]);

  const openNew = () => setEditing({ ...EMPTY, attribute_values: attributes.map((a) => ({ attribute_id: a.id, attribute_value_id: '' })) });
  const openEdit = (v) => setEditing({
    id: v.id,
    sku: v.sku || '',
    price: v.price ?? '',
    stock: v.stock,
    active: v.active,
    description: v.description || '',
    attribute_values: attributes.map((a) => {
      const found = (v.attribute_values || []).find((x) => x.attribute_id === a.id);
      return { attribute_id: a.id, attribute_value_id: found ? found.attribute_value_id : '' };
    }),
  });

  const handleSave = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      // Filtrar los attribute_values que sí tienen valor seleccionado
      const avs = editing.attribute_values
        .filter((x) => x.attribute_value_id !== '' && x.attribute_value_id !== null)
        .map((x) => ({ attribute_id: Number(x.attribute_id), attribute_value_id: Number(x.attribute_value_id) }));

      if (editing.id) {
        await api.patch(`/api/admin/variants/${editing.id}`, {
          sku: editing.sku || null,
          price: editing.price === '' ? null : Number(editing.price),
          stock: Number(editing.stock),
          active: !!editing.active,
          description: editing.description || '',
        });
        // Si los attribute_values cambiaron, mandarlos aparte (update los acepta)
        const original = variants.find((v) => v.id === editing.id);
        const originalAvs = (original?.attribute_values || []).map((x) => ({ attribute_id: x.attribute_id, attribute_value_id: x.attribute_value_id }));
        const sameCombo = originalAvs.length === avs.length &&
          originalAvs.every((x) => avs.some((y) => y.attribute_id === x.attribute_id && y.attribute_value_id === x.attribute_value_id));
        if (!sameCombo) {
          await api.patch(`/api/admin/variants/${editing.id}`, { attribute_values: avs });
        }
        toast.success('Variante actualizada');
      } else {
        await api.post(`/api/admin/products/${productId}/variants`, {
          sku: editing.sku || null,
          price: editing.price === '' ? null : Number(editing.price),
          stock: Number(editing.stock),
          active: !!editing.active,
          description: editing.description || '',
          attribute_values: avs,
        });
        toast.success('Variante creada');
      }
      setEditing(null);
      await reload();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'duplicate_variant') {
        toast.error('Ya existe una variante con esa combinación de atributos');
      } else {
        toast.error('No se pudo guardar', err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/api/admin/variants/${deleting.id}`);
      toast.success('Variante eliminada');
      setDeleting(null);
      await reload();
    } catch (err) {
      toast.error('No se pudo eliminar', err.message);
    }
  };

  const handleStockChange = async (variant, newStock) => {
    setStockBusy(variant.id);
    try {
      await api.patch(`/api/admin/variants/${variant.id}/stock`, { stock: Number(newStock) });
      toast.success('Stock actualizado');
      await reload();
    } catch (err) {
      toast.error('No se pudo actualizar el stock', err.message);
    } finally {
      setStockBusy(null);
    }
  };

  const setAv = (attrId, valueId) => {
    setEditing((cur) => ({
      ...cur,
      attribute_values: cur.attribute_values.map((x) =>
        x.attribute_id === attrId ? { ...x, attribute_value_id: valueId === '' ? '' : Number(valueId) } : x
      ),
    }));
  };

  const moveSelected = async (direction) => {
    const index = variants.findIndex((item) => item.id === selectedId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= variants.length) return;
    const current = variants[index];
    const target = variants[targetIndex];
    setMoving(true);
    try {
      await Promise.all([
        api.patch(`/api/admin/variants/${current.id}`, { display_order: target.display_order }),
        api.patch(`/api/admin/variants/${target.id}`, { display_order: current.display_order }),
      ]);
      toast.success('Orden actualizado');
      await reload();
    } catch (err) { toast.error('No se pudo cambiar el orden', err.message); }
    finally { setMoving(false); }
  };

  const uploadImages = async (event) => {
    const files = [...(event.target.files || [])];
    if (!editing?.id || files.length === 0) return;
    setMediaBusy(true);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        form.append('product_id', String(productId));
        form.append('variant_id', String(editing.id));
        form.append('alt_text', `${editing.sku || 'Variante'} — ${file.name}`);
        await api.upload('/api/admin/media', form);
      }
      toast.success(files.length === 1 ? 'Imagen cargada' : `${files.length} imágenes cargadas`);
      await loadMedia(editing.id);
    } catch (err) { toast.error('No se pudieron cargar las imágenes', err.message); }
    finally { setMediaBusy(false); event.target.value = ''; }
  };

  const addVideo = async () => {
    if (!editing?.id || !videoUrl.trim()) return;
    setMediaBusy(true);
    try {
      await api.post('/api/admin/media', {
        kind: 'video_embed', product_id: productId, variant_id: editing.id, url: videoUrl.trim(),
        alt_text: `${editing.sku || 'Variante'} — video`,
      });
      setVideoUrl('');
      toast.success('Video agregado');
      await loadMedia(editing.id);
    } catch (err) { toast.error('No se pudo agregar el video', err.message); }
    finally { setMediaBusy(false); }
  };

  const removeMedia = async (item) => {
    try {
      await api.delete(`/api/admin/media/${item.id}`);
      setMedia((cur) => cur.filter((mediaItem) => mediaItem.id !== item.id));
    } catch (err) { toast.error('No se pudo eliminar el archivo', err.message); }
  };

  if (attributes.length === 0) {
    return (
      <>
        <h2>Variantes</h2>
        <div className="empty" style={{ padding: 20 }}>
          Primero vincula atributos al producto (arriba) para poder crear variantes.
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header" style={{ marginTop: 0 }}>
        <h2>Variantes</h2>
        <button className="btn btn-primary btn-sm" onClick={openNew}>+ Nueva variante</button>
      </div>

      {variants.length === 0 ? (
        <Empty title="Sin variantes" description="Crea la primera combinación." action={
          <button className="btn btn-primary btn-sm" onClick={openNew}>+ Nueva variante</button>
        } />
      ) : (
        <>
        <div className="order-toolbar">
          <span>{selectedId ? 'Variante seleccionada' : 'Selecciona una variante para cambiar su posición'}</span>
          <div className="order-toolbar-actions">
            <button className="btn btn-sm" aria-label="Subir variante" title="Subir" disabled={!selectedId || moving || variants.findIndex((v) => v.id === selectedId) <= 0} onClick={() => moveSelected(-1)}><ChevronIcon direction="up" /></button>
            <button className="btn btn-sm" aria-label="Bajar variante" title="Bajar" disabled={!selectedId || moving || variants.findIndex((v) => v.id === selectedId) === variants.length - 1} onClick={() => moveSelected(1)}><ChevronIcon direction="down" /></button>
          </div>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Combinación</th>
              <th>Stock</th>
              <th>Precio</th>
              <th>Estado</th>
              <th style={{ textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => (
              <tr key={v.id} className={selectedId === v.id ? 'row-selected' : ''} onClick={() => setSelectedId(v.id)}>
                <td><code>{v.sku || '—'}</code></td>
                <td style={{ fontSize: 12 }}>
                  {(v.attribute_values || []).map((x) => (
                    <span key={x.attribute_id} className="badge" style={{ marginRight: 4 }}>
                      {x.attribute_name}: {x.value}
                    </span>
                  ))}
                </td>
                <td>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    style={{ width: 80, padding: '4px 6px' }}
                    defaultValue={v.stock}
                    onBlur={(e) => { if (Number(e.target.value) !== v.stock) handleStockChange(v, e.target.value); }}
                    disabled={stockBusy === v.id}
                  />
                </td>
                <td>{formatCOP(v.price)}</td>
                <td>
                  {v.active
                    ? <span className="badge active">Activa</span>
                    : <span className="badge inactive">Inactiva</span>}
                </td>
                <td className="table-actions">
                  <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); openEdit(v); }}>Editar</button>
                  <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); setDeleting(v); }}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </>
      )}

      <Modal
        open={!!editing}
        size="lg"
        onClose={() => !saving && setEditing(null)}
        title={editing?.id ? 'Editar variante' : 'Nueva variante'}
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
            <div className="form-row">
              <div className="form-group">
                <label>SKU <span style={{ color: 'var(--color-muted)' }}>(opcional)</span></label>
                <input className="input" maxLength={80}
                       value={editing.sku} onChange={(e) => setEditing({ ...editing, sku: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Precio <span style={{ color: 'var(--color-muted)' }}>(opcional, usa base del producto)</span></label>
                <input className="input" type="number" min={0}
                       value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Stock</label>
                <input className="input" type="number" min={0} required
                       value={editing.stock} onChange={(e) => setEditing({ ...editing, stock: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Estado</label>
                <select className="select" value={String(editing.active)}
                        onChange={(e) => setEditing({ ...editing, active: e.target.value === 'true' })}>
                  <option value="true">Activa</option>
                  <option value="false">Inactiva</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Descripción de esta variante <span style={{ color: 'var(--color-muted)' }}>(opcional)</span></label>
              <textarea className="textarea" rows={3} maxLength={5000}
                        placeholder="Detalles exclusivos de esta combinación…"
                        value={editing.description || ''}
                        onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </div>
            <h3 style={{ marginTop: 16 }}>Combinación de atributos</h3>
            {attributes.map((a) => (
              <div className="form-group" key={a.id}>
                <label>{a.name}</label>
                <select className="select" required
                        value={editing.attribute_values.find((x) => x.attribute_id === a.id)?.attribute_value_id ?? ''}
                        onChange={(e) => setAv(a.id, e.target.value)}>
                        <option value="">— Selecciona —</option>
                  {(allValues[a.id] || []).map((v) => (
                    <option key={v.id} value={v.id}>{v.value}</option>
                  ))}
                </select>
              </div>
            ))}
            {editing.id && <div className="variant-media-panel">
              <div className="variant-media-heading">
                <div><h3>Multimedia de la variante</h3><p>Sube varias imágenes o agrega un enlace de video para esta combinación.</p></div>
                <label className="btn btn-sm btn-primary">
                  {mediaBusy ? 'Cargando…' : '＋ Imágenes'}
                  <input type="file" accept="image/*" multiple hidden disabled={mediaBusy} onChange={uploadImages} />
                </label>
              </div>
              <div className="variant-video-add">
                <input className="input" type="url" placeholder="https://… enlace de video" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
                <button className="btn btn-sm" type="button" disabled={mediaBusy || !videoUrl.trim()} onClick={addVideo}>Agregar video</button>
              </div>
              {mediaLoading ? <p className="form-hint">Cargando multimedia…</p> : media.length === 0 ? <p className="form-hint">Aún no hay imágenes ni videos para esta variante.</p> : <div className="variant-media-grid">
                {media.map((item) => <div className="variant-media-item" key={item.id}>
                  {item.kind === 'image' ? <img src={item.url} alt={item.alt_text || ''} /> : <div className="variant-video-tile">▶ Video</div>}
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => removeMedia(item)}>Eliminar</button>
                </div>)}
              </div>}
            </div>}
          </form>
        )}
      </Modal>

      <Confirm
        open={!!deleting}
        title="¿Eliminar variante?"
        message="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
    </>
  );
}
