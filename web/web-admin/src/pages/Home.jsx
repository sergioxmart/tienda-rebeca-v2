// Home del panel: mini dashboard + las dos puertas de entrada a los
// supermódulos. Es la pantalla de aterrizaje tras el login.

import { Link, useNavigate } from 'react-router-dom';
import { useDashboardStats } from '../hooks/useDashboardStats.js';
import { fmtDate } from '../lib/format.js';

function SuperIcon({ name }) {
  const paths = {
    general: (
      <>
        <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
        <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
        <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
        <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" />
      </>
    ),
    tienda: (
      <>
        <path d="M5 8h14l1 12H4L5 8Z" />
        <path d="M8.5 8V6a3.5 3.5 0 0 1 7 0v2" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function SuperCard({ icon, title, desc, to }) {
  const navigate = useNavigate();
  return (
    <section className="super-card">
      <div className="super-art"><SuperIcon name={icon} /></div>
      <h2>{title}</h2>
      <p>{desc}</p>
      {/* Cambio de pestaña dentro de la misma ventana, no una nueva. */}
      <button className="btn" onClick={() => navigate(to)}>
        Ir al panel <span aria-hidden="true">→</span>
      </button>
    </section>
  );
}

function MiniRow({ label, value, hint, to, accent }) {
  return (
    <Link to={to} className="mini-row">
      <div className="mini-main">
        <div className="mini-label">{label}</div>
        {hint && <div className="mini-hint">{hint}</div>}
      </div>
      <div className="mini-value" style={accent ? { color: 'var(--gold)' } : undefined}>{value}</div>
    </Link>
  );
}

export default function Home() {
  const { stats, err, loading } = useDashboardStats();

  return (
    <div className="home-grid">
      <section className="mini-dash">
        <header>
          <h2>Mini Dashboard</h2>
          <Link to="/admin/general">Ver dashboard completo →</Link>
        </header>

        {err && <div className="mini-state err">{err}</div>}
        {loading && <div className="mini-state">Cargando…</div>}

        {stats && (
          <div className="mini-rows">
            <MiniRow
              label="Productos publicados"
              hint={`${stats.featured.length} destacado${stats.featured.length === 1 ? '' : 's'} en el carrusel`}
              value={`${stats.publishedProducts.length} / ${stats.products.length}`}
              to="/admin/tienda/productos"
            />
            <MiniRow
              label="Reservas pendientes"
              hint={`${stats.confirmed.length} confirmada${stats.confirmed.length === 1 ? '' : 's'}`}
              value={stats.pending.length}
              accent={stats.pending.length > 0}
              to="/admin/general/reservas"
            />
            <MiniRow
              label="Cierres próximos"
              hint={stats.upcomingClosures[0]
                ? `Próximo: ${fmtDate(stats.upcomingClosures[0].start_date)}`
                : 'Abierto según horarios default'}
              value={stats.upcomingClosures.length}
              to="/admin/general/cierres"
            />
            <MiniRow
              label="Archivos de media"
              hint={`${stats.orphans.length} huérfana${stats.orphans.length === 1 ? '' : 's'}`}
              value={stats.media.length}
              to="/admin/tienda/media"
            />
          </div>
        )}
      </section>

      <div className="home-supers">
        <SuperCard
          icon="general"
          title="Gestión General"
          desc="Dashboard, inventario, ventas, caja, cierres y reservas"
          to="/admin/general"
        />
        <SuperCard
          icon="tienda"
          title="Gestión Tienda"
          desc="Colecciones, productos, página, media y configuración"
          to="/admin/tienda/colecciones"
        />
      </div>
    </div>
  );
}
