import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';
import CollectionCard from '../components/CollectionCard.jsx';
import { useMe } from '../hooks/useMe.js';
import { canWrite } from '../lib/permissions.js';

const empty = {
  name: '',
  slug: '',
  description: '',
  hero_image: '',
  accent_color: '#1a1d21',
  display_order: 0,
  active: true,
  show_in_nav: true,
  nav_label: '',
};

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export default function Collections({ view }) {
  const me = useMe();
  const canEdit = me ? canWrite('collections', me.role) : true; // antes del load, mostrar todo
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null);  // null | { ... }
  const [pending, setPending] = useState(false);

  // Estados para productos asociados (vista general)
  const [assocData, setAssocData] = useState({ associated: [], candidates: [] });
  const [assocErr, setAssocErr] = useState('');
  const [addingProdId, setAddingProdId] = useState('');

  async function loadCollectionProducts(colId) {
    setAssocErr('');
    const r = await api(`/api/admin/collections/${colId}/products`);
    if (r.ok) setAssocData(r.data.data);
    else setAssocErr(r.data?.error || 'Error al cargar productos');
  }

  async function load() {
    setErr('');
    const r = await api('/api/admin/collections');
    if (r.ok) setItems(r.data.data);
    else setErr(r.data?.error || 'Error al cargar');
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    setAssocData({ associated: [], candidates: [] });
    setEditing({ ...empty, display_order: items?.length || 0 });
  }
  function openEdit(c) {
    setAssocData({ associated: [], candidates: [] });
    setEditing({ ...c });
    if (view === 'general') {
      loadCollectionProducts(c.id);
    }
  }
  function close() {
    setEditing(null);
  }

  function updateField(k, v) {
    setEditing((prev) => {
      const next = { ...prev, [k]: v };
      // Auto-generar slug al cambiar name SOLO si es una colección nueva y el slug no fue tocado
      if (k === 'name' && !prev.id && (!prev.slug || prev.slug === slugify(prev.name))) {
        next.slug = slugify(v);
      }
      return next;
    });
  }

  async function save() {
    if (!editing) return;
    setPending(true);
    setErr('');
    const isNew = !editing.id;
    const body = {
      name: editing.name,
      slug: editing.slug || undefined,
      description: editing.description,
      hero_image: editing.hero_image || null,
      accent_color: editing.accent_color,
      display_order: Number(editing.display_order) || 0,
      active: !!editing.active,
      show_in_nav: !!editing.show_in_nav,
      nav_label: editing.nav_label || '',
    };
    const r = isNew
      ? await api('/api/admin/collections', { method: 'POST', body })
      : await api(`/api/admin/collections/${editing.id}`, { method: 'PATCH', body });
    setPending(false);
    if (r.ok) {
      close();
      load();
    } else {
      setErr(r.data?.message || r.data?.details?.join(', ') || r.data?.error || 'Error al guardar');
    }
  }

  async function remove() {
    const c = editing;
    if (!c?.id) return;
    setPending(true);
    setErr('');
    const r = await api(`/api/admin/collections/${c.id}`, { method: 'DELETE' });
    setPending(false);
    if (r.ok) {
      if (r.data?.confirm_required) {
        const ok = confirm(
          `${r.data.message}\n\n¿Estás seguro de que quieres continuar?`
        );
        if (ok) {
          setPending(true);
          const r2 = await api(`/api/admin/collections/${c.id}?confirm=true`, { method: 'DELETE' });
          setPending(false);
          if (r2.ok) {
            close();
            load();
          } else {
            setErr(r2.data?.message || r2.data?.error || 'Error al eliminar');
          }
        }
      } else {
        close();
        load();
      }
    } else {
      setErr(r.data?.message || r.data?.error || 'Error al eliminar');
    }
  }

  async function associateProduct() {
    if (!addingProdId) return;
    const r = await api(`/api/admin/collections/${editing.id}/products`, {
      method: 'POST',
      body: { product_id: Number(addingProdId) }
    });
    if (r.ok) {
      setAddingProdId('');
      loadCollectionProducts(editing.id);
    } else {
      alert(r.data?.message || r.data?.error || 'Error al asociar producto');
    }
  }

  async function deassociateProduct(prod) {
    if (!confirm(`¿Remover "${prod.name}" de esta colección?\n\nSi es su única colección y está publicado, se despublicará automáticamente.`)) return;
    const r = await api(`/api/admin/collections/${editing.id}/products/${prod.id}`, { method: 'DELETE' });
    if (r.ok) {
      loadCollectionProducts(editing.id);
    } else {
      alert(r.data?.message || r.data?.error || 'Error al remover producto');
    }
  }

  async function move(c, dir) {
    // dir = -1 (antes) o +1 (después). Intercambia la posición con el vecino
    // y renumera todo 0..n-1, así el orden nunca queda con huecos ni negativos.
    const sorted = [...items];
    const idx = sorted.findIndex((x) => x.id === c.id);
    const target = idx + dir;
    if (target < 0 || target >= sorted.length) return;
    [sorted[idx], sorted[target]] = [sorted[target], sorted[idx]];
    setItems(sorted);  // feedback inmediato; el load() de abajo confirma contra el server
    const changes = sorted
      .map((x, i) => ({ id: x.id, order: i, prev: Number(x.display_order) }))
      .filter((x) => x.order !== x.prev);
    await Promise.all(changes.map((x) =>
      api(`/api/admin/collections/${x.id}`, { method: 'PATCH', body: { display_order: x.order } }),
    ));
    load();
  }

  if (items === null) return <div style={{ padding: 40, color: 'var(--gray-500)' }}>Cargando…</div>;

  const visibleItems = items.filter((c) => !c.is_system);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1>{view === 'general' ? 'Colecciones (Gestión General)' : 'Colecciones'}</h1>
        <p className="sub">
          {view === 'general'
            ? 'Identidad y organización del catálogo'
            : 'Las secciones del catálogo visible en la tienda'} · {visibleItems.length} en total.
        </p>
      </div>

      {err && <div className="placeholder-card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', marginBottom: 16 }}>{err}</div>}

      <div className="coll-grid">
        {visibleItems.map((c, i) => (
          <CollectionCard
            key={c.id}
            collection={c}
            onEdit={openEdit}
            onMove={move}
            canMoveUp={i > 0}
            canMoveDown={i < visibleItems.length - 1}
            canEdit={canEdit}
          />
        ))}
        {canEdit && (
        <button type="button" className="coll-new" onClick={openNew}>
          <span className="coll-new-plus" aria-hidden="true">+</span>
          <span>Nueva colección</span>
        </button>
        )}
      </div>

      <Modal
        open={!!editing}
        onClose={close}
        title={editing?.id ? (view === 'general' ? `Editar "${editing.name}" (Identidad)` : `Editar "${editing.name}"`) : 'Nueva colección'}
        size={view === 'general' && editing?.id ? 'lg' : 'md'}
        footer={
          <>
            {editing?.id && (
              <div className="modal-footer-danger">
                {view !== 'general' && (
                  <button
                    className="row-btn"
                    onClick={() => updateField('active', !editing.active)}
                    disabled={pending}
                  >
                    {editing.active ? 'Ocultar' : 'Mostrar'}
                  </button>
                )}
                <button className="row-btn danger" onClick={remove} disabled={pending}>Eliminar</button>
              </div>
            )}
            <button className="btn secondary" onClick={close} disabled={pending}>Cancelar</button>
            <button className="btn" onClick={save} disabled={pending || !editing?.name?.trim()}>
              {pending ? 'Guardando…' : (editing?.id ? 'Guardar cambios' : 'Crear colección')}
            </button>
          </>
        }
      >
        {editing && (
          <div className="form">
            {editing.id && !editing.active && view !== 'general' && (
              <div className="form-hint" style={{ marginBottom: 12, color: 'var(--gold)' }}>
                Queda oculta: no se ve en la tienda. Se aplica al guardar.
              </div>
            )}
            <div className="form-row">
              <label>Nombre *</label>
              <input
                value={editing.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="Ej: Accesorios"
                autoFocus
              />
            </div>
            <div className="form-row">
              <label>Slug (URL)</label>
              <input
                value={editing.slug}
                onChange={(e) => updateField('slug', e.target.value)}
                placeholder="accesorios"
                disabled={!!editing.id}
              />
              <div className="form-hint">
                {editing.id
                  ? 'El slug identifica las URLs y no se cambia para proteger el posicionamiento (SEO).'
                  : 'Se genera solo a partir del nombre. Cámbialo solo si quieres algo distinto.'}
              </div>
            </div>

            {view !== 'general' && (
              <>
                <div className="form-row">
                  <label>Descripción</label>
                  <textarea
                    rows={2}
                    value={editing.description || ''}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="Una línea sobre la colección"
                  />
                </div>
                <div className="form-row">
                  <label>Imagen del header (opcional)</label>
                  <input
                    value={editing.hero_image || ''}
                    onChange={(e) => updateField('hero_image', e.target.value)}
                    placeholder="/media/2026/07/foto.jpg"
                  />
                  <div className="form-hint">
                    Súbela en Media y pega aquí su URL. Si la dejas vacía, la portada usa fotos de los productos de la colección.
                  </div>
                </div>
                <div className="form-row">
                  <label>Color de acento</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="color"
                      value={editing.accent_color || '#1a1d21'}
                      onChange={(e) => updateField('accent_color', e.target.value)}
                      style={{ width: 40, height: 36, padding: 2, cursor: 'pointer' }}
                    />
                    <input
                      type="text"
                      value={editing.accent_color || '#1a1d21'}
                      onChange={(e) => updateField('accent_color', e.target.value)}
                      style={{ flex: 1, fontFamily: 'monospace' }}
                    />
                  </div>
                </div>
                <div className="form-row" style={{ background: 'var(--gray-50)', padding: 12, borderRadius: 8 }}>
                  <div className="form-row-inline">
                    <label style={{ display: 'flex', alignItems: 'center', fontWeight: 'normal', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={!!editing.show_in_nav}
                        onChange={(e) => updateField('show_in_nav', e.target.checked)}
                        style={{ width: 'auto', marginRight: 8 }}
                      />
                      Mostrar en el menú de la tienda (barra superior)
                    </label>
                  </div>
                  {editing.show_in_nav && (
                    <div style={{ marginTop: 10 }}>
                      <label>Texto en el menú (opcional)</label>
                      <input
                        value={editing.nav_label || ''}
                        onChange={(e) => updateField('nav_label', e.target.value)}
                        placeholder={editing.name || 'Si lo dejas vacío, se usa el nombre'}
                        maxLength={40}
                      />
                      <div className="form-hint">Si lo dejas vacío, el menú muestra el nombre de la colección.</div>
                    </div>
                  )}
                </div>
              </>
            )}

            {editing.id && view === 'general' && (
              <div className="form-row" style={{ borderTop: '1px solid var(--gray-200)', paddingTop: 16, marginTop: 16 }}>
                <h3 style={{ fontSize: 14, marginBottom: 10, fontWeight: 600 }}>Productos en esta colección</h3>
                {assocErr && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>{assocErr}</div>}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <select
                    value={addingProdId}
                    onChange={(e) => setAddingProdId(e.target.value)}
                    style={{ flex: 1, padding: '6px 8px', borderRadius: 4, border: '1px solid var(--gray-300)' }}
                  >
                    <option value="">Asociar producto…</option>
                    {(assocData.candidates || []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.sku ? `(${p.sku})` : ''} {!p.published ? '[Borrador]' : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn"
                    onClick={associateProduct}
                    disabled={!addingProdId}
                    style={{ padding: '6px 12px' }}
                  >
                    Asociar
                  </button>
                </div>
                <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--gray-200)', borderRadius: 6 }}>
                  <table className="mini-table" style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                    <tbody>
                      {(assocData.associated || []).length === 0 ? (
                        <tr>
                          <td style={{ color: 'var(--gray-500)', textAlign: 'center', padding: 12 }}>
                            Sin productos en esta colección
                          </td>
                        </tr>
                      ) : (
                        (assocData.associated || []).map((p) => (
                          <tr key={p.id} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 500 }}>
                              {p.name}
                              {p.sku && <span className="prod-sku" style={{ marginLeft: 6, opacity: 0.7, fontFamily: 'monospace' }}>{p.sku}</span>}
                              {!p.published && <span className="badge off" style={{ marginLeft: 6 }}>Borrador</span>}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                              <button
                                type="button"
                                className="row-btn danger"
                                onClick={() => deassociateProduct(p)}
                                style={{ padding: '2px 8px', fontSize: 12 }}
                              >
                                Remover
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
