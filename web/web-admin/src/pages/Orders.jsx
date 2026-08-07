import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import Empty from '../components/Empty.jsx';

function formatCOP(value) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(value) || 0);
}

const STATUS_LABELS = {
  pending: 'Pendiente', paid: 'Pagado', processing: 'En preparación',
  shipped: 'Enviado', delivered: 'Entregado', cancelled: 'Cancelado', refunded: 'Reembolsado',
};

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.get('/api/admin/orders')
      .then((data) => { if (active) setOrders(data.orders || []); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <div>
      <div className="page-header"><div><h1>Pedidos</h1><p className="form-hint">Pedidos recibidos desde la tienda.</p></div></div>
      {loading ? <div className="center"><span className="spinner" /></div> : orders.length === 0 ? (
        <Empty title="Sin pedidos" description="Los pedidos nuevos aparecerán aquí." />
      ) : (
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Pedido</th><th>Cliente</th><th>Estado</th><th>Artículos</th><th>Total</th><th>Fecha</th></tr></thead>
          <tbody>{orders.map((order) => (
            <tr key={order.id}>
              <td><strong>{order.order_number}</strong></td>
              <td>{order.customer_name || order.customer_email}</td>
              <td><span className="badge">{STATUS_LABELS[order.status] || order.status}</span></td>
              <td>{order.item_count}</td>
              <td>{formatCOP(order.total)}</td>
              <td>{new Date(order.created_at).toLocaleString('es-CO')}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}
