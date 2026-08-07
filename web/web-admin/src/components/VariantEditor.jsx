// Editor de variantes para un producto.
//
// Carga los attribute_values del catálogo al montar (los que el producto
// tiene vinculados). Permite:
//   - Listar las variantes existentes con valores legibles (no IDs).
//   - Crear variante nueva (modal).
//   - Editar variante existente (modal con mismos campos).
//   - Borrar con confirmación.
//   - La existencia se consulta en Inventario; este editor no la modifica.
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
import MoneyInput from './MoneyInput.jsx';

function formatCOP(n) {
  if (n === null || n === undefined || n === '') return '—';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(n));
}

function integerPrice(value) {
  if (value === null || value === undefined || value === '') return '';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(Math.round(parsed)) : '';
}

function ChevronIcon({ direction }) {
  return <svg className="icon-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d={direction === 'up' ? 'm6 14 6-6 6 6' : 'm6 10 6 6 6-6'} /></svg>;
}

const EMPTY = {
  sku: '',
  price: '',
  compare_at: '',
  price_mode: 'product',
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
  const [selectedId, setSelectedId] = useState(null);
  const [moving, setMoving] = useState(false);
  const [media, setMedia] = useState([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [libraryMedia, setLibraryMedia] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

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

  const loadLibrary = async () => {
    setLibraryLoading(true);
    try {
      const data = await api.get('/api/admin/media');
      setLibraryMedia(data.media || []);
    } catch (err) {
      toast.error('No se pudo cargar la biblioteca', err.message);
      setLibraryMedia([]);
    } finally { setLibraryLoading(false); }
  };

  useEffect(() => {
    setVideoUrl('');
    setLibraryOpen(false);
    if (editing?.id) {
      loadMedia(editing.id);
      loadLibrary();
    } else {
      setMedia([]);
      setLibraryMedia([]);
    }
  }, [editing?.id]);

  const openNew = () => setEditing({ ...EMPTY, attribute_values: attributes.map((a) => ({ attribute_id: a.id, attribute_value_id: '' })) });
  const openEdit = (v) => setEditing({
    id: v.id,
    sku: v.sku || '',
    price: integerPrice(v.price),
    compare_at: integerPrice(v.compare_at),
    price_mode: Number(v.price) > 0 || Number(v.compare_at) > 0 ? 'variant' : 'product',
    active: v.active,
    description: v.description || '',
    attribute_values: attributes.map((a) => {
      const found = (v.attribute_values || []).find((x) => x.attribute_id === a.id);
      return { attribute_id: a.id, attribute_value_id: found ? found.attribute_value_id : '' };
    }),
  });

  const handleSave = async (e) => {
    e?.preventDefault();
    const avs = editing.attribute_values
      .filter((x) => x.attribute_value_id !== '' && x.attribute_value_id !== null)
      .map((x) => ({ attribute_id: Number(x.attribute_id), attribute_value_id: Number(x.attribute_value_id) }));
    const missingAttributes = attributes.filter((attribute) => attribute.is_required !== false
      && !avs.some((value) => value.attribute_id === Number(attribute.id)));
    if (missingAttributes.length > 0) {
      toast.error('Completa la combinación', `Selecciona un valor para: ${missingAttributes.map((attribute) => attribute.name).join(', ')}`);
      return;
    }
    if (avs.some((value) => !Number.isInteger(value.attribute_id) || value.attribute_id < 1
      || !Number.isInteger(value.attribute_value_id) || value.attribute_value_id < 1)) {
      toast.error('Combinación inválida', 'Revisa los valores de atributos seleccionados.');
      return;
    }

    setSaving(true);
    try {
      if (editing.id) {
        await api.patch(`/api/admin/variants/${editing.id}`, {
          sku: editing.sku || null,
          price: editing.price_mode === 'product' || editing.price === '' ? null : Number(editing.price),
          compare_at: editing.price_mode === 'product' || editing.compare_at === '' ? null : Number(editing.compare_at),
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
        const data = await api.post(`/api/admin/products/${productId}/variants`, {
          sku: editing.sku || null,
          price: editing.price_mode === 'product' || editing.price === '' ? null : Number(editing.price),
          compare_at: editing.price_mode === 'product' || editing.compare_at === '' ? null : Number(editing.compare_at),
          active: !!editing.active,
          description: editing.description || '',
          attribute_values: avs,
        });
        toast.success('Variante creada');
        await reload();
        // La variante debe existir antes de asociar multimedia. Mantenemos el
        // modal abierto y lo convertimos en edición para mostrar el panel.
        if (data.variant?.id) {
          setEditing((current) => ({ ...current, id: data.variant.id, attribute_values: avs }));
        } else {
          setEditing(null);
        }
      }
      if (editing.id) {
        setEditing(null);
        await reload();
      }
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

  const attachLibraryMedia = async (item) => {
    if (!editing?.id) return;
    setMediaBusy(true);
    try {
      await api.post(`/api/admin/media/${item.id}/attach`, {
        product_id: Number(productId),
        variant_id: Number(editing.id),
      });
      toast.success('Multimedia agregada a la variante');
      await loadMedia(editing.id);
      setLibraryOpen(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'media_already_attached') {
        toast.error('Esta multimedia ya está en la variante');
      } else {
        toast.error('No se pudo agregar la multimedia', err.message);
      }
    } finally { setMediaBusy(false); }
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
        <div><h2>Variantes</h2><p className="form-hint">Las cantidades se gestionan por separado en <a href="/inventory">Inventario</a>.</p></div>
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
              <th>Precio base</th>
              <th>Comparativo</th>
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
                <td>{formatCOP(v.price)}</td>
                <td>{formatCOP(v.compare_at)}</td>
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
                <label>Aplicación del precio</label>
                <select className="select" value={editing.price_mode || 'product'} onChange={(e) => setEditing({
                  ...editing,
                  price_mode: e.target.value,
                  ...(e.target.value === 'product' ? { price: '', compare_at: '' } : {}),
                })}>
                  <option value="product">Heredar precio principal del producto</option>
                  <option value="variant">Usar precio específico de esta variante</option>
                </select>
                <p className="form-hint">Solo las variantes con precio específico alteran el precio principal.</p>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Precio base de la variante <span style={{ color: 'var(--color-muted)' }}>(0 usa el principal)</span></label>
                <MoneyInput disabled={editing.price_mode !== 'variant'} placeholder="0"
                            value={editing.price} onChange={(value) => setEditing({ ...editing, price: value })} />
              </div>
              <div className="form-group">
                <label>Precio comparativo <span style={{ color: 'var(--color-muted)' }}>(0 usa el principal)</span></label>
                <MoneyInput disabled={editing.price_mode !== 'variant'} placeholder="0"
                            value={editing.compare_at} onChange={(value) => setEditing({ ...editing, compare_at: value })} />
                <p className="form-hint">Se muestra tachado cuando es mayor que el precio base.</p>
              </div>
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
                <select className="select" required={a.is_required !== false}
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
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-sm" disabled={mediaBusy} onClick={() => { setLibraryOpen((open) => !open); if (!libraryMedia.length) loadLibrary(); }}>
                    {libraryOpen ? 'Cerrar biblioteca' : 'Elegir de biblioteca'}
                  </button>
                  <label className="btn btn-sm btn-primary">
                    {mediaBusy ? 'Cargando…' : '＋ Imágenes'}
                    <input type="file" accept="image/*" multiple hidden disabled={mediaBusy} onChange={uploadImages} />
                  </label>
                </div>
              </div>
              {libraryOpen && <div className="variant-media-library">
                <div className="variant-media-library-heading">
                  <strong>Multimedia cargada en /media</strong>
                  <span>Selecciona una para reutilizarla en esta variante.</span>
                </div>
                {libraryLoading ? <p className="form-hint">Cargando biblioteca…</p> : (() => {
                  const attachedUrls = new Set(media.map((item) => item.url));
                  const available = libraryMedia.filter((item) => !attachedUrls.has(item.url));
                  return available.length === 0 ? <p className="form-hint">No hay archivos disponibles para agregar.</p> : <div className="variant-media-library-grid">
                    {available.map((item) => <button type="button" className="variant-media-library-item" key={item.id} disabled={mediaBusy} onClick={() => attachLibraryMedia(item)}>
                      {item.kind === 'image' ? <img src={item.url} alt={item.alt_text || ''} /> : <span className="variant-video-tile">▶ Video</span>}
                      <span>{item.kind === 'image' ? 'Agregar imagen' : 'Agregar video'}</span>
                    </button>)}
                  </div>;
                })()}
              </div>}
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
