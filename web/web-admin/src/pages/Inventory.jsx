// Inventario (Gestión General): desde la fusión opera el catálogo UNIFICADO
// (`products`). Acá vive la sustancia del producto: alta, precios (venta,
// alquiler y costo — la tienda solo refleja), stock y promos. Publicar es
// decisión de Gestión Tienda; acá el estado se muestra, no se toca.
//
// Regla del libro mayor: el stock NUNCA se edita en el form. Se carga al crear
// (movimiento 'compra') y después solo se mueve por el panel de ajuste
// (movimiento 'ajuste' con nota obligatoria) o por una venta.
//
// Las categorías del inventario viejo ya no aplican: la Fase 3 del plan de
// unificación trae las Colecciones como única taxonomía.

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';
import { money } from '../lib/format.js';
import { TYPES } from '../lib/products.js';
import { useMe } from '../hooks/useMe.js';
import { canWrite } from '../lib/permissions.js';

const emptyItem = {
  sku: '',
  name: '',
  description: '',
  size_system_id: null,
  use_colors: false,
  color_system_id: null,
  color_ids: [],
  cost_price: 0,
  price: 0,
  rental_price: 0,
  rental_new_price: 0,
  types: ['venta'],
  sizes: [],
  colors: [],
  initial_variants: [],
};

function hydrateColorIds(item) {
  return {
    ...item,
    // El endpoint devuelve los colores completos para dibujar chips; el form
    // además necesita el array liviano que envía al PATCH.
    color_ids: item.color_ids ?? (item.colors || []).map((color) => color.id),
  };
}

function promoFinal(item) {
  if (!item.promo) return null;
  const p = Number(item.price) || 0;
  const v = Number(item.promo.value) || 0;
  const d = item.promo.kind === 'percent' ? (p * v) / 100 : v;
  return Math.max(p - d, 0);
}

export default function Inventory() {
  const me = useMe();
  const canEdit = me ? canWrite('inventory', me.role) : true;
  const [items, setItems] = useState(null);
  const [systems, setSystems] = useState([]);
  const [colorSystems, setColorSystems] = useState([]);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const [filterPublished, setFilterPublished] = useState('');
  const [editing, setEditing] = useState(null);
  const [pending, setPending] = useState(false);

  async function loadItems({ q = search, pub = filterPublished } = {}) {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (pub) params.set('published', pub);
    const r = await api(`/api/admin/inventory/items?${params}`);
    if (r.ok) setItems(r.data.data);
    else setErr(r.data?.error || 'Error al cargar');
  }

  useEffect(() => {
    api('/api/admin/size-systems').then((r) => r.ok && setSystems(r.data.data));
    api('/api/admin/color-systems').then((r) => r.ok && setColorSystems(r.data.data));
    loadItems();
  }, []);

  // Buscador con debounce: el filtrado es server-side y no queremos un
  // request por tecla.
  const debounceRef = useRef(null);
  function onSearch(q) {
    setSearch(q);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadItems({ q }), 300);
  }
  function onFilterPublished(v) { setFilterPublished(v); loadItems({ pub: v }); }

  function openNew() {
    setErr('');
    // Default: el primer sistema (Ropa). "Sin tallas" se elige a mano.
    setEditing({ ...emptyItem, size_system_id: systems[0]?.id ?? null });
  }

  async function openEdit(row) {
    setErr('');
    const r = await api(`/api/admin/inventory/items/${row.id}`);
    if (r.ok) setEditing(hydrateColorIds(r.data.data));
    else setErr(r.data?.error || 'Error al cargar el producto');
  }

  function close() { setEditing(null); setErr(''); }

  async function refreshEditing(id) {
    const r = await api(`/api/admin/inventory/items/${id}`);
    if (r.ok) setEditing(hydrateColorIds(r.data.data));
    loadItems();
  }

  async function save() {
    if (!editing) return;
    setPending(true);
    setErr('');
    const isNew = !editing.id;
    // La activación de colores migra stock entre tablas y no puede ir por
    // PATCH. Con stock 0 se activa directo; con stock previo, ItemForm abre el
    // reparto obligatorio y este botón solo explica el siguiente paso.
    if (!isNew && editing._activateColors) {
      const totalStock = (editing.sizes || []).reduce((sum, s) => sum + Number(s.stock || 0), 0);
      if (totalStock > 0) {
        setErr('Repartí el stock actual entre los colores antes de guardar.');
        setPending(false);
        return;
      }
      if (!editing.color_system_id || !(editing.color_ids || []).length) {
        setErr('Elegí un sistema y al menos un color antes de activar variantes por color.');
        setPending(false);
        return;
      }
      setPending(true);
      const distribution = (editing.sizes || []).flatMap((s) => (editing.color_ids || []).map((colorId) => ({
        color_id: colorId, size_id: s.size_id ?? null, stock: 0,
      })));
      const r = await api(`/api/admin/inventory/items/${editing.id}/colors/activate`, {
        method: 'POST', body: { color_system_id: editing.color_system_id, color_ids: editing.color_ids, distribution },
      });
      setPending(false);
      if (r.ok) { close(); loadItems(); }
      else setErr(r.data?.message || r.data?.details?.join(', ') || r.data?.error || 'Error al activar colores');
      return;
    }
    const body = {
      sku: editing.sku || undefined,
      name: editing.name,
      description: editing.description,
      size_system_id: editing.size_system_id || null,
      cost_price: Number(editing.cost_price) || 0,
      price: Number(editing.price) || 0,
      rental_price: Number(editing.rental_price) || 0,
      rental_new_price: Number(editing.rental_new_price) || 0,
      types: (editing.types || []).length ? editing.types : ['venta'],
    };
    if (isNew) {
      // En alta todavía no hay stock previo: puede declararse el modo de
      // colores junto con el producto. En edición, el cambio de modo va por
      // /colors/activate o /colors/deactivate para migrar stock seguro.
      body.use_colors = !!editing.use_colors;
      body.color_system_id = editing.use_colors ? (editing.color_system_id || null) : null;
      body.color_ids = editing.use_colors ? (editing.color_ids || []) : [];
      body.initial_variants = editing.use_colors ? (editing.initial_variants || []) : [];
      // Solo las tallas tildadas viajan; una tildada con stock 0 existe
      // (se ve "agotada"), una destildada no aplica al producto.
      body.sizes = (editing.sizes || []).map((s) => ({ size_id: s.size_id ?? null, stock: Number(s.stock) || 0 }));
    } else if (editing.use_colors) {
      // Cambiar la selección de colores de un producto que ya los maneja sí
      // es un PATCH válido; el modo y el sistema quedan protegidos.
      body.color_ids = editing.color_ids || [];
    }
    const r = isNew
      ? await api('/api/admin/inventory/items', { method: 'POST', body })
      : await api(`/api/admin/inventory/items/${editing.id}`, { method: 'PATCH', body });
    setPending(false);
    if (r.ok) { close(); loadItems(); }
    else setErr(r.data?.message || r.data?.details?.join(', ') || r.data?.error || 'Error al guardar');
  }

  async function remove() {
    const it = editing;
    if (!it?.id) return;
    if (!confirm(`¿Eliminar "${it.name}"?\n\nEs el mismo producto de la tienda: desaparece de todos lados. Si tiene reservas activas no se va a poder hasta cerrarlas.`)) return;
    setPending(true);
    const r = await api(`/api/admin/inventory/items/${it.id}`, { method: 'DELETE' });
    setPending(false);
    if (r.ok) { close(); loadItems(); }
    else setErr(r.data?.message || r.data?.error || 'Error');
  }

  const totalStock = useMemo(
    () => (items || []).reduce((acc, i) => acc + (Number(i.stock_total) || 0), 0),
    [items],
  );

  if (items === null) return <div style={{ padding: 40, color: 'var(--gray-500)' }}>Cargando…</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1>Inventario</h1>
          <p className="sub">{items.length} producto(s) · {totalStock} unidades en stock · precios en COP</p>
        </div>
        {canEdit && <button className="btn" onClick={openNew}>+ Nuevo producto</button>}
      </div>

      <div className="filters">
        <input
          placeholder="Buscar por nombre o SKU…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <select value={filterPublished} onChange={(e) => onFilterPublished(e.target.value)}>
          <option value="">Publicados y no publicados</option>
          <option value="true">Solo publicados</option>
          <option value="false">Solo no publicados</option>
        </select>
      </div>

      {err && !editing && <div className="placeholder-card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', marginBottom: 16 }}>{err}</div>}

      {items.length === 0 ? (
        <div className="placeholder-card" style={{ textAlign: 'center', color: 'var(--gray-500)', padding: 40 }}>
          Sin resultados.
        </div>
      ) : (
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>SKU</th>
                <th>Costo</th>
                <th>Precio</th>
                <th>Stock</th>
                <th>Utilidad</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const final = promoFinal(it);
                return (
                  <tr key={it.id}>
                    <td style={{ fontWeight: 500 }}>{it.name}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{it.sku || '—'}</td>
                    <td>{money(it.cost_price)}</td>
                    <td>
                      {final === null ? money(it.price) : (
                        <span title={`Promo hasta ${it.promo.ends_at}`}>
                          <s style={{ color: 'var(--gray-500)' }}>{money(it.price)}</s>{' '}
                          <strong>{money(final)}</strong>
                        </span>
                      )}
                    </td>
                    <td>
                      {it.stock_total}
                      {(it.sizes || []).some((s) => s.label) && (
                        <span style={{ color: 'var(--gray-500)', fontSize: 12 }}>
                          {' '}({it.sizes.filter((s) => s.label).map((s) => `${s.label}:${s.stock}`).join(' ')})
                        </span>
                      )}
                    </td>
                    <td>{money((Number(final ?? it.price)) - Number(it.cost_price))}</td>
                    <td>
                      <span className={`badge ${it.published ? 'ok' : 'off'}`}>
                        {it.published ? 'Publicado' : 'No publicado'}
                      </span>
                      {Number(it.stock_total) === 0 && (
                        <span className="badge off" style={{ marginLeft: 4 }}>Agotado</span>
                      )}
                      {final !== null && (
                        <span className="badge ok" style={{ marginLeft: 4 }}>Promo</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {canEdit && <button className="row-btn" onClick={() => openEdit(it)}>Editar</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={close}
        title={editing?.id ? `Editar "${editing.name || ''}"` : 'Nuevo producto'}
        size="lg"
        footer={
          canEdit ? (
            <>
              {editing?.id && (
                <div className="modal-footer-danger">
                  <button className="row-btn danger" onClick={remove} disabled={pending}>Eliminar</button>
                </div>
              )}
              <button className="btn secondary" onClick={close} disabled={pending}>
                {editing?.id ? 'Cerrar' : 'Cancelar'}
              </button>
              <button className="btn" onClick={save} disabled={pending || !editing?.name?.trim()}>
                {pending ? 'Guardando…' : (editing?.id ? 'Guardar cambios' : 'Crear producto')}
              </button>
            </>
          ) : (
            <button className="btn secondary" onClick={close}>Cerrar</button>
          )
        }
      >
        {editing && (
          <ItemForm
            editing={editing}
            setEditing={setEditing}
            systems={systems}
            colorSystems={colorSystems}
            err={err}
            canEdit={canEdit}
            onAdjusted={() => refreshEditing(editing.id)}
          />
        )}
      </Modal>
    </div>
  );
}

function ItemForm({ editing, setEditing, systems, colorSystems, err, onAdjusted, canEdit }) {
  // El sistema del producto y sus tallas (para la grilla de alta y el ajuste).
  const system = useMemo(
    () => systems.find((s) => s.id === Number(editing.size_system_id)) || null,
    [systems, editing.size_system_id],
  );
  const systemSizes = system?.sizes || [];

  // Sistema de colores del producto (Fase 2 de colores). Si use_colors=false
  // y color_system_id es null, queda sin mostrar. El catálogo de colores
  // disponibles se filtra por el sistema elegido.
  const colorSystem = useMemo(
    () => colorSystems.find((s) => s.id === Number(editing.color_system_id)) || null,
    [colorSystems, editing.color_system_id],
  );
  const availableColors = colorSystem?.colors || [];

  // Modal de reparto (Fase 3). Se abre cuando el user tilda "maneja colores"
  // en un producto con stock preexistente, o cuando lo destilda (desactivar
  // y mergear). El modal vive en el ItemForm (no en el padre) para tener
  // acceso a setEditing y onAdjusted.
  const [repartoOpen, setRepartoOpen] = useState(false);
  const [desactivarOpen, setDesactivarOpen] = useState(false);
  const [repartoData, setRepartoData] = useState(null); // { sizes, colorIds, currentBySize }
  const [repartoError, setRepartoError] = useState('');
  const [repartoPending, setRepartoPending] = useState(false);

  function openReparto() {
    const colorIds = editing.color_ids || [];
    if (!editing.color_system_id || !colorIds.length) {
      setRepartoError('Elegí un sistema y al menos un color antes de repartir el stock.');
      return;
    }
    setRepartoData({
      sizes: (editing.sizes || []).map((s) => ({ size_id: s.size_id ?? null, label: s.label ?? 'Única', currentStock: Number(s.stock || 0) })),
      colorIds,
    });
    setRepartoError('');
    setRepartoOpen(true);
  }

  async function toggleProductColor(color) {
    const assigned = (editing.colors || []).find((item) => item.id === color.id);
    if (!assigned) {
      alert('Agregar un color con stock se hace desde el asistente de migración para no inventar existencias.');
      return;
    }
    const r = await api(`/api/admin/inventory/items/${editing.id}/colors/${color.id}`, {
      method: 'PATCH', body: { active: !assigned.active },
    });
    if (r.ok) {
      setEditing(hydrateColorIds(r.data));
      onAdjusted && onAdjusted();
    } else alert(r.data?.message || r.data?.details?.join(', ') || r.data?.error || 'No se pudo actualizar el color');
  }

  function updateField(k, v) { setEditing((p) => ({ ...p, [k]: v })); }

  function toggleType(t) {
    setEditing((p) => {
      const types = p.types || ['venta'];
      const has = types.includes(t);
      if (has && types.length === 1) return p; // siempre al menos un tipo
      return { ...p, types: has ? types.filter((x) => x !== t) : [...types, t] };
    });
  }

  // En un producto ya creado el sistema solo se puede cambiar con el stock en
  // 0 (lo exige el server); acá solo avisamos para no llegar al 409 a ciegas.
  function changeSystem(value) {
    const next = value === '' ? null : Number(value);
    if (next === (editing.size_system_id ?? null)) return;
    if (editing.id) {
      const withStock = editing.use_colors
        ? (editing.variants || []).filter((variant) => Number(variant.stock) > 0).length
        : (editing.sizes || []).filter((s) => Number(s.stock) > 0).length;
      if (withStock > 0) {
        alert('Tiene stock cargado. Cambiar el sistema de tallas requiere repartirlo explícitamente entre las nuevas tallas.');
        return;
      }
    } else if ((editing.sizes || []).length > 0 && !window.confirm(
      'Cambiar el sistema descarta las tallas y el stock cargados. ¿Continuar?',
    )) return;
    setEditing((p) => ({ ...p, size_system_id: next, sizes: [] }));
  }

  // Tildar una talla = el producto la tiene (aunque el stock sea 0: se ve
  // "agotada"). Destildar = no aplica a este producto (evita agotado falso).
  function toggleSize(sizeId) {
    setEditing((p) => {
      const has = (p.sizes || []).some((s) => s.size_id === sizeId);
      return has
        ? { ...p, sizes: p.sizes.filter((s) => s.size_id !== sizeId) }
        : { ...p, sizes: [...(p.sizes || []), { size_id: sizeId, stock: 0 }] };
    });
  }

  function setSizeStock(sizeId, stock) {
    setEditing((p) => ({
      ...p,
      sizes: (p.sizes || []).map((s) => s.size_id === sizeId ? { ...s, stock } : s),
    }));
  }

  function sizeEntry(sizeId) {
    return (editing.sizes || []).find((x) => x.size_id === sizeId) || null;
  }

  // "Sin tallas": un único compartimento de stock (size_id null).
  function setSingleStock(stock) {
    setEditing((p) => ({ ...p, sizes: [{ size_id: null, stock }] }));
  }

  const types = editing.types || ['venta'];
  const utilidad = (Number(editing.price) || 0) - (Number(editing.cost_price) || 0);

  return (
    <div className="form">
      {err && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</div>}

      {editing.id && (
        <div className="form-hint" style={{ marginBottom: 4 }}>
          Estado:{' '}
          <span className={`badge ${editing.published ? 'ok' : 'off'}`}>
            {editing.published ? 'Publicado en la tienda' : 'No publicado'}
          </span>
          {' '}· Publicar y despublicar se hace desde Gestión Tienda → Productos.
        </div>
      )}

      <div className="form-row-grid">
        <div>
          <label>Nombre *</label>
          <input
            value={editing.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="Ej: Vestido Aurora"
            autoFocus={!editing.id}
          />
        </div>
        <div>
          <label>SKU (opcional)</label>
          <input
            value={editing.sku || ''}
            onChange={(e) => updateField('sku', e.target.value)}
            placeholder="INV-001"
            style={{ fontFamily: 'monospace' }}
          />
        </div>
      </div>

      <div className="form-row">
        <label>Descripción</label>
        <textarea
          rows={2}
          value={editing.description || ''}
          onChange={(e) => updateField('description', e.target.value)}
        />
      </div>

      <div className="form-row">
        <label>Tipos de oferta * <span className="form-hint" style={{ fontWeight: 400 }}>(cada uno con su precio en COP; la tienda solo refleja)</span></label>
        <div className="type-price-list">
          {TYPES.map((t) => {
            const on = types.includes(t.value);
            return (
              <div key={t.value} className={`type-price-row ${on ? 'on' : ''}`}>
                <label className="type-price-check">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleType(t.value)}
                    style={{ width: 'auto' }}
                  />
                  <span>{t.label}</span>
                </label>
                {on && (
                  <div className="type-price-input">
                    <span className="type-price-currency">$</span>
                    <input
                      type="number" step="1000" min="0"
                      value={editing[t.priceKey]}
                      onChange={(e) => updateField(t.priceKey, e.target.value)}
                      placeholder="0"
                    />
                    <span className="form-hint" style={{ whiteSpace: 'nowrap' }}>COP</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="form-row-grid">
        <div>
          <label>Costo (COP)</label>
          <input
            type="number" step="1000" min="0"
            value={editing.cost_price}
            onChange={(e) => updateField('cost_price', e.target.value)}
          />
        </div>
        <div>
          <label>Sistema de tallas</label>
          <select value={editing.size_system_id ?? ''} onChange={(e) => changeSystem(e.target.value)}>
            <option value="">Sin tallas (un solo stock)</option>
            {systems.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <div className="form-hint">
            Los sistemas se gestionan en <strong>Ajustes</strong> (arriba a la derecha del Home).
          </div>
        </div>
      </div>

      <div className="form-row">
        <label>
          <input
            type="checkbox"
            checked={!!editing.use_colors}
            onChange={(e) => {
              const next = e.target.checked;
              // Al activar en un producto existente, primero mostramos el
              // catálogo para elegir sistema y colores. Después el reparto
              // (si había stock) migra las tablas atómicamente.
              if (next && editing.id) {
                setEditing((p) => ({
                  ...p,
                  use_colors: true,
                  _activateColors: true,
                  color_system_id: p.color_system_id || (colorSystems[0]?.id ?? null),
                  color_ids: p.color_ids || [],
                }));
                return;
              }
              // Desactivar colores: si el producto ya existe y tiene
              // variantes con stock, abrimos el modal de merge.
              if (!next && editing.id && editing.use_colors && !editing._activateColors) {
                setDesactivarOpen(true);
                return;
              }
              // Alta nueva o toggle simple: ok.
              setEditing((p) => ({
                ...p,
                use_colors: next,
                _activateColors: false,
                color_system_id: next ? (p.color_system_id || (colorSystems[0]?.id ?? null)) : null,
                color_ids: next ? (p.color_ids || []) : [],
              }));
            }}
            style={{ width: 'auto', marginRight: 6 }}
          />
          Maneja variantes por color
          <span className="form-hint" style={{ fontWeight: 400, marginLeft: 6 }}>
            (opcional — fotos y stock se vuelven por color)
          </span>
        </label>
        {editing.use_colors && (
          <div style={{ marginTop: 8, display: 'grid', gap: 8, paddingLeft: 24 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4 }}>Sistema de colores</label>
              <select
                value={editing.color_system_id ?? ''}
                onChange={(e) => {
                  const next = e.target.value === '' ? null : Number(e.target.value);
                  if (editing.id && !editing._activateColors && next !== editing.color_system_id) {
                    alert('Cambiar el sistema de colores requiere repartir el stock actual entre los colores del nuevo sistema.');
                    return;
                  }
                  setEditing((p) => ({ ...p, color_system_id: next, color_ids: [] }));
                }}
              >
                <option value="">Selecciona un sistema…</option>
                {colorSystems.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <div className="form-hint">
                Los sistemas se gestionan en <strong>Ajustes → Sistemas de colores</strong>.
              </div>
            </div>
            {colorSystem && (
              <div>
                <label style={{ display: 'block', marginBottom: 4 }}>Colores disponibles</label>
                {availableColors.length === 0 ? (
                  <div className="form-hint">
                    El sistema "{colorSystem.name}" no tiene colores todavía.
                    Crealos en <strong>Ajustes → Sistemas de colores</strong>.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {availableColors.map((c) => {
                      const assigned = (editing.colors || []).find((item) => item.id === c.id);
                      const on = (editing.color_ids || []).includes(c.id);
                      const paused = !!assigned && !assigned.active;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          title={editing.id && !editing._activateColors ? (paused ? 'Reactivar color' : 'Pausar color') : undefined}
                          onClick={() => {
                            if (editing.id && !editing._activateColors) return toggleProductColor(c);
                            setEditing((p) => {
                              const ids = p.color_ids || [];
                              return { ...p, color_ids: on ? ids.filter((x) => x !== c.id) : [...ids, c.id] };
                            });
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 10px',
                            border: on ? '1.5px solid var(--accent)' : '1px solid var(--gray-300)',
                            background: on ? 'var(--gold-soft)' : 'white',
                            opacity: paused ? .55 : 1,
                            borderRadius: 14,
                            cursor: 'pointer',
                            fontSize: 13,
                          }}
                        >
                          <span
                            style={{
                              width: 12, height: 12, borderRadius: '50%',
                              background: c.hex || 'transparent',
                              border: '1px solid var(--gray-300)',
                              display: 'inline-block',
                            }}
                          />
                          {c.label}
                          {paused && ' · Pausado'}
                        </button>
                      );
                    })}
                  </div>
                )}
                {editing.id && (editing.color_ids || []).length > 0 && (
                  <div className="form-hint" style={{ marginTop: 6 }}>
                    {(editing.color_ids || []).length} color(es) elegido(s). El
                    stock se gestiona abajo por variante (color × talla).
                    {!editing._activateColors && ' Pulsa un color para pausarlo o reactivarlo; pausar conserva su stock.'}
                  </div>
                )}
                {editing.id && editing._activateColors && (editing.sizes || []).some((s) => Number(s.stock) > 0) && (
                  <div style={{ marginTop: 8 }}>
                    <button type="button" className="btn secondary" onClick={openReparto}>Repartir stock y activar colores</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="form-hint">
        Utilidad unitaria (venta): <strong>{money(utilidad)}</strong> (precio − costo).
      </div>

      {editing.id ? (
        <>
          <PromoPanel editing={editing} onChanged={onAdjusted} canEdit={canEdit} />
          <AdjustPanel editing={editing} systemSizes={systemSizes} onAdjusted={onAdjusted} canEdit={canEdit} />
        </>
      ) : (
        <InitialStockMatrix
          editing={editing}
          setEditing={setEditing}
          systemSizes={systemSizes}
          selectedColors={availableColors.filter((color) => (editing.color_ids || []).includes(color.id))}
          toggleSize={toggleSize}
          sizeEntry={sizeEntry}
        />
      )}

      {/* Modal de reparto: aparece cuando se activa colores en un producto
          con stock preexistente. La suma por fila debe cuadrar con el stock
          actual de la talla. */}
      <RepartoModal
        open={repartoOpen}
        onClose={() => setRepartoOpen(false)}
        data={repartoData}
        editing={editing}
        setEditing={setEditing}
        colorsById={Object.fromEntries((colorSystem?.colors || []).map((c) => [c.id, c]))}
        sizesById={Object.fromEntries((systemSizes || []).map((s) => [s.id, s]))}
        err={repartoError}
        setErr={setRepartoError}
        pending={repartoPending}
        setPending={setRepartoPending}
        onAdjusted={onAdjusted}
      />

      {/* Modal de desactivación: aparece al destildar "maneja colores" en
          un producto con variantes. Pregunta cómo mergear. */}
      <DesactivarColoresModal
        open={desactivarOpen}
        onClose={() => setDesactivarOpen(false)}
        editing={editing}
        setEditing={setEditing}
        onAdjusted={onAdjusted}
      />
    </div>
  );
}

// Alta de producto: usa la misma lectura de matriz que el ajuste posterior,
// pero el primer ingreso crea las existencias y sus movimientos de compra.
// Una talla sin marcar no pertenece al producto; una marcada con 0 queda
// visible como agotada cuando aplique.
function InitialStockMatrix({ editing, setEditing, systemSizes, selectedColors, toggleSize, sizeEntry }) {
  const useColors = !!editing.use_colors;
  const rows = systemSizes.length
    ? systemSizes.map((size) => ({ size_id: size.id, label: size.label, selected: !!sizeEntry(size.id) }))
    : [{ size_id: null, label: 'Única', selected: true }];
  const columns = useColors ? selectedColors : [{ id: null, label: 'Existencias', hex: null }];

  function setSizeStock(sizeId, stock) {
    setEditing((p) => ({
      ...p,
      sizes: (p.sizes || []).some((size) => size.size_id === sizeId)
        ? p.sizes.map((size) => size.size_id === sizeId ? { ...size, stock } : size)
        : [...(p.sizes || []), { size_id: sizeId, stock }],
    }));
  }

  function setVariantStock(colorId, sizeId, stock) {
    setEditing((p) => {
      const key = `${colorId}|${sizeId ?? 'null'}`;
      const rest = (p.initial_variants || []).filter((cell) => `${cell.color_id}|${cell.size_id ?? 'null'}` !== key);
      return { ...p, initial_variants: [...rest, { color_id: colorId, size_id: sizeId, stock }] };
    });
  }

  function valueFor(colorId, sizeId) {
    if (!useColors) return sizeEntry(sizeId)?.stock ?? 0;
    return (editing.initial_variants || []).find((cell) => Number(cell.color_id) === Number(colorId) && (cell.size_id ?? null) === (sizeId ?? null))?.stock ?? 0;
  }

  const total = rows.reduce((sum, row) => row.selected
    ? sum + columns.reduce((subtotal, color) => subtotal + Number(valueFor(color.id, row.size_id) || 0), 0)
    : sum, 0);

  return (
    <div className="form-row">
      <label>Matriz de inventario inicial <span className="form-hint" style={{ fontWeight: 400 }}>· {useColors ? 'talla × color' : 'solo tallas'}</span></label>
      {!columns.length ? (
        <div className="form-hint">Elegí al menos un color para cargar el inventario inicial por variante.</div>
      ) : (
        <div className={`inventory-matrix ${useColors ? '' : 'sizes-only'}`} style={{ '--matrix-columns': columns.length }}>
          <div className="inventory-matrix-cell head">Talla</div>
          {columns.map((color) => <div key={color.id ?? 'stock'} className="inventory-matrix-cell head">{color.hex && <span className="color-swatch" style={{ background: color.hex }} />}{color.label}</div>)}
          {useColors && <div className="inventory-matrix-cell head">Total</div>}
          {rows.map((row) => {
            const rowTotal = columns.reduce((sum, color) => sum + Number(valueFor(color.id, row.size_id) || 0), 0);
            return <Fragment key={row.size_id ?? 'null'}>
              <div className="inventory-matrix-cell row-label">
                {systemSizes.length ? <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}><input type="checkbox" checked={row.selected} onChange={() => toggleSize(row.size_id)} style={{ width: 'auto' }} />{row.label}</label> : row.label}
              </div>
              {columns.map((color) => {
                const value = valueFor(color.id, row.size_id);
                const change = (next) => useColors
                  ? setVariantStock(color.id, row.size_id, Math.max(0, Number.parseInt(next, 10) || 0))
                  : setSizeStock(row.size_id, Math.max(0, Number.parseInt(next, 10) || 0));
                return <div className="inventory-matrix-cell" key={`${color.id}|${row.size_id ?? 'null'}`}>
                  <button type="button" className="matrix-step" onClick={() => change(Number(value) - 1)} disabled={!row.selected || Number(value) <= 0}>−</button>
                  <input type="number" min="0" value={value} disabled={!row.selected} onChange={(e) => change(e.target.value)} />
                  <button type="button" className="matrix-step" onClick={() => change(Number(value) + 1)} disabled={!row.selected}>+</button>
                </div>;
              })}
              {useColors && <div className="inventory-matrix-cell total">{row.selected ? rowTotal : '—'}</div>}
            </Fragment>;
          })}
        </div>
      )}
      <div className="form-hint">Marca las tallas que aplican. El total inicial es <strong>{total}</strong> unidad(es) y queda registrado como compra.</div>
    </div>
  );
}

// ============================================================================
// RepartoModal: matriz tallas x colores. La suma por fila debe coincidir con
// el stock actual de la talla. Boton "Activar y repartir" deshabilitado hasta
// que cuadre. Al confirmar, POST /colors/activate.
// ============================================================================
function RepartoModal({ open, onClose, data, editing, setEditing, colorsById, sizesById, err, setErr, pending, setPending, onAdjusted }) {
  const [matrix, setMatrix] = useState({}); // key: `${color_id}|${size_id ?? 'null'}` -> string

  useEffect(() => {
    if (!open || !data) return;
    // Inicializar la matriz con 0 en cada celda. Rebeca la edita.
    const m = {};
    for (const cid of data.colorIds) {
      for (const s of data.sizes) {
        m[`${cid}|${s.size_id ?? 'null'}`] = '0';
      }
    }
    setMatrix(m);
    setErr('');
  }, [open, data, setErr]);

  if (!open || !data) return null;

  // Suma por size_id (la fila de la matriz).
  const sumBySize = {};
  for (const s of data.sizes) {
    let total = 0;
    for (const cid of data.colorIds) {
      const v = Number(matrix[`${cid}|${s.size_id ?? 'null'}`] || 0);
      total += Number.isFinite(v) ? v : 0;
    }
    sumBySize[s.size_id ?? 'null'] = total;
  }
  // ¿Cuadra cada fila?
  const allCuedran = data.sizes.every((s) => sumBySize[s.size_id ?? 'null'] === s.currentStock);

  function setCell(cid, sizeId, value) {
    setMatrix((p) => ({ ...p, [`${cid}|${sizeId ?? 'null'}`]: value }));
  }

  async function confirmar() {
    setPending(true);
    setErr('');
    const distribution = [];
    for (const cid of data.colorIds) {
      for (const s of data.sizes) {
        const v = Number(matrix[`${cid}|${s.size_id ?? 'null'}`] || 0);
        distribution.push({ color_id: cid, size_id: s.size_id, stock: v });
      }
    }
    const body = { color_ids: data.colorIds, distribution };
    // Si el producto aún no tiene color_system_id persistido (típico
    // cuando se activa por primera vez), lo mandamos del state de editing.
    if (editing.color_system_id) body.color_system_id = editing.color_system_id;
    const r = await api(`/api/admin/inventory/items/${editing.id}/colors/activate`, {
      method: 'POST',
      body,
    });
    setPending(false);
    if (r.ok) {
      // Actualizar editing con lo que devolvió el server.
      setEditing(hydrateColorIds(r.data));
      onAdjusted && onAdjusted();
      onClose();
    } else {
      setErr(r.data?.details?.join(', ') || r.data?.message || r.data?.error || 'Error al activar');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Repartir stock entre los colores"
      size="lg"
      footer={
        <>
          <button className="btn secondary" onClick={onClose} disabled={pending}>Cancelar</button>
          <button className="btn" onClick={confirmar} disabled={pending || !allCuedran}>
            {pending ? 'Activando…' : 'Activar colores y repartir'}
          </button>
        </>
      }
    >
      <div className="form">
        {err && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</div>}
        <div className="form-hint" style={{ marginBottom: 8 }}>
          La suma de cada fila (talla) tiene que coincidir con el stock
          actual. Si una fila no cuadra, el botón queda deshabilitado.
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ minWidth: 480 }}>
            <thead>
              <tr>
                <th>Talla</th>
                {data.colorIds.map((cid) => {
                  const c = colorsById[cid];
                  return (
                    <th key={cid} style={{ textAlign: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: c?.hex || 'transparent', border: '1px solid var(--gray-300)', display: 'inline-block' }} />
                        {c?.label || `#${cid}`}
                      </span>
                    </th>
                  );
                })}
                <th style={{ textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.sizes.map((s) => {
                const key = s.size_id ?? 'null';
                const sum = sumBySize[key];
                const cuadra = sum === s.currentStock;
                return (
                  <tr key={key}>
                    <td><strong>{s.label}</strong></td>
                    {data.colorIds.map((cid) => (
                      <td key={cid} style={{ textAlign: 'center' }}>
                        <input
                          type="number"
                          min="0"
                          value={matrix[`${cid}|${key}`] || '0'}
                          onChange={(e) => setCell(cid, s.size_id, e.target.value)}
                          style={{ width: 64, textAlign: 'center' }}
                        />
                      </td>
                    ))}
                    <td style={{ textAlign: 'right' }}>
                      <span style={{
                        fontWeight: 600,
                        color: cuadra ? 'var(--gray-700)' : 'var(--danger)',
                      }}>
                        {sum}
                      </span>
                      <span style={{ color: 'var(--gray-500)', fontSize: 12, marginLeft: 4 }}>
                        / {s.currentStock}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {allCuedran ? (
          <div className="form-hint" style={{ color: 'var(--accent)', marginTop: 8 }}>
            ✓ Cada fila cuadra con el stock actual.
          </div>
        ) : (
          <div className="form-hint" style={{ color: 'var(--danger)', marginTop: 8 }}>
            Alguna fila no cuadra con el stock actual. Ajustá los números
            hasta que cada fila sume el total esperado.
          </div>
        )}
      </div>
    </Modal>
  );
}

// ============================================================================
// DesactivarColoresModal: al volver a solo tallas, el stock de todos los
// colores se suma por talla. No hay una opción que descarte unidades.
// ============================================================================
function DesactivarColoresModal({ open, onClose, editing, setEditing, onAdjusted }) {
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState('');

  if (!open) return null;

  async function confirmar() {
    setPending(true);
    setErr('');
    const r = await api(`/api/admin/inventory/items/${editing.id}/colors/deactivate`, {
      method: 'POST',
      body: { mode: 'sum' },
    });
    setPending(false);
    if (r.ok) {
      setEditing(hydrateColorIds(r.data));
      onAdjusted && onAdjusted();
      onClose();
    } else {
      setErr(r.data?.message || r.data?.error || 'Error al desactivar');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Desactivar variantes por color"
      size="md"
      footer={
        <>
          <button className="btn secondary" onClick={onClose} disabled={pending}>Cancelar</button>
          <button className="btn danger" onClick={confirmar} disabled={pending}>
            {pending ? 'Desactivando…' : 'Desactivar y mergear'}
          </button>
        </>
      }
    >
      <div className="form">
        {err && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</div>}
        <div className="form-row">
          <label>Stock al volver a solo tallas</label>
          <div className="form-hint">Se suman todos los colores en cada talla. Por ejemplo, 2 Marfil M + 3 Rojo M quedan como 5 unidades talla M.</div>
        </div>
        <div className="form-hint">
          Las fotos marcadas con un color se vuelven "generales" (sin color) automáticamente.
        </div>
      </div>
    </Modal>
  );
}

// Promo temporal del producto: % o monto con vigencia. Se aplica por default
// en la caja (removible) y la tienda la muestra con precio tachado. El
// descuento manual de caja NO pasa por acá: vive en la línea de venta.
function PromoPanel({ editing, onChanged, canEdit }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('percent');
  const [value, setValue] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [msg, setMsg] = useState('');
  const [pending, setPending] = useState(false);

  const promo = editing.promo;

  async function save() {
    setMsg('');
    if (!Number(value) || Number(value) <= 0) { setMsg('Ingresa el valor del descuento.'); return; }
    if (!endsAt) { setMsg('La promo necesita fecha de fin.'); return; }
    setPending(true);
    const r = await api(`/api/admin/inventory/items/${editing.id}/promo`, {
      method: 'POST',
      body: { kind, value: Number(value), ends_at: endsAt },
    });
    setPending(false);
    if (r.ok) { setOpen(false); setValue(''); setEndsAt(''); onChanged(); }
    else setMsg(r.data?.details?.join(', ') || r.data?.message || r.data?.error || 'Error al guardar la promo');
  }

  async function remove() {
    if (!confirm('¿Terminar la promoción de este producto?')) return;
    setPending(true);
    const r = await api(`/api/admin/inventory/items/${editing.id}/promo`, { method: 'DELETE' });
    setPending(false);
    if (r.ok) onChanged();
    else setMsg(r.data?.message || r.data?.error || 'Error');
  }

  return (
    <div className="form-row">
      <label>Promoción</label>
      {promo ? (
        <div className="form-hint" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="badge ok">
            {promo.kind === 'percent' ? `−${Number(promo.value)}%` : `−${money(promo.value)}`}
          </span>
          <span>
            del {promo.starts_at} al {promo.ends_at}
            {promo.vigente === false && ' (todavía no vigente)'}
          </span>
          {canEdit && <button type="button" className="row-btn danger" onClick={remove} disabled={pending}>Terminar promo</button>}
        </div>
      ) : !open ? (
        <div>
          {canEdit && <button type="button" className="row-btn" onClick={() => setOpen(true)}>+ Crear promoción</button>}
        </div>
      ) : null}
      {!promo && open && (
        <div className="inv-adjust">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="percent">%</option>
            <option value="amount">$ fijo</option>
          </select>
          <input
            type="number" min="1" step={kind === 'percent' ? 1 : 1000}
            placeholder={kind === 'percent' ? '% desc.' : 'Monto'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            style={{ width: 110 }}
          />
          <input
            type="date"
            title="Hasta cuándo"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
          {canEdit && <button type="button" className="row-btn" onClick={save} disabled={pending}>Guardar</button>}
          {canEdit && <button type="button" className="row-btn" onClick={() => { setOpen(false); setMsg(''); }} disabled={pending}>Cancelar</button>}
        </div>
      )}
      {msg && <div className="form-hint" style={{ color: 'var(--danger)' }}>{msg}</div>}
    </div>
  );
}

// Matriz de inventario: única vista de ajuste. Conserva la regla del libro
// mayor: cada celda que cambia se persiste como un movimiento con la misma
// nota obligatoria. Para productos con colores muestra color × talla; para los
// demás, una columna por talla.
function AdjustPanel({ editing, onAdjusted, canEdit }) {
  const useColors = !!editing.use_colors;
  const [draft, setDraft] = useState({});
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [pending, setPending] = useState(false);

  const rows = useMemo(() => {
    if (!useColors) return (editing.sizes || []).map((s) => ({ size_id: s.size_id, label: s.label ?? 'Única' }));
    const seen = new Map();
    for (const v of (editing.variants || [])) {
      const key = v.size_id ?? 'null';
      if (!seen.has(key)) seen.set(key, { size_id: v.size_id, label: v.size_label ?? 'Única' });
    }
    return [...seen.values()];
  }, [editing.sizes, editing.variants, useColors]);
  const columns = useColors ? (editing.colors || []) : [{ id: null, label: 'Existencias', hex: null }];

  useEffect(() => {
    const next = {};
    if (useColors) {
      for (const color of columns) for (const row of rows) {
        const variant = (editing.variants || []).find((v) => v.color_id === color.id && v.size_id === row.size_id);
        next[`${color.id}|${row.size_id ?? 'null'}`] = { stock: Number(variant?.stock || 0), variantId: variant?.id ?? null };
      }
    } else for (const row of rows) {
      const size = (editing.sizes || []).find((s) => s.size_id === row.size_id);
      next[`size|${row.size_id ?? 'null'}`] = { stock: Number(size?.stock || 0), variantId: null };
    }
    setDraft(next);
    setNote('');
    setMsg('');
  }, [editing.id, editing.variants, editing.sizes, useColors]);

  function update(key, value) {
    const stock = Math.max(0, Number.parseInt(value, 10) || 0);
    setDraft((p) => ({ ...p, [key]: { ...p[key], stock } }));
    setMsg('');
  }

  const total = Object.values(draft).reduce((sum, cell) => sum + Number(cell.stock || 0), 0);
  const changes = Object.entries(draft).filter(([key, cell]) => {
    const [colorId, sizeId] = key.split('|');
    const original = useColors
      ? (editing.variants || []).find((v) => v.color_id === Number(colorId) && String(v.size_id ?? 'null') === sizeId)?.stock
      : (editing.sizes || []).find((s) => String(s.size_id ?? 'null') === sizeId)?.stock;
    return Number(cell.stock) !== Number(original || 0);
  });

  async function save() {
    if (!changes.length) { setMsg('No hay ajustes para guardar.'); return; }
    if (!note.trim()) { setMsg('Escribí una nota antes de guardar los ajustes.'); return; }
    setPending(true);
    setMsg('');
    for (const [key, cell] of changes) {
      const [colorPart, sizePart] = key.split('|');
      const current = useColors
        ? Number((editing.variants || []).find((v) => v.color_id === Number(colorPart) && String(v.size_id ?? 'null') === sizePart)?.stock || 0)
        : Number((editing.sizes || []).find((s) => String(s.size_id ?? 'null') === sizePart)?.stock || 0);
      const body = useColors
        ? (cell.variantId ? { variant_id: cell.variantId, delta: cell.stock - current, note: note.trim() } : { color_id: Number(colorPart), size_id: sizePart === 'null' ? null : Number(sizePart), delta: cell.stock - current, note: note.trim() })
        : { size_id: sizePart === 'null' ? null : Number(sizePart), delta: cell.stock - current, note: note.trim() };
      const r = await api(`/api/admin/inventory/items/${editing.id}/adjust`, { method: 'POST', body });
      if (!r.ok) {
        setPending(false);
        setMsg(r.data?.message || r.data?.details?.join(', ') || r.data?.error || 'No se pudo guardar el ajuste.');
        return;
      }
    }
    setPending(false);
    onAdjusted();
  }

  if (!rows.length || !columns.length) return <div className="form-row"><label>Matriz de inventario</label><div className="form-hint">Primero seleccioná las tallas y los colores que aplican a este producto.</div></div>;

  return (
    <div className="form-row">
      <label>Matriz de inventario <span className="form-hint" style={{ fontWeight: 400 }}>· {useColors ? 'talla × color' : 'solo tallas'}</span></label>
      <div className={`inventory-matrix ${useColors ? '' : 'sizes-only'}`} style={{ '--matrix-columns': columns.length }}>
        <div className="inventory-matrix-cell head">Talla</div>
        {columns.map((color) => <div key={color.id ?? 'stock'} className="inventory-matrix-cell head">{color.hex && <span className="color-swatch" style={{ background: color.hex }} />}{color.label}</div>)}
        {useColors && <div className="inventory-matrix-cell head">Total</div>}
        {rows.map((row) => {
          const rowTotal = columns.reduce((sum, color) => sum + Number(draft[`${color.id}|${row.size_id ?? 'null'}`]?.stock || 0), 0);
          return <Fragment key={row.size_id ?? 'null'}>
            <div className="inventory-matrix-cell row-label">{row.label}</div>
            {columns.map((color) => {
              const key = useColors ? `${color.id}|${row.size_id ?? 'null'}` : `size|${row.size_id ?? 'null'}`;
              const cell = draft[key] || { stock: 0 };
              return <div className="inventory-matrix-cell" key={key}>
                {canEdit && <button type="button" className="matrix-step" onClick={() => update(key, cell.stock - 1)} disabled={pending || cell.stock <= 0}>−</button>}
                <input type="number" min="0" value={cell.stock} disabled={!canEdit || pending} onChange={(e) => update(key, e.target.value)} />
                {canEdit && <button type="button" className="matrix-step" onClick={() => update(key, cell.stock + 1)} disabled={pending}>+</button>}
              </div>;
            })}
            {useColors && <div className="inventory-matrix-cell total">{rowTotal}</div>}
          </Fragment>;
        })}
      </div>
      <div className="form-hint">Total actual: <strong>{total}</strong> unidad(es).</div>
      {canEdit && <>
        <label style={{ marginTop: 8 }}>Nota del movimiento <span className="form-hint" style={{ fontWeight: 400 }}>(obligatoria)</span></label>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: Llegaron unidades del proveedor" />
        <div><button type="button" className="btn secondary" onClick={save} disabled={pending}>{pending ? 'Guardando…' : `Guardar ajustes${changes.length ? ` (${changes.length})` : ''}`}</button></div>
      </>}
      {msg && <div className="form-hint" style={{ color: 'var(--danger)' }}>{msg}</div>}

      {(editing.movements || []).length > 0 && (
        <>
          <label style={{ marginTop: 10 }}>Últimos movimientos</label>
          <ul className="dash-list">
            {editing.movements.map((m) => (
              <li key={m.id}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <strong style={{ color: m.delta > 0 ? 'var(--accent)' : 'var(--danger)' }}>
                    {m.delta > 0 ? '+' : ''}{m.delta}
                  </strong>
                  {m.color_label && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gray-500)', display: 'inline-block' }} />
                      {m.color_label}
                    </span>
                  )}
                  {m.size_label && <span>· {m.size_label}</span>}
                  <span>· {m.reason}</span>
                  {m.note && <span>· {m.note}</span>}
                </span>
                <span className="muted">{new Date(m.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
