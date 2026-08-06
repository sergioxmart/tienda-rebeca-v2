import { Link } from 'react-router-dom';
import { useDashboardStats } from '../hooks/useDashboardStats.js';
import { fmtDate, humanSize } from '../lib/format.js';

export default function Dashboard() {
  const { stats, err, loading } = useDashboardStats();

  if (err) {
    return (
      <div>
        <h1>Dashboard</h1>
        <p className="sub">Resumen general del negocio</p>
        <div className="placeholder-card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>{err}</div>
      </div>
    );
  }
  if (loading || !stats) return <div style={{ padding: 40, color: 'var(--gray-500)' }}>Cargando…</div>;

  const {
    products, media, publishedProducts, featured, pending, confirmed,
    mediaBytes, orphans, upcomingClosures, nextConfirmed,
  } = stats;

  return (
    <div>
      <h1>Dashboard</h1>
      <p className="sub">Resumen general del negocio</p>

      <div className="stat-grid">
        <Link to="/admin/tienda/productos" className="stat-card">
          <div className="stat-value">{publishedProducts.length}<span className="stat-unit"> / {products.length}</span></div>
          <div className="stat-label">Productos publicados</div>
          <div className="stat-hint">{featured.length} destacado{featured.length === 1 ? '' : 's'} en el carrusel</div>
        </Link>
        <Link to="/admin/general/reservas" className="stat-card">
          <div className="stat-value" style={pending.length > 0 ? { color: 'var(--gold)' } : {}}>{pending.length}</div>
          <div className="stat-label">Reservas pendientes</div>
          <div className="stat-hint">{confirmed.length} confirmada{confirmed.length === 1 ? '' : 's'}</div>
        </Link>
        <Link to="/admin/tienda/media" className="stat-card">
          <div className="stat-value">{media.length}</div>
          <div className="stat-label">Archivos de media</div>
          <div className="stat-hint">{humanSize(mediaBytes)} · {orphans.length} huérfana{orphans.length === 1 ? '' : 's'}</div>
        </Link>
        <Link to="/admin/general/cierres" className="stat-card">
          <div className="stat-value">{upcomingClosures.length}</div>
          <div className="stat-label">Cierres próximos</div>
          <div className="stat-hint">
            {upcomingClosures[0]
              ? `Próximo: ${fmtDate(upcomingClosures[0].start_date)}`
              : 'Abierto según horarios default'}
          </div>
        </Link>
      </div>

      <div className="dash-cols">
        <div className="dash-panel">
          <h2>
            Reservas pendientes
            <Link to="/admin/general/reservas">Ver kanban →</Link>
          </h2>
          {pending.length === 0 ? (
            <p className="dash-empty">Ninguna. Cuando una clienta llene el formulario, aparece aquí.</p>
          ) : (
            <ul className="dash-list">
              {pending.slice(0, 6).map((r) => (
                <li key={r.id}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{r.product_name}</div>
                    <div className="muted">{r.client_name}{r.size_label ? ` · Talla ${r.size_label}` : ''}</div>
                  </div>
                  <span style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                    {fmtDate(r.start_date)}{r.start_date !== r.end_date ? ` → ${fmtDate(r.end_date)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="dash-panel">
          <h2>
            Próximas entregas confirmadas
            <Link to="/admin/general/reservas">Ver todas →</Link>
          </h2>
          {nextConfirmed.length === 0 ? (
            <p className="dash-empty">Sin reservas confirmadas próximas.</p>
          ) : (
            <ul className="dash-list">
              {nextConfirmed.map((r) => (
                <li key={r.id}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{r.product_name}</div>
                    <div className="muted">{r.client_name}</div>
                  </div>
                  <span style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                    {fmtDate(r.start_date)}{r.start_date !== r.end_date ? ` → ${fmtDate(r.end_date)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
