import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import OrderLocationMap from '../components/OrderLocationMap.jsx';
import Empty from '../components/Empty.jsx';
import Modal from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';

function formatCOP(value) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(value) || 0);
}

const STATUS_LABELS = {
  pending: 'Pendiente', paid: 'Pagado', processing: 'En preparación',
  shipped: 'Enviado', delivered: 'Entregado', cancelled: 'Cancelado', expired: 'Expirado', refunded: 'Reembolsado',
};

export default function Orders() {
  const toast = useToast();
  const [orders, setOrders] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [details, setDetails] = useState({});
  const [detailLoading, setDetailLoading] = useState({});
  const [detailErrors, setDetailErrors] = useState({});
  const [manualOpen, setManualOpen] = useState(false);

  const loadOrders = () => {
    setLoading(true);
    let active = true;
    Promise.all([
      api.get('/api/admin/orders'),
      api.get('/api/admin/orders/reservations'),
    ])
      .then(([ordersData, reservationsData]) => { if (active) { setOrders(ordersData.orders || []); setReservations(reservationsData.reservations || []); } })
      .catch((error) => { if (active) toast.error('No se pudieron cargar los pedidos', error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  };

  useEffect(() => loadOrders(), []);

  const toggleOrder = async (order) => {
    if (expandedId === order.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(order.id);
    if (details[order.id] || detailLoading[order.id]) return;
    setDetailLoading((current) => ({ ...current, [order.id]: true }));
    setDetailErrors((current) => ({ ...current, [order.id]: '' }));
    try {
      const data = await api.get(`/api/admin/orders/${order.id}`);
      setDetails((current) => ({ ...current, [order.id]: data.order }));
    } catch (error) {
      setDetailErrors((current) => ({ ...current, [order.id]: error.message || 'No se pudo cargar el detalle del pedido.' }));
    } finally {
      setDetailLoading((current) => ({ ...current, [order.id]: false }));
    }
  };

  return (
    <div>
      <div className="page-header"><div><h1>Pedidos</h1><p className="form-hint">Pedidos recibidos desde la tienda y ventas cerradas por otros canales.</p></div><button className="btn btn-primary" type="button" onClick={() => setManualOpen(true)}>+ Agregar pedido manual</button></div>
      <Modal open={manualOpen} onClose={() => setManualOpen(false)} title="Agregar pedido manual" size="lg">
        <ManualRecordForm
          onCancel={() => setManualOpen(false)}
          onCreated={(result) => {
            setManualOpen(false);
            loadOrders();
            toast.success(result.reservation ? 'Reserva registrada' : 'Pedido manual registrado');
          }}
        />
      </Modal>
      {loading ? <div className="center"><span className="spinner" /></div> : orders.length === 0 ? (
        <Empty title="Sin pedidos" description="Los pedidos nuevos aparecerán aquí." />
      ) : (
        <div className="table-wrap"><table className="data-table orders-table">
          <thead><tr><th>Pedido</th><th>Cliente</th><th>Estado</th><th>Artículos</th><th>Total</th><th>Fecha</th></tr></thead>
          <tbody>{orders.map((order) => (
            <React.Fragment key={order.id}>
            <tr
              className={`order-row ${expandedId === order.id ? 'is-expanded' : ''}`}
              onClick={() => toggleOrder(order)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  toggleOrder(order);
                }
              }}
              tabIndex={0}
              role="button"
              aria-expanded={expandedId === order.id}
              aria-controls={`order-detail-${order.id}`}
            >
              <td><span className="order-row-chevron" aria-hidden="true">{expandedId === order.id ? '⌄' : '›'}</span><strong>{order.order_number}</strong></td>
              <td>{order.customer_name || order.customer_email}</td>
              <td><span className="badge">{STATUS_LABELS[order.status] || order.status}</span></td>
              <td>{order.item_count}</td>
              <td>{formatCOP(order.total)}</td>
              <td>{new Date(order.created_at).toLocaleString('es-CO')}</td>
            </tr>
            {expandedId === order.id && (
              <tr className="order-detail-row">
                <td id={`order-detail-${order.id}`} colSpan={6}>
                  <OrderDetail
                    order={details[order.id]}
                    loading={detailLoading[order.id]}
                    error={detailErrors[order.id]}
                  />
                </td>
              </tr>
            )}
            </React.Fragment>
          ))}</tbody>
        </table></div>
      )}
      <section className="orders-reservations-section">
        <div className="page-header"><div><h2>Reservas y leads de WhatsApp</h2><p className="form-hint">Las solicitudes de alquiler quedan aquí para revisarlas y asentarlas.</p></div></div>
        {reservations.length === 0 ? <p className="form-hint">Todavía no hay solicitudes de reserva.</p> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Reserva</th><th>Producto</th><th>Cliente</th><th>Fechas</th><th>Estado</th><th>Valor</th></tr></thead><tbody>{reservations.map((reservation) => <tr key={reservation.id}><td><strong>{reservation.reservation_number}</strong></td><td>{reservation.product_name}<small className="table-subtext">{reservation.variant_sku || 'Variante estándar'}</small></td><td>{reservation.customer_name}<small className="table-subtext">{reservation.customer_email} · {reservation.customer_phone}</small></td><td>{String(reservation.use_date).slice(0, 10)} → {String(reservation.use_end_date || reservation.use_date).slice(0, 10)}<small className="table-subtext">Recogida: {String(reservation.pickup_date).slice(0, 10)}</small></td><td><span className="badge">{reservation.status === 'lead' ? 'Lead' : reservation.status === 'confirmed' ? 'Confirmada' : reservation.status === 'pending' ? 'Pendiente' : reservation.status}</span></td><td>{formatCOP(reservation.quoted_amount)}</td></tr>)}</tbody></table></div>}
      </section>
    </div>
  );
}

const EMPTY_CUSTOMER = { email: '', name: '', phone: '', address: '', department: '', city: '' };
const EMPTY_RESERVATION = { reservation_id: '', product_id: '', variant_id: '', requested_type: 'alquiler', use_date: '', use_end_date: '', pickup_date: '', status: 'confirmed', quoted_amount: '', payment_method: '', shipping_method: '', notes: '' };

function formatManualCOP(value) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function ManualRecordForm({ onCancel, onCreated }) {
  const toast = useToast();
  const [kind, setKind] = useState('order');
  const [customer, setCustomer] = useState(EMPTY_CUSTOMER);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [productQuery, setProductQuery] = useState('');
  const [productSuggestions, setProductSuggestions] = useState([]);
  const [items, setItems] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('transferencia');
  const [paymentStatus, setPaymentStatus] = useState('paid');
  const [shippingMethod, setShippingMethod] = useState('recogida');
  const [shipping, setShipping] = useState('0');
  const [tax, setTax] = useState('0');
  const [discount, setDiscount] = useState('0');
  const [notes, setNotes] = useState('');
  const [reservation, setReservation] = useState(EMPTY_RESERVATION);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const query = customerQuery.trim();
    if (query.length < 2) { setCustomerSuggestions([]); return undefined; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const data = await api.get(`/api/admin/orders/customer-search?q=${encodeURIComponent(query)}`);
        if (!cancelled) setCustomerSuggestions(data.customers || []);
      } catch { if (!cancelled) setCustomerSuggestions([]); }
    }, 220);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [customerQuery]);

  useEffect(() => {
    const query = productQuery.trim();
    if (query.length < 2) { setProductSuggestions([]); return undefined; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const data = await api.get(`/api/admin/orders/manual-products?q=${encodeURIComponent(query)}`);
        if (!cancelled) setProductSuggestions(data.products || []);
      } catch { if (!cancelled) setProductSuggestions([]); }
    }, 220);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [productQuery]);

  const chooseCustomer = (profile) => {
    setCustomer({ email: profile.email || '', name: profile.name || '', phone: profile.phone || '', address: customer.address, department: customer.department, city: customer.city });
    setCustomerQuery(profile.email || '');
    setCustomerSuggestions([]);
    if (profile.reservation_id) {
      setReservation((current) => ({
        ...current,
        reservation_id: profile.reservation_id,
        product_id: profile.product_id || '',
        variant_id: profile.variant_id || '',
        requested_type: profile.requested_type || current.requested_type,
        use_date: profile.use_date ? String(profile.use_date).slice(0, 10) : current.use_date,
        use_end_date: profile.use_end_date ? String(profile.use_end_date).slice(0, 10) : current.use_end_date,
        pickup_date: profile.pickup_date ? String(profile.pickup_date).slice(0, 10) : current.pickup_date,
      }));
      toast.success('Lead encontrado', 'Se precargaron los datos de la reserva.');
    }
  };

  const chooseProduct = (product) => {
    if (kind === 'reservation') {
      setReservation((current) => ({ ...current, product_id: product.product_id, variant_id: product.variant_id || '', quoted_amount: product.unit_price || '' }));
    } else {
      setItems((current) => current.some((item) => item.variant_id === product.variant_id && item.product_id === product.product_id)
        ? current
        : [...current, { ...product, qty: 1 }]);
    }
    setProductQuery('');
    setProductSuggestions([]);
  };

  const subtotal = items.reduce((sum, item) => sum + (Number(item.unit_price) || 0) * (Number(item.qty) || 0), 0);
  const total = Math.max(0, subtotal + (Number(shipping) || 0) + (Number(tax) || 0) - (Number(discount) || 0));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = kind === 'reservation'
        ? { kind, customer, reservation: { ...reservation, quoted_amount: Number(reservation.quoted_amount) || 0, payment_method: reservation.payment_method || paymentMethod, shipping_method: reservation.shipping_method || shippingMethod, notes: reservation.notes || notes } }
        : { kind, customer, items: items.map((item) => ({ product_id: item.product_id, variant_id: item.variant_id || null, qty: Number(item.qty) || 1 })), payment_method: paymentMethod, payment_status: paymentStatus, shipping_method: shippingMethod, shipping: Number(shipping) || 0, tax: Number(tax) || 0, discount: Number(discount) || 0, notes };
      const result = await api.post('/api/admin/orders/manual', payload);
      onCreated(result);
    } catch (err) {
      setError(err.message || 'No se pudo registrar el pedido manual.');
    } finally { setSaving(false); }
  };

  return (
    <form className="manual-record-form" onSubmit={submit}>
      <div className="manual-record-tabs" role="tablist" aria-label="Tipo de registro">
        <button type="button" className={kind === 'order' ? 'is-active' : ''} onClick={() => setKind('order')}>Pedido / venta</button>
        <button type="button" className={kind === 'reservation' ? 'is-active' : ''} onClick={() => setKind('reservation')}>Reserva / alquiler</button>
      </div>
      <section className="manual-record-section">
        <div className="manual-record-section-heading"><h3>Cliente</h3><span>El correo busca leads y perfiles existentes.</span></div>
        <div className="manual-record-grid">
          <div className="form-group manual-typeahead"><label htmlFor="manual-customer-email">Correo electrónico</label><input id="manual-customer-email" className="input" type="email" required value={customer.email} onChange={(event) => { setCustomer((current) => ({ ...current, email: event.target.value })); setCustomerQuery(event.target.value); }} onFocus={() => setCustomerQuery(customer.email)} />
            {customerSuggestions.length > 0 && <div className="manual-suggestions">{customerSuggestions.map((profile) => <button type="button" key={`${profile.email}-${profile.reservation_id || 'account'}`} onClick={() => chooseCustomer(profile)}><strong>{profile.name || profile.email}</strong><small>{profile.email} · {profile.phone || 'Sin teléfono'}{profile.use_date ? ` · Uso ${String(profile.use_date).slice(0, 10)} → ${String(profile.use_end_date || profile.use_date).slice(0, 10)}` : ''}</small></button>)}</div>}
          </div>
          <div className="form-group"><label>Nombre completo</label><input className="input" required value={customer.name} onChange={(event) => setCustomer((current) => ({ ...current, name: event.target.value }))} /></div>
          <div className="form-group"><label>Teléfono</label><input className="input" type="tel" required value={customer.phone} onChange={(event) => setCustomer((current) => ({ ...current, phone: event.target.value }))} /></div>
          <div className="form-group"><label>Ciudad</label><input className="input" value={customer.city} onChange={(event) => setCustomer((current) => ({ ...current, city: event.target.value }))} /></div>
          <div className="form-group"><label>Dirección</label><input className="input" value={customer.address} onChange={(event) => setCustomer((current) => ({ ...current, address: event.target.value }))} /></div>
          <div className="form-group"><label>Departamento</label><input className="input" value={customer.department} onChange={(event) => setCustomer((current) => ({ ...current, department: event.target.value }))} /></div>
        </div>
      </section>

      <section className="manual-record-section">
        <div className="manual-record-section-heading"><h3>{kind === 'reservation' ? 'Traje y fechas' : 'Productos'}</h3><span>Busca por nombre o SKU.</span></div>
        <div className="form-group manual-typeahead"><label htmlFor="manual-product-search">Buscar en inventario</label><input id="manual-product-search" className="input" placeholder="Vestido, SKU…" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} />
          {productSuggestions.length > 0 && <div className="manual-suggestions">{productSuggestions.map((product) => <button type="button" key={`${product.product_id}-${product.variant_id || 'base'}`} onClick={() => chooseProduct(product)}><strong>{product.product_name}</strong><small>{product.combination || 'Producto estándar'} · {formatManualCOP(product.unit_price)} · {product.stock === null ? 'Sin variante' : `${product.stock} disponibles`}</small></button>)}</div>}
        </div>
        {kind === 'order' ? <div className="manual-item-list">{items.length === 0 ? <p className="form-hint">Todavía no agregaste productos.</p> : items.map((item) => <div className="manual-item-row" key={`${item.product_id}-${item.variant_id || 'base'}`}><div><strong>{item.product_name}</strong><small>{item.combination || 'Producto estándar'} · {formatManualCOP(item.unit_price)}</small></div><input className="input" type="number" min="1" max={item.stock || 99} value={item.qty} onChange={(event) => setItems((current) => current.map((currentItem) => currentItem === item ? { ...currentItem, qty: Math.max(1, Number(event.target.value) || 1) } : currentItem))} /><button className="btn btn-sm btn-danger" type="button" onClick={() => setItems((current) => current.filter((currentItem) => currentItem !== item))}>Quitar</button></div>)}</div> : <div className="manual-record-grid"><div className="form-group"><label>Tipo</label><select className="select" value={reservation.requested_type} onChange={(event) => setReservation((current) => ({ ...current, requested_type: event.target.value }))}><option value="alquiler">Alquiler</option><option value="alquiler_nuevo">Alquiler como nuevo</option></select></div><div className="form-group"><label>Inicio de uso</label><input className="input" type="date" required value={reservation.use_date} onChange={(event) => setReservation((current) => ({ ...current, use_date: event.target.value }))} /></div><div className="form-group"><label>Fin de uso</label><input className="input" type="date" required min={reservation.use_date || undefined} value={reservation.use_end_date} onChange={(event) => setReservation((current) => ({ ...current, use_end_date: event.target.value }))} /></div><div className="form-group"><label>Fecha de recogida</label><input className="input" type="date" required value={reservation.pickup_date} onChange={(event) => setReservation((current) => ({ ...current, pickup_date: event.target.value }))} /></div><div className="form-group"><label>Valor cotizado</label><input className="input" type="number" min="0" value={reservation.quoted_amount} onChange={(event) => setReservation((current) => ({ ...current, quoted_amount: event.target.value }))} /></div></div>}
      </section>

      <section className="manual-record-section">
        <div className="manual-record-section-heading"><h3>{kind === 'reservation' ? 'Asentamiento' : 'Pago y despacho'}</h3><span>Los datos quedan editables antes de guardar.</span></div>
        <div className="manual-record-grid">
          <div className="form-group"><label>Método de pago</label><select className="select" value={kind === 'reservation' ? reservation.payment_method : paymentMethod} onChange={(event) => kind === 'reservation' ? setReservation((current) => ({ ...current, payment_method: event.target.value })) : setPaymentMethod(event.target.value)}><option value="transferencia">Transferencia</option><option value="contraentrega">Contraentrega</option><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option><option value="otro">Otro</option></select></div>
          {kind === 'order' ? <><div className="form-group"><label>Estado del pago</label><select className="select" value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)}><option value="paid">Pagado</option><option value="pending">Pendiente</option></select></div><div className="form-group"><label>Método de envío</label><select className="select" value={shippingMethod} onChange={(event) => setShippingMethod(event.target.value)}><option value="recogida">Recogida en tienda</option><option value="domicilio">Domicilio</option><option value="mensajeria">Mensajería</option></select></div><div className="form-group"><label>Envío (COP)</label><input className="input" type="number" min="0" value={shipping} onChange={(event) => setShipping(event.target.value)} /></div><div className="form-group"><label>Descuento (COP)</label><input className="input" type="number" min="0" value={discount} onChange={(event) => setDiscount(event.target.value)} /></div></> : <><div className="form-group"><label>Estado de reserva</label><select className="select" value={reservation.status} onChange={(event) => setReservation((current) => ({ ...current, status: event.target.value }))}><option value="confirmed">Confirmada</option><option value="pending">Pendiente</option></select></div><div className="form-group"><label>Método de entrega</label><select className="select" value={reservation.shipping_method || shippingMethod} onChange={(event) => setReservation((current) => ({ ...current, shipping_method: event.target.value }))}><option value="recogida">Recogida en tienda</option><option value="domicilio">Domicilio</option></select></div></>}
        </div>
        {kind === 'order' && <div className="manual-record-total"><span>Subtotal {formatManualCOP(subtotal)} · Total</span><strong>{formatManualCOP(total)}</strong></div>}
        <div className="form-group"><label>Notas</label><textarea className="textarea" value={kind === 'reservation' ? reservation.notes : notes} onChange={(event) => kind === 'reservation' ? setReservation((current) => ({ ...current, notes: event.target.value })) : setNotes(event.target.value)} placeholder="Acuerdos del chat, ajustes de fechas, observaciones…" /></div>
      </section>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="manual-record-actions"><button className="btn" type="button" onClick={onCancel} disabled={saving}>Cancelar</button><button className="btn btn-primary" type="submit" disabled={saving || (kind === 'order' && items.length === 0) || (kind === 'reservation' && !reservation.product_id)}>{saving ? 'Guardando…' : kind === 'reservation' ? 'Registrar reserva' : 'Registrar pedido'}</button></div>
    </form>
  );
}

function hasMapLocation(location) {
  const lat = Number(location?.lat);
  const lon = Number(location?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon);
}

function OrderDetail({ order, loading, error }) {
  if (loading) return <div className="order-detail-loading"><span className="spinner" /> Cargando detalle del pedido…</div>;
  if (error) return <div className="alert alert-error order-detail-error" role="alert">{error}</div>;
  if (!order) return null;

  const shippingAddress = order.shipping_address && typeof order.shipping_address === 'object' ? order.shipping_address : {};
  const items = Array.isArray(order.items) ? order.items : [];
  const subtotal = Number(order.subtotal) || 0;
  const shipping = Number(order.shipping) || 0;
  const tax = Number(order.tax) || 0;
  const total = Number(order.total) || 0;
  const discount = Math.max(0, subtotal + shipping + tax - total);
  const hasLocation = hasMapLocation(order.shipping_location);
  const payment = order.payments?.[0];

  return (
    <div className="order-detail-panel">
      <div className="order-detail-heading">
        <div>
          <span className="eyebrow">Desglose de la transacción</span>
          <h2>{order.order_number}</h2>
        </div>
        <span className="badge">{STATUS_LABELS[order.status] || order.status}</span>
      </div>

      <div className="order-detail-grid">
        <section className="order-detail-card order-detail-items">
          <div className="order-detail-card-heading"><h3>Productos adquiridos</h3><span>{items.length} referencia{items.length === 1 ? '' : 's'}</span></div>
          <div className="order-items-list">
            {items.map((item) => (
              <div className="order-item-line" key={item.id}>
                <div className="order-item-copy">
                  <strong>{item.product_name}</strong>
                  <small>{item.variant_sku ? `SKU ${item.variant_sku}` : 'Variante estándar'}</small>
                </div>
                <span className="order-item-quantity">{item.quantity} ×</span>
                <span className="order-item-total">{formatCOP(item.line_total)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="order-detail-card order-detail-finance">
          <div className="order-detail-card-heading"><h3>Resumen financiero</h3><span>COP</span></div>
          <div className="order-finance-lines">
            <div><span>Subtotal</span><strong>{formatCOP(subtotal)}</strong></div>
            <div><span>Envío</span><strong>{formatCOP(shipping)}</strong></div>
            <div><span>Impuestos</span><strong>{formatCOP(tax)}</strong></div>
            <div><span>Descuentos</span><strong className="order-discount">− {formatCOP(discount)}</strong></div>
            <div className="order-finance-total"><span>Total</span><strong>{formatCOP(total)}</strong></div>
          </div>
        </section>

        <section className="order-detail-card order-detail-contact">
          <div className="order-detail-card-heading"><h3>Contacto y despacho</h3><span>Cliente</span></div>
          <dl className="order-contact-list">
            <div><dt>Nombre</dt><dd>{order.customer_name || '—'}</dd></div>
            <div><dt>Correo</dt><dd>{order.customer_email || '—'}</dd></div>
            <div><dt>Teléfono</dt><dd>{order.customer_phone || '—'}</dd></div>
            <div><dt>Departamento</dt><dd>{shippingAddress.department || '—'}</dd></div>
            <div><dt>Ciudad / municipio</dt><dd>{shippingAddress.city || '—'}</dd></div>
            <div><dt>Dirección</dt><dd>{shippingAddress.address || '—'}</dd></div>
            <div><dt>Método de pago</dt><dd>{payment?.payment_method || '—'}</dd></div>
            <div><dt>Método de envío</dt><dd>{shippingAddress.shipping_method || '—'}</dd></div>
            <div className="order-contact-notes"><dt>Notas</dt><dd>{order.notes || shippingAddress.notes || '—'}</dd></div>
          </dl>
        </section>

        <section className="order-detail-card order-detail-map-card">
          <div className="order-detail-card-heading"><h3>Ubicación de entrega</h3><span>Geolocalización</span></div>
          {hasLocation ? (
            <>
              <OrderLocationMap location={order.shipping_location} orderNumber={order.order_number} />
              <a className="order-map-link" href={`https://www.openstreetmap.org/?mlat=${order.shipping_location.lat}&mlon=${order.shipping_location.lon}#map=16/${order.shipping_location.lat}/${order.shipping_location.lon}`} target="_blank" rel="noreferrer">Abrir mapa completo ↗</a>
            </>
          ) : (
            <div className="order-map-empty"><span aria-hidden="true">⌖</span><strong>No se pudo ubicar la dirección</strong><small>Verifica la dirección y ciudad registradas en el pedido.</small></div>
          )}
        </section>
      </div>
    </div>
  );
}
