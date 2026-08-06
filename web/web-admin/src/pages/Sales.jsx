// Ventas (Gestión General): registrar ventas manuales sobre el catálogo
// unificado (products). El buscador reusa el endpoint de Inventario, el
// carrito arma las líneas y el POST corre en una transacción en el server:
// o entra todo (venta + descuento de stock + movimientos) o no entra nada.
//
// Descuentos: si el producto tiene promo vigente viene aplicada por default
// (se puede quitar); el cajero puede poner un descuento manual por línea, que
// REEMPLAZA a la promo (nunca se apilan). El server congela precio original,
// descuento y precio final en cada línea: el histórico no se recalcula.

import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';
import { money } from '../lib/format.js';
import { PAYMENT_METHODS, PAYMENT_LABELS } from '../lib/constants.js';
import { useMe } from '../hooks/useMe.js';
import { canWrite } from '../lib/permissions.js';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function round2(n) { return Math.round(Number(n) * 100) / 100; }

// Descuento unitario de una línea según su modo. Espeja la fórmula del server;
// el server es quien la congela en la venta.
function lineDiscount(l) {
  const unit = Number(l.unit_price) || 0;
  if (l.discount_mode === 'manual') {
    const v = Number(l.manual_value) || 0;
    const d = l.manual_kind === 'percent' ? (unit * v) / 100 : v;
    return round2(Math.min(Math.max(d, 0), unit));
  }
  if (l.discount_mode === 'promo' && l.promo) {
    const v = Number(l.promo.value) || 0;
    const d = l.promo.kind === 'percent' ? (unit * v) / 100 : v;
    return round2(Math.min(d, unit));
  }
  return 0;
}

function lineFinalUnit(l) { return round2((Number(l.unit_price) || 0) - lineDiscount(l)); }

export default function Sales() {
  const me = useMe();
  const canEdit = me ? canWrite('sales', me.role) : true;
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [cart, setCart] = useState([]);
  const [method, setMethod] = useState('efectivo');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState(null);

  const [sales, setSales] = useState(null);
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [filterMethod, setFilterMethod] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // El buscador principal: server-side sobre el catálogo unificado. En caja se
  // vende cualquier producto vivo, publicado o no: el stock es físico.
  const debounceRef = useRef(null);
  function onSearch(value) {
    setQ(value);
    clearTimeout(debounceRef.current);
    if (!value.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      const r = await api(`/api/admin/inventory/items?q=${encodeURIComponent(value.trim())}`);
      if (r.ok) setResults(r.data.data);
    }, 250);
  }

  // Refresca los resultados con el mismo término (el stock cambia al vender).
  async function refreshSearch() {
    if (!q.trim()) return;
    const r = await api(`/api/admin/inventory/items?q=${encodeURIComponent(q.trim())}`);
    if (r.ok) setResults(r.data.data);
  }

  async function loadSales({ f = from, t = to, m = filterMethod, s = filterStatus } = {}) {
    const params = new URLSearchParams();
    if (f) params.set('from', f);
    if (t) params.set('to', t);
    if (m) params.set('payment_method', m);
    if (s) params.set('status', s);
    const r = await api(`/api/admin/sales?${params}`);
    if (r.ok) setSales(r.data.data);
  }
  useEffect(() => { loadSales(); }, []);

  function inCart(productId, sizeId) {
    return cart.find((l) => l.product_id === productId && l.size_id === sizeId);
  }

  // Click en una talla del resultado → una unidad al carrito. La cantidad se
  // afina en el carrito, con tope en el stock disponible. Si hay promo vigente
  // entra aplicada (el cajero la puede quitar).
  function addToCart(item, size) {
    setErr('');
    // size.size_id null = producto "sin tallas" (un solo compartimento).
    const sizeName = size.label ? `talla ${size.label}` : 'única';
    const line = inCart(item.id, size.size_id);
    if (line) {
      if (line.qty + 1 > size.stock) { setErr(`No hay más stock de "${item.name}" (${sizeName}).`); return; }
      setCart(cart.map((l) => l === line ? { ...l, qty: l.qty + 1 } : l));
      return;
    }
    if (size.stock < 1) { setErr(`Sin stock de "${item.name}" (${sizeName}).`); return; }
    setCart([...cart, {
      product_id: item.id,
      size_id: size.size_id ?? null,
      name: item.name,
      size_label: size.label ?? 'Única',
      unit_price: Number(item.price),
      promo: item.promo || null,
      discount_mode: item.promo ? 'promo' : 'none', // 'promo' | 'manual' | 'none'
      manual_kind: 'percent',
      manual_value: '',
      max_stock: size.stock,
      qty: 1,
    }]);
  }

  function setQty(line, qty) {
    const n = Math.max(1, Math.min(Number(qty) || 1, line.max_stock));
    setCart(cart.map((l) => l === line ? { ...l, qty: n } : l));
  }

  function patchLine(line, patch) {
    setCart(cart.map((l) => l === line ? { ...l, ...patch } : l));
  }

  function removeLine(line) {
    setCart(cart.filter((l) => l !== line));
  }

  const total = round2(cart.reduce((acc, l) => acc + lineFinalUnit(l) * l.qty, 0));

  async function register() {
    if (!cart.length) return;
    setPending(true);
    setErr('');
    const r = await api('/api/admin/sales', {
      method: 'POST',
      body: {
        payment_method: method,
        note: note.trim(),
        items: cart.map((l) => {
          const base = { product_id: l.product_id, size_id: l.size_id, qty: l.qty };
          if (l.discount_mode === 'manual' && Number(l.manual_value) > 0) {
            base.discount = { type: 'manual', kind: l.manual_kind, value: Number(l.manual_value) };
          } else if (l.discount_mode === 'none' && l.promo) {
            base.discount = { type: 'ninguno' }; // promo quitada a mano
          }
          return base;
        }),
      },
    });
    setPending(false);
    if (r.ok) {
      setReceipt(r.data.data);
      setCart([]);
      setNote('');
      loadSales();
      refreshSearch();
    } else {
      setErr(r.data?.message || r.data?.details?.join(', ') || r.data?.error || 'Error al registrar la venta');
    }
  }

  async function voidSale(s) {
    if (!confirm(`¿Anular la venta #${s.id} por ${money(s.total)}?\n\nEl stock vuelve al inventario. La venta queda marcada, no se borra.`)) return;
    const r = await api(`/api/admin/sales/${s.id}/void`, { method: 'POST' });
    if (r.ok) { loadSales(); refreshSearch(); }
    else alert(r.data?.message || r.data?.error || 'Error al anular');
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1>Ventas</h1>
          <p className="sub">Busca en el catálogo, arma el carrito y registra. Los precios y promos salen del inventario.</p>
        </div>
      </div>

      <div className="sales-cols">
        <div>
          <input
            className="sales-search"
            placeholder="Buscar por nombre o SKU…"
            value={q}
            onChange={(e) => onSearch(e.target.value)}
            autoFocus
          />

          {q.trim() && (
            <div className="sales-results">
              {results.length === 0 ? (
                <div className="form-hint" style={{ padding: 12 }}>Sin resultados en el catálogo.</div>
              ) : results.map((item) => (
                <div key={item.id} className={`sales-result ${item.promo ? 'has-promo' : ''}`}>
                  <div className="sales-result-info">
                    <div className="sales-result-name">
                      {item.name}
                      {item.promo && <span className="badge ok" style={{ marginLeft: 6 }}>Promo</span>}
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {item.sku ? <span style={{ fontFamily: 'monospace' }}>{item.sku} · </span> : null}
                      {item.promo ? (
                        <>
                          <s>{money(item.price)}</s>{' '}
                          <strong>{money(lineFinalUnit({ unit_price: item.price, promo: item.promo, discount_mode: 'promo' }))}</strong>
                        </>
                      ) : money(item.price)}
                    </div>
                  </div>
                  <div className="sales-result-sizes">
                    {(item.sizes || []).filter((s) => s.stock > 0).length === 0 ? (
                      <span className="form-hint">Sin stock</span>
                    ) : (item.sizes || []).filter((s) => s.stock > 0).map((s) =>
                      canEdit ? (
                        <button
                          key={s.size_id ?? 'null'}
                          type="button"
                          className="row-btn"
                          title={`Agregar ${s.label ? `talla ${s.label}` : 'al carrito'} (hay ${s.stock})`}
                          onClick={() => addToCart(item, s)}
                        >
                          {s.label ?? 'Única'} · {s.stock}
                        </button>
                      ) : null
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <h2 style={{ fontSize: 15, margin: '24px 0 10px' }}>Ventas registradas</h2>
          <div className="filters" style={{ marginBottom: 12 }}>
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); loadSales({ f: e.target.value }); }} />
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); loadSales({ t: e.target.value }); }} />
            <select value={filterMethod} onChange={(e) => { setFilterMethod(e.target.value); loadSales({ m: e.target.value }); }}>
              <option value="">Todos los medios</option>
              {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); loadSales({ s: e.target.value }); }}>
              <option value="">Completadas y anuladas</option>
              <option value="completada">Completadas</option>
              <option value="anulada">Anuladas</option>
            </select>
          </div>

          {sales === null ? (
            <div style={{ padding: 20, color: 'var(--gray-500)' }}>Cargando…</div>
          ) : sales.length === 0 ? (
            <div className="placeholder-card" style={{ textAlign: 'center', color: 'var(--gray-500)' }}>
              Sin ventas en el rango.
            </div>
          ) : (
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Detalle</th>
                    <th>Medio</th>
                    <th>Total</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => (
                    <tr key={s.id} style={s.status === 'anulada' ? { opacity: 0.55 } : {}}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {new Date(s.sold_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td>
                        {(s.items || []).map((i) => (
                          `${i.item_name}${i.size_label ? ` (${i.size_label})` : ''} ×${i.qty}` +
                          (i.discount_type && i.discount_type !== 'ninguno'
                            ? ` [${i.discount_type === 'promo' ? 'promo' : 'desc.'} −${money(i.discount_amount)}]`
                            : '')
                        )).join(', ')}
                        {s.note ? <div className="muted" style={{ fontSize: 12 }}>{s.note}</div> : null}
                      </td>
                      <td>{PAYMENT_LABELS[s.payment_method] || s.payment_method}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{money(s.total)}</td>
                      <td>
                        <span className={`badge ${s.status === 'completada' ? 'ok' : 'off'}`}>
                          {s.status === 'completada' ? 'Completada' : 'Anulada'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {canEdit && s.status === 'completada' && (
                          <button className="row-btn danger" onClick={() => voidSale(s)}>Anular</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="sales-cart">
          <h2 style={{ fontSize: 15, margin: '0 0 12px' }}>Carrito</h2>
          {err && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{err}</div>}
          {cart.length === 0 ? (
            <p className="form-hint">Busca un producto y toca una talla para agregarlo.</p>
          ) : (
            <>
              <ul className="dash-list">
                {cart.map((l) => {
                  const disc = lineDiscount(l);
                  const finalUnit = lineFinalUnit(l);
                  return (
                    <li key={`${l.product_id}-${l.size_id}`} style={{ flexWrap: 'wrap' }}>
                      <span style={{ flex: 1, minWidth: 150 }}>
                        {l.name} <span className="muted">({l.size_label})</span>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {disc > 0 ? <><s>{money(l.unit_price)}</s> {money(finalUnit)}</> : money(l.unit_price)} c/u
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                          {l.promo && l.discount_mode === 'promo' && (
                            <span className="badge ok">
                              Promo {l.promo.kind === 'percent' ? `−${Number(l.promo.value)}%` : `−${money(l.promo.value)}`}
                              <button
                                type="button"
                                className="row-btn"
                                style={{ marginLeft: 4, padding: '0 6px' }}
                                title="Quitar la promo de esta línea"
                                onClick={() => patchLine(l, { discount_mode: 'none' })}
                              >×</button>
                            </span>
                          )}
                          {l.promo && l.discount_mode === 'none' && (
                            <button
                              type="button"
                              className="row-btn"
                              onClick={() => patchLine(l, { discount_mode: 'promo' })}
                            >Aplicar promo</button>
                          )}
                          {l.discount_mode !== 'manual' ? (
                            <button
                              type="button"
                              className="row-btn"
                              title="Descuento manual (reemplaza a la promo)"
                              onClick={() => patchLine(l, { discount_mode: 'manual' })}
                            >Desc. manual</button>
                          ) : (
                            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                              <select
                                value={l.manual_kind}
                                onChange={(e) => patchLine(l, { manual_kind: e.target.value })}
                              >
                                <option value="percent">%</option>
                                <option value="amount">$</option>
                              </select>
                              <input
                                type="number" min="0" step={l.manual_kind === 'percent' ? 1 : 1000}
                                placeholder={l.manual_kind === 'percent' ? '%' : '$'}
                                value={l.manual_value}
                                onChange={(e) => patchLine(l, { manual_value: e.target.value })}
                                style={{ width: 80 }}
                              />
                              <button
                                type="button"
                                className="row-btn"
                                title="Quitar el descuento manual"
                                onClick={() => patchLine(l, { discount_mode: l.promo ? 'promo' : 'none', manual_value: '' })}
                              >×</button>
                            </span>
                          )}
                        </div>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          type="number" min="1" max={l.max_stock}
                          value={l.qty}
                          onChange={(e) => setQty(l, e.target.value)}
                          style={{ width: 58 }}
                        />
                        <strong style={{ whiteSpace: 'nowrap' }}>{money(finalUnit * l.qty)}</strong>
                        {canEdit && <button className="row-btn danger" onClick={() => removeLine(l)} title="Quitar">×</button>}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <div className="sales-total">
                <span>Total</span>
                <strong>{money(total)}</strong>
              </div>

              <div className="form-row" style={{ marginTop: 12 }}>
                <label>Medio de pago</label>
                <div className="sales-methods">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      className={`row-btn ${method === m.value ? 'sales-method-on' : ''}`}
                      onClick={() => setMethod(m.value)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {canEdit && (
                <>
                  <div className="form-row" style={{ marginTop: 10 }}>
                    <label>Nota (opcional)</label>
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: cliente frecuente" />
                  </div>

                  <button
                    className="btn"
                    style={{ width: '100%', marginTop: 14 }}
                    onClick={register}
                    disabled={pending || cart.length === 0}
                  >
                    {pending ? 'Registrando…' : `Registrar venta · ${money(total)}`}
                  </button>
                </>
              )}
            </>
          )}
        </aside>
      </div>

      <Modal
        open={!!receipt}
        onClose={() => setReceipt(null)}
        title={`Venta #${receipt?.id} registrada`}
        footer={<button className="btn" onClick={() => setReceipt(null)}>Listo</button>}
      >
        {receipt && (
          <div className="form">
            <ul className="dash-list">
              {(receipt.items || []).map((i) => (
                <li key={i.id}>
                  <span>
                    {i.item_name}{i.size_label ? ` (${i.size_label})` : ''} ×{i.qty}
                    {i.discount_type !== 'ninguno' && (
                      <div className="muted" style={{ fontSize: 12 }}>
                        {i.discount_type === 'promo' ? 'Promo' : 'Descuento'}: <s>{money(i.unit_price)}</s> {money(i.final_unit_price)} c/u
                      </div>
                    )}
                  </span>
                  <strong>{money(i.subtotal)}</strong>
                </li>
              ))}
            </ul>
            <div className="sales-total">
              <span>Total · {PAYMENT_LABELS[receipt.payment_method] || receipt.payment_method}</span>
              <strong>{money(receipt.total)}</strong>
            </div>
            {receipt.note && <p className="form-hint">Nota: {receipt.note}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
