import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';
import { useMe } from '../hooks/useMe.js';
import { canWrite } from '../lib/permissions.js';

// Thumbnail con fallback: si el archivo ya no existe en disco (papelera
// purgada, seed viejo), mostramos un placeholder en vez del ícono roto.
function MediaThumb({ url, alt }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [url]);
  if (broken) {
    return (
      <div className="thumb-fallback">
        <span style={{ fontSize: 22 }}>🖼️</span>
        <span>Archivo no encontrado</span>
      </div>
    );
  }
  return <img src={url} alt={alt} loading="lazy" onError={() => setBroken(true)} />;
}

function humanSize(bytes) {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = Number(bytes);
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
}

export default function Media() {
  const me = useMe();
  const canEdit = me ? canWrite('media', me.role) : true;
  const [items, setItems] = useState(null);
  const [collections, setCollections] = useState([]);
  const [products, setProducts] = useState([]);
  const [filterProduct, setFilterProduct] = useState('');
  const [filterOrphan, setFilterOrphan] = useState(false);
  const [err, setErr] = useState('');
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pending, setPending] = useState(false);
  const fileRef = useRef(null);

  async function load() {
    setErr('');
    const params = new URLSearchParams();
    if (filterProduct) params.set('product_id', filterProduct);
    if (filterOrphan) params.set('orphan', 'true');
    const r = await api(`/api/admin/media?${params}`);
    if (r.ok) setItems(r.data.data);
    else setErr(r.data?.error || 'Error al cargar');
  }
  async function loadMeta() {
    const [cs, ps] = await Promise.all([
      api('/api/admin/collections'),
      api('/api/admin/products'),
    ]);
    if (cs.ok) setCollections(cs.data.data);
    if (ps.ok) setProducts(ps.data.data);
  }
  useEffect(() => { load(); loadMeta(); }, [filterProduct, filterOrphan]);

  async function onUpload(e) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr('');

    const fd = new FormData();
    fd.append('file', file);
    const productId = e.target.product_id.value;
    if (productId) fd.append('product_id', productId);
    const customName = e.target.custom_name.value.trim();
    if (customName) fd.append('alt_text', customName);

    // El api() helper soporta FormData y setea Authorization + CSRF.
    const r = await api('/api/admin/media', { method: 'POST', body: fd });
    setUploading(false);
    if (r.ok) {
      fileRef.current.value = '';
      e.target.custom_name.value = '';
      load();
    } else {
      setErr(r.data?.error || 'Error al subir');
    }
  }

  async function remove(m) {
    if (!confirm(`¿Eliminar este archivo?\n\nEl archivo queda en papelera 30 días antes de borrarse definitivamente.`)) return;
    const r = await api(`/api/admin/media/${m.id}`, { method: 'DELETE' });
    if (r.ok) load();
    else alert(r.data?.error || 'Error');
  }

  async function cleanup() {
    if (!confirm('¿Borrar definitivamente las huérfanas con más de 30 días en papelera?')) return;
    const r = await api('/api/admin/media/cleanup', { method: 'POST' });
    if (r.ok) {
      const { purged, freed_bytes } = r.data.data;
      alert(`Borradas: ${purged}\nLiberado: ${humanSize(freed_bytes)}`);
      load();
    } else alert(r.data?.error || 'Error');
  }

  function openEdit(m) {
    setEditing({ ...m });
  }
  function close() { setEditing(null); }

  async function saveEdit() {
    if (!editing) return;
    setPending(true);
    const body = {
      product_id: editing.product_id || null,
      alt_text: editing.alt_text,
      display_order: Number(editing.display_order) || 0,
    };
    const r = await api(`/api/admin/media/${editing.id}`, { method: 'PATCH', body });
    setPending(false);
    if (r.ok) { close(); load(); }
    else alert(r.data?.error || 'Error');
  }

  if (items === null) return <div style={{ padding: 40, color: 'var(--gray-500)' }}>Cargando…</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1>Media</h1>
          <p className="sub">{items.length} archivo{items.length === 1 ? '' : 's'}</p>
        </div>
        {canEdit && (
          <button className="btn secondary" onClick={cleanup} title="Borra huérfanas con más de 30 días en papelera">
            🗑️ Limpiar huérfanas
          </button>
        )}
      </div>

      {canEdit && (
      <form onSubmit={onUpload} className="upload-box">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, flexWrap: 'wrap' }}>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            required
            style={{ flex: 1, minWidth: 220 }}
          />
          <input
            name="custom_name"
            placeholder="Nombre personalizado (opcional)"
            maxLength={200}
            style={{ flex: 1, minWidth: 200 }}
          />
          <select name="product_id" style={{ maxWidth: 240 }}>
            <option value="">Sin asignar (huérfana)</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.collection_name} — {p.name}</option>
            ))}
          </select>
          <button type="submit" className="btn" disabled={uploading}>
            {uploading ? 'Subiendo…' : 'Subir'}
          </button>
        </div>
        <div className="form-hint" style={{ marginTop: 6 }}>
          Formatos: JPEG, PNG, WebP, AVIF. Tamaño máx: 20 MB. El nombre se usa para identificar la foto y como texto alternativo.
        </div>
      </form>
      )}

      <div className="filters">
        <select value={filterProduct} onChange={(e) => setFilterProduct(e.target.value)}>
          <option value="">Todos los productos</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.collection_name} — {p.name}</option>
          ))}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--gray-700)' }}>
          <input
            type="checkbox"
            checked={filterOrphan}
            onChange={(e) => setFilterOrphan(e.target.checked)}
            style={{ width: 'auto' }}
          />
          Solo huérfanas
        </label>
      </div>

      {err && <div className="placeholder-card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', marginBottom: 16 }}>{err}</div>}

      {items.length === 0 ? (
        <div className="placeholder-card">
          <h2>Sin archivos</h2>
          <p>Sube la primera imagen con el formulario de arriba.</p>
        </div>
      ) : (
        <div className="media-grid">
          {items.map((m) => (
            <div key={m.id} className="media-card">
              <div className="media-thumb">
                <MediaThumb url={m.url} alt={m.alt_text || m.product_name || 'media'} />
              </div>
              <div className="media-meta">
                <div className="media-product" title={m.alt_text || m.product_name || 'Huérfana'}>
                  {m.alt_text || m.product_name || '⚠️ Sin nombre (huérfana)'}
                </div>
                <div className="media-alt" title={m.product_name || ''}>
                  {m.product_name ? `Producto: ${m.product_name}` : '⚠️ Sin asignar a producto'}
                </div>
                <div className="media-size">{humanSize(m.size_bytes)}</div>
              </div>
              {canEdit && (
                <div className="media-actions">
                  <button className="row-btn" onClick={() => openEdit(m)}>Editar</button>
                  <button className="row-btn danger" onClick={() => remove(m)}>Eliminar</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={close}
        title="Editar media"
        size="md"
        footer={
          <>
            <button className="btn secondary" onClick={close} disabled={pending}>Cancelar</button>
            <button className="btn" onClick={saveEdit} disabled={pending}>Guardar</button>
          </>
        }
      >
        {editing && (
          <div className="form">
            <div>
              <label>Producto asignado</label>
              <select
                value={editing.product_id || ''}
                onChange={(e) => setEditing((p) => ({ ...p, product_id: e.target.value ? Number(e.target.value) : null }))}
              >
                <option value="">Sin asignar (huérfana)</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.collection_name} — {p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Texto alternativo (para accesibilidad)</label>
              <input
                value={editing.alt_text || ''}
                onChange={(e) => setEditing((p) => ({ ...p, alt_text: e.target.value }))}
                placeholder="Descripción de la imagen"
              />
            </div>
            <div>
              <label>Orden</label>
              <input
                type="number"
                value={editing.display_order || 0}
                onChange={(e) => setEditing((p) => ({ ...p, display_order: e.target.value }))}
              />
            </div>
            <div style={{ background: 'var(--gray-50)', padding: 12, borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>URL</div>
              <code style={{ fontSize: 12, wordBreak: 'break-all' }}>{editing.url}</code>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
