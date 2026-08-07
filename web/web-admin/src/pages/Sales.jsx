import React, { useEffect, useState } from 'react';
import Empty from '../components/Empty.jsx';
import { api } from '../api.js';

function formatCOP(value) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(value) || 0);
}

export default function Sales() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.get('/api/admin/sales')
      .then((data) => { if (active) setSales(data.data || data.sales || []); })
      .catch((err) => { if (active) setError(err.message || 'No se pudieron cargar las ventas.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <div>
      <div className="page-header"><div><h1>Ventas</h1><p className="form-hint">Historial de ventas registradas.</p></div></div>
      {loading ? <div className="center"><span className="spinner" /></div> : error ? (
        <div className="alert alert-error" role="alert">{error}</div>
      ) : sales.length === 0 ? (
        <Empty title="Sin ventas" description="Las ventas registradas aparecerán aquí." />
      ) : (
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>ID</th><th>Fecha</th><th>Método de pago</th><th>Estado</th><th>Total</th></tr></thead>
          <tbody>{sales.map((sale) => (
            <tr key={sale.id}><td><strong>#{sale.id}</strong></td><td>{new Date(sale.sold_at || sale.created_at).toLocaleString('es-CO')}</td><td>{sale.payment_method || '—'}</td><td><span className="badge">{sale.status || '—'}</span></td><td>{formatCOP(sale.total)}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}
