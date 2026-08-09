import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import OrderLocationMap from '../components/OrderLocationMap.jsx';
import Empty from '../components/Empty.jsx';

function formatCOP(value) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(value) || 0);
}

const STATUS_LABELS = {
  pending: 'Pendiente', paid: 'Pagado', processing: 'En preparación',
  shipped: 'Enviado', delivered: 'Entregado', cancelled: 'Cancelado', expired: 'Expirado', refunded: 'Reembolsado',
};

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [details, setDetails] = useState({});
  const [detailLoading, setDetailLoading] = useState({});
  const [detailErrors, setDetailErrors] = useState({});

  useEffect(() => {
    let active = true;
    api.get('/api/admin/orders')
      .then((data) => { if (active) setOrders(data.orders || []); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

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
      <div className="page-header"><div><h1>Pedidos</h1><p className="form-hint">Pedidos recibidos desde la tienda.</p></div></div>
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
    </div>
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
