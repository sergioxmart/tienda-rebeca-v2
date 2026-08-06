// Productos (Gestión Tienda): la VITRINA del catálogo unificado. Acá se
// publica/despublica, se asigna colección, se cuida la descripción y las
// fotos, y se destaca. La sustancia (alta, precios, costo, stock, promos)
// vive en Gestión General → Inventario: es el mismo producto, otra faceta.

import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';
import ProductCard from '../components/ProductCard.jsx';
import ProductForm from '../components/ProductForm.jsx';
import { TYPES, productTypes } from '../lib/products.js';
import { useMe } from '../hooks/useMe.js';
import { canWrite } from '../lib/permissions.js';

export default function Products() {
  const me = useMe();
  const canEdit = me ? canWrite('products', me.role) : true;
  const [items, setItems] = useState(null);
  const [collections, setCollections] = useState([]);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null);
  const [pending, setPending] = useState(false);
  const [filterCol, setFilterCol] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterPublished, setFilterPublished] = useState('');
  const [onlyFeatured, setOnlyFeatured] = useState(false);
  const [search, setSearch] = useState('');

  async function load() {
    setErr('');
    const [prods, cols] = await Promise.all([
      api('/api/admin/products'),
      api('/api/admin/collections'),
    ]);
    if (prods.ok) setItems(prods.data.data); else setErr(prods.data?.error || 'Error al cargar');
    if (cols.ok) setCollections(cols.data.data);
  }
  useEffect(() => { load(); }, []);

  // Filtrado en el cliente: `listProducts` ya trae todo y el catálogo es de
  // decenas de productos. Si pasa de ~300 filas, mover al server con
  // `?q=&collection_id=&type=&published=`.
  const visible = useMemo(() => {
    if (!items) return null;
    return items.filter((p) => {
      if (filterCol && !(p.collection_ids || []).map(Number).includes(Number(filterCol))) return false;
      if (filterType && !productTypes(p).includes(filterType)) return false;
      if (filterPublished === 'published' && !p.published) return false;
      if (filterPublished === 'draft' && p.published) return false;
      if (onlyFeatured && !p.featured) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!p.name.toLowerCase().includes(q) &&
            !(p.sku || '').toLowerCase().includes(q) &&
            !(p.description || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [items, filterCol, filterType, filterPublished, onlyFeatured, search]);

  async function openEdit(p) {
    setErr('');
    // La grilla usa un resumen deliberadamente ligero. Para editar (y, en
    // especial, asignar fotos por color) necesitamos el detalle: incluye
    // use_colors y la lista de colores propios del producto.
    const r = await api(`/api/admin/products/${p.id}`);
    if (!r.ok) {
      setErr(r.data?.message || r.data?.error || 'No se pudo cargar el producto');
      return;
    }
    const item = r.data.data;
    setEditing({
      ...item,
      types: productTypes(item),
      collection_ids: item.collection_ids || [],
      sizes: item.sizes || [],
      colors: item.colors || [],
    });
  }
  function close() { setEditing(null); setErr(''); }

  async function save() {
    if (!editing) return;
    setPending(true);
    setErr('');
    // Solo la faceta vitrina: los precios, tipos, SKU y stock se editan en
    // Gestión General (la tienda refleja, nunca decide).
    const body = {
      collection_ids: editing.collection_ids ? editing.collection_ids.map(Number) : [],
      name: editing.name,
      description: editing.description,
      featured: !!editing.featured,
      display_order: Number(editing.display_order) || 0,
    };
    const r = await api(`/api/admin/products/${editing.id}`, { method: 'PATCH', body });
    setPending(false);
    if (r.ok) { close(); load(); }
    else setErr(r.data?.message || r.data?.details?.join(', ') || r.data?.error || 'Error al guardar');
  }

  // La estrella pinta al toque y confirma contra el server: es un click que se
  // hace en tanda sobre varias tarjetas, y esperar el fetch se siente lento.
  // Si el server la rechaza, vuelve a como estaba y lo dice.
  async function toggleFeatured(p) {
    const next = !p.featured;
    setItems((list) => list.map((x) => x.id === p.id ? { ...x, featured: next } : x));
    const r = await api(`/api/admin/products/${p.id}`, { method: 'PATCH', body: { featured: next } });
    if (!r.ok) {
      setItems((list) => list.map((x) => x.id === p.id ? { ...x, featured: !next } : x));
      setErr(r.data?.message || r.data?.error || 'No se pudo cambiar el destacado');
    }
  }

  // Publicar exige colección (gate del server). Despublicar conserva todos los
  // datos de vitrina: republicar deja el producto igual que antes.
  async function togglePublished() {
    const p = editing;
    if (!p?.id) return;
    setPending(true);
    const body = { published: !p.published };
    // Si está por publicar y eligió colección en el form, mandarla junto:
    // así el gate no rebota por una colección todavía no guardada.
    if (!p.published && p.collection_ids && p.collection_ids.length > 0) {
      body.collection_ids = p.collection_ids.map(Number);
    }
    const r = await api(`/api/admin/products/${p.id}`, { method: 'PATCH', body });
    setPending(false);
    if (r.ok) { close(); load(); }
    else if (r.data?.error === 'collection_required') {
      setErr('Para publicar, primero elige una colección y guarda.');
    } else {
      setErr(r.data?.message || r.data?.error || 'Error');
    }
  }

  async function remove() {
    const p = editing;
    if (!p?.id) return;
    if (!confirm(`¿Eliminar "${p.name}"?\n\nSi tiene reservas activas no se va a poder hasta cerrarlas.`)) return;
    setPending(true);
    const r = await api(`/api/admin/products/${p.id}`, { method: 'DELETE' });
    setPending(false);
    if (r.ok) { close(); load(); }
    else setErr(r.data?.message || r.data?.error || 'Error');
  }

  if (items === null) return <div style={{ padding: 40, color: 'var(--gray-500)' }}>Cargando…</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1>Productos</h1>
          <p className="sub">
            {items.length} en total · {items.filter(p => p.published).length} publicados · precios en COP
            {' '}· el alta y los precios viven en Gestión General → Inventario
          </p>
        </div>
      </div>

      <div className="filters">
        <input
          placeholder="Buscar por nombre, SKU o descripción…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <select value={filterCol} onChange={(e) => setFilterCol(e.target.value)}>
          <option value="">Todas las colecciones</option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">Todos los tipos</option>
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <select value={filterPublished} onChange={(e) => setFilterPublished(e.target.value)}>
          <option value="">Publicados y no publicados</option>
          <option value="published">Solo publicados</option>
          <option value="draft">Solo no publicados</option>
        </select>
        <label className="filter-check">
          <input
            type="checkbox"
            checked={onlyFeatured}
            onChange={(e) => setOnlyFeatured(e.target.checked)}
          />
          Solo destacados
        </label>
      </div>

      {err && !editing && <div className="placeholder-card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', marginBottom: 16 }}>{err}</div>}

      {visible?.length === 0 ? (
        <div className="placeholder-card" style={{ textAlign: 'center', color: 'var(--gray-500)', padding: 40 }}>
          Sin resultados.
        </div>
      ) : (
        <div className="prod-grid">
          {visible?.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              onEdit={openEdit}
              canEdit={canEdit}
              onToggleFeatured={toggleFeatured}
            />
          ))}
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={close}
        title={editing?.id ? `Editar "${editing.name || ''}"` : ''}
        size="lg"
        footer={
          canEdit ? (
            <>
              {editing?.id && (
                <div className="modal-footer-danger">
                  <button className="row-btn" onClick={togglePublished} disabled={pending}>
                    {editing.published ? 'Despublicar' : 'Publicar'}
                  </button>
                  <button className="row-btn danger" onClick={remove} disabled={pending}>Eliminar</button>
                </div>
              )}
              <button className="btn secondary" onClick={close} disabled={pending}>Cerrar</button>
              <button className="btn" onClick={save} disabled={pending || !editing?.name?.trim()}>
                {pending ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </>
          ) : (
            <button className="btn secondary" onClick={close}>Cerrar</button>
          )
        }
      >
        <ProductForm
          editing={editing}
          setEditing={setEditing}
          collections={collections}
          err={err}
        />
      </Modal>
    </div>
  );
}
