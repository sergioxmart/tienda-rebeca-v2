import { useState, useEffect } from 'react';
import { Link, NavLink, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { api, setAccessToken, getAccessToken, refreshSession } from './api.js';
import { useIdleSession } from './hooks/useIdleSession.js';
import { useMe } from './hooks/useMe.js';
import Brand from './components/Brand.jsx';
import Home from './pages/Home.jsx';
import Settings from './pages/Settings.jsx';
import Collections from './pages/Collections.jsx';
import Products from './pages/Products.jsx';
import Media from './pages/Media.jsx';
import PageBuilder from './pages/PageBuilder.jsx';
import SiteConfig from './pages/SiteConfig.jsx';
import Reservations from './pages/Reservations.jsx';
import Closures from './pages/Closures.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Inventory from './pages/Inventory.jsx';
import Sales from './pages/Sales.jsx';
import Cash from './pages/Cash.jsx';
import Users from './pages/Users.jsx';
import { canRead, isLinkVisible, canWrite } from './lib/permissions.js';

function SidebarIcon({ name }) {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    collections: <><path d="m12 3 8 4-8 4-8-4 8-4Z" /><path d="m4 12 8 4 8-4" /><path d="m4 16 8 4 8-4" /></>,
    products: <><path d="M6 8h12l1 12H5L6 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></>,
    media: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m4 18 5-5 3 3 3-3 5 5" /></>,
    page: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11" /></>,
    settings: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="2" /><circle cx="15" cy="17" r="2" /></>,
    reservations: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18" /><path d="m8 15 2 2 5-5" /></>,
    closures: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><path d="M12 14v3" /></>,
    inventory: <><path d="m12 3 9 4-9 4-9-4 9-4Z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" /></>,
    sales: <><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2 3h3l2.4 12.2a1.6 1.6 0 0 0 1.6 1.3h8.6a1.6 1.6 0 0 0 1.6-1.3L21 8H6" /></>,
    cash: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 10v4M18 10v4" /></>,
  };
  return <svg className="sb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loginStep, setLoginStep] = useState('credentials');
  const [setup, setSetup] = useState(null);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const [site, setSite] = useState(null);
  const [bgReady, setBgReady] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);

  // Si ya hay access token, saltar al home
  useEffect(() => {
    if (getAccessToken()) navigate('/admin', { replace: true });
  }, [navigate]);

  // Cargar site_config para mostrar el logo y el fondo del login
  useEffect(() => {
    fetch('/api/public/site-config').then((r) => r.json()).then((d) => {
      if (d.ok) setSite(d.data);
    }).catch(() => {});
  }, []);

  // Precargar el fondo: si el archivo no existe o falla, nos quedamos con
  // el gradiente default en vez de mostrar un overlay oscuro sobre nada.
  const bg = site?.admin_login_bg_url;
  useEffect(() => {
    if (!bg) { setBgReady(false); return; }
    let alive = true;
    const img = new Image();
    img.onload = () => alive && setBgReady(true);
    img.onerror = () => alive && setBgReady(false);
    img.src = bg;
    return () => { alive = false; };
  }, [bg]);

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    setNotice('');
    setPending(true);
    if (loginStep === 'setup') {
      const r = await api('/api/auth/2fa/confirm', { method: 'POST', body: { setup_token: setup?.setup_token, code: twoFactorCode } });
      setPending(false);
      if (r.ok) {
        setAccessToken(r.data.data.access_token);
        navigate('/admin', { replace: true });
      } else setErr(r.data?.error === 'invalid_two_factor_code' ? 'El código no es válido.' : (r.data?.error || 'No se pudo activar el 2FA'));
      return;
    }
    if (loginStep === 'recovery') {
      const r = await api('/api/auth/recover-password', { method: 'POST', body: { email, new_password: newPassword, two_factor_code: twoFactorCode } });
      setPending(false);
      if (r.ok) {
        setLoginStep('credentials');
        setPassword(''); setNewPassword(''); setTwoFactorCode('');
        setNotice('Contraseña actualizada. Ahora puedes iniciar sesión.');
      } else setErr(r.data?.error === 'invalid_recovery_credentials' ? 'Los datos de recuperación no son válidos.' : (r.data?.error || 'No se pudo recuperar la contraseña'));
      return;
    }
    const r = await api('/api/auth/login', {
      method: 'POST',
      body: { email, password, two_factor_code: loginStep === 'two_factor' ? twoFactorCode : undefined },
    });
    setPending(false);
    if (r.ok) {
      if (r.data.data.requires_2fa_setup) {
        setSetup(r.data.data); setTwoFactorCode(''); setLoginStep('setup');
      } else {
        setAccessToken(r.data.data.access_token);
        navigate('/admin', { replace: true });
      }
    } else {
      if (r.data?.error === 'two_factor_required') {
        setTwoFactorCode(''); setLoginStep('two_factor');
      } else setErr(r.data?.error || 'Error al iniciar sesión');
    }
  }

  function returnToCredentials() {
    setErr(''); setNotice(''); setTwoFactorCode(''); setSetup(null); setLoginStep('credentials');
  }

  const logo = site?.logo_url;
  const showLogo = logo && !logoBroken;
  const siteName = site?.site_name || 'REBECA';
  const hasBg = !!bg && bgReady;

  return (
    <div
      className={`login-page${hasBg ? ' has-bg' : ''}`}
      style={hasBg ? { backgroundImage: `url(${bg})` } : {}}
    >
      {hasBg && <div className="login-overlay" />}
      <form className="login-card" onSubmit={onSubmit} style={{ position: 'relative', zIndex: 2 }}>
        <div className="login-brand">
          {showLogo ? (
            <img src={logo} alt={siteName} className="login-brand-logo" onError={() => setLogoBroken(true)} />
          ) : (
            <>
              <div className="login-brand-mark">{siteName[0]}</div>
              <h1>{siteName}</h1>
            </>
          )}
          <div className="login-divider" />
        </div>
        <p className="sub">{loginStep === 'setup' ? 'Configura tu autenticador' : loginStep === 'recovery' ? 'Recupera tu contraseña' : 'Panel de administración'}</p>
        {err && <div className="err">{err}</div>}
        {notice && <div className="ok">{notice}</div>}
        {loginStep === 'setup' ? <>
          <p className="form-hint">Escanea este código con Google Authenticator, Authy o 1Password. Luego escribe el código de seis dígitos para confirmarlo.</p>
          {setup?.otpauth_uri && <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}><QRCodeSVG value={setup.otpauth_uri} size={180} /></div>}
          <div className="field"><label>Código de autenticación</label><input value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" required autoFocus /></div>
        </> : loginStep === 'recovery' ? <>
          <div className="field"><label>Email de la primera cuenta admin</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></div>
          <div className="field"><label>Código de autenticación</label><input value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" required /></div>
          <div className="field"><label>Nueva contraseña</label><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength="8" required /></div>
        </> : loginStep === 'credentials' ? <>
          <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="rebeca@example.com" required autoFocus /></div>
          <div className="field"><label>Contraseña</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        </> : <>
          <div className="field"><label>Código de autenticación</label><input value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" required autoFocus /></div>
          <div className="field" style={{ marginTop: -8, color: 'var(--gray-500)', fontSize: 13 }}>{email}</div>
        </>}
        <button className="btn" type="submit" disabled={pending} style={{ width: '100%', marginTop: 8 }}>
          {pending ? 'Procesando…' : loginStep === 'setup' ? 'Activar autenticador' : loginStep === 'recovery' ? 'Restablecer contraseña' : loginStep === 'two_factor' ? 'Verificar código' : 'Siguiente'}
        </button>
        {loginStep === 'credentials' && <button type="button" className="row-btn" onClick={() => { setErr(''); setNotice(''); setTwoFactorCode(''); setLoginStep('recovery'); }} style={{ display: 'block', margin: '14px auto 0' }}>¿Olvidaste tu contraseña?</button>}
        {loginStep === 'two_factor' && <button type="button" className="row-btn" onClick={returnToCredentials} style={{ display: 'block', margin: '14px auto 0' }}>Volver</button>}
        {(loginStep === 'recovery' || loginStep === 'setup') && <button type="button" className="row-btn" onClick={returnToCredentials} style={{ display: 'block', margin: '14px auto 0' }}>Cancelar</button>}
      </form>
    </div>
  );
}

function useLogout() {
  const navigate = useNavigate();
  return async function logout() {
    await api('/api/auth/logout', { method: 'POST' });
    setAccessToken(null);
    navigate('/login', { replace: true });
  };
}

// Los dos supermódulos. Cada uno manda en su propio menú lateral.
// `section` mapea cada link a la sección lógica para filtrar por rol.
const SECTIONS = {
  general: {
    label: 'Gestión General',
    links: [
      { to: '/admin/general',            end: true, section: 'dashboard',    label: 'Dashboard', icon: 'dashboard' },
      { to: '/admin/general/inventario', section: 'inventory',    label: 'Inventario', icon: 'inventory' },
      { to: '/admin/general/colecciones', section: 'collections', label: 'Colecciones', icon: 'collections' },
      { to: '/admin/general/ventas',     section: 'sales',        label: 'Ventas',     icon: 'sales' },
      { to: '/admin/general/caja',       section: 'cash',         label: 'Caja',       icon: 'cash' },
      { to: '/admin/general/cierres',    section: 'closures',    label: 'Cierres',    icon: 'closures' },
      { to: '/admin/general/reservas',   section: 'reservations', label: 'Reservas',   icon: 'reservations' },
    ],
  },
  tienda: {
    label: 'Gestión Tienda',
    links: [
      { to: '/admin/tienda/colecciones', section: 'collections',  label: 'Colecciones',   icon: 'collections' },
      { to: '/admin/tienda/productos',   section: 'products',     label: 'Productos',     icon: 'products' },
      { to: '/admin/tienda/config',      section: 'site_config',  label: 'Configuración', icon: 'settings' },
      { to: '/admin/tienda/pagina',      section: 'modules',      label: 'Página',        icon: 'page' },
      { to: '/admin/tienda/media',       section: 'media',        label: 'Media',         icon: 'media' },
    ],
  },
};

// Layout del Home: solo topbar, sin menú lateral.
function HomeLayout({ title }) {
  const me = useMe();
  const logout = useLogout();
  useIdleSession();
  const role = me?.role;
  const canSeeAjustes = canRead('size_systems', role);
  const canSeeUsuarios = canRead('users', role);

  return (
    <div className="home-layout">
      <header className="topbar">
        <Link to="/admin" className="topbar-brand"><Brand /></Link>
        <h1 className="topbar-title">{title}</h1>
        <nav className="topbar-actions">
          {canSeeAjustes && (
          <NavLink to="/admin/ajustes" className="topbar-action">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M19.9 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.1a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-2.9-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3.5a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.1-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 2.9 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.1a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.4 1Z" />
            </svg>
            <span>Ajustes</span>
          </NavLink>
          )}
          {canSeeUsuarios && (
            <NavLink to="/admin/usuarios" className="topbar-action">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.9" />
                <path d="M16 3.1a4 4 0 0 1 0 7.8" />
              </svg>
              <span>Usuarios</span>
            </NavLink>
          )}
          <button className="topbar-action" onClick={logout}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="m16 17 5-5-5-5" /><path d="M21 12H9" />
            </svg>
            <span>Cerrar sesión</span>
          </button>
        </nav>
      </header>
      <main className="home-content"><Outlet /></main>
    </div>
  );
}

// Layout de los supermódulos: el mismo menú lateral de siempre, pero con los
// links de su sección.
function ModuleLayout({ section }) {
  const me = useMe();
  const logout = useLogout();
  useIdleSession();

  const { label, links: allLinks } = SECTIONS[section];
  // Filtrar links según rol: operator y viewer no ven secciones donde no
  // pueden ni siquiera leer. Si `me` aún no llegó, mostramos todos (la
  // transición queda mejor que esconder el sidebar entero).
  const role = me?.role;
  const links = role ? allLinks.filter((l) => l.section === 'dashboard' || canRead(l.section, role)) : allLinks;
  const initial = (me?.name || me?.email || 'R').slice(0, 1).toUpperCase();

  return (
    <div className="layout">
      <aside className="sb">
        {/* La cabecera es el camino de vuelta al Home. */}
        <Link to="/admin" className="sb-head">
          <div className="sb-mark">R</div>
          <div>
            <div className="sb-name">{label}</div>
            <div className="sb-sub">← Volver al inicio</div>
          </div>
        </Link>
        <div className="sb-body">
          <SidebarGroup links={links} />
          {/* En mobile el .sb-foot se oculta; dejamos un botón compacto
              al final de la barra horizontal de links. */}
          <button className="sb-logout-mobile" type="button" onClick={logout} title="Cerrar sesión" aria-label="Cerrar sesión">
            <svg className="sb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="m16 17 5-5-5-5" /><path d="M21 12H9" />
            </svg>
            <span>Cerrar sesión</span>
          </button>
        </div>
        {me && (
          <div className="sb-foot">
            <div className="sb-avatar">{initial}</div>
            <div className="sb-user">
              <div className="sb-user-name">{me.name || 'Admin'}</div>
              <div className="sb-user-email">{me.email}</div>
            </div>
            <button className="sb-logout" onClick={logout} title="Cerrar sesión">⏻</button>
          </div>
        )}
      </aside>
      <main className="content"><Outlet /></main>
    </div>
  );
}

function SidebarGroup({ label, links }) {
  return (
    <div className="sb-group">
      {label && <div className="sb-group-label">{label}</div>}
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.end}
          className={({ isActive }) => 'sb-link' + (isActive ? ' sb-active' : '')}
        >
          <SidebarIcon name={l.icon} />
          <span>{l.label}</span>
        </NavLink>
      ))}
    </div>
  );
}

function Protected({ children }) {
  const navigate = useNavigate();
  const [state, setState] = useState('loading');

  useEffect(() => {
    if (getAccessToken()) {
      // Tenemos token, verificarlo
      api('/api/auth/me').then((r) => {
        if (r.ok) setState('ok');
        else { setAccessToken(null); navigate('/login', { replace: true }); }
      });
    } else {
      // Sin token, intentar refresh (deduplicado: ver refreshSession en api.js)
      refreshSession().then((r) => {
        if (r.ok) {
          setAccessToken(r.data.data.access_token);
          setState('ok');
        } else {
          navigate('/login', { replace: true });
        }
      });
    }
  }, [navigate]);

  if (state === 'loading') {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-500)' }}>Cargando…</div>;
  }
  return children;
}

// Módulos que llegan en las fases siguientes.
function Soon({ title }) {
  return (
    <div>
      <h1>{title}</h1>
      <p className="sub">Próximamente</p>
      <div className="placeholder-card">Este módulo se construye en una fase posterior.</div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Home: sin menú lateral */}
      <Route element={<Protected><HomeLayout title="Home" /></Protected>}>
        <Route path="/admin" element={<Home />} />
      </Route>
      <Route element={<Protected><HomeLayout title="Ajustes" /></Protected>}>
        <Route path="/admin/ajustes" element={<Settings />} />
      </Route>
      <Route element={<Protected><HomeLayout title="Usuarios" /></Protected>}>
        <Route path="/admin/usuarios" element={<Users />} />
      </Route>

      {/* Gestión General */}
      <Route element={<Protected><ModuleLayout section="general" /></Protected>}>
        <Route path="/admin/general"            element={<Dashboard />} />
        <Route path="/admin/general/inventario" element={<Inventory />} />
        <Route path="/admin/general/colecciones" element={<Collections view="general" />} />
        <Route path="/admin/general/ventas"     element={<Sales />} />
        <Route path="/admin/general/caja"       element={<Cash />} />
        <Route path="/admin/general/cierres"    element={<Closures />} />
        <Route path="/admin/general/reservas"   element={<Reservations />} />
      </Route>

      {/* Gestión Tienda */}
      <Route element={<Protected><ModuleLayout section="tienda" /></Protected>}>
        <Route path="/admin/tienda/colecciones" element={<Collections />} />
        <Route path="/admin/tienda/productos"   element={<Products />} />
        <Route path="/admin/tienda/config"      element={<SiteConfig />} />
        <Route path="/admin/tienda/pagina"      element={<PageBuilder />} />
        <Route path="/admin/tienda/media"       element={<Media />} />
      </Route>

      {/* Rutas viejas: Rebeca tiene bookmarks, no se los rompemos. */}
      <Route path="/admin/colecciones" element={<Navigate to="/admin/tienda/colecciones" replace />} />
      <Route path="/admin/productos"   element={<Navigate to="/admin/tienda/productos"   replace />} />
      <Route path="/admin/media"       element={<Navigate to="/admin/tienda/media"       replace />} />
      <Route path="/admin/pagina"      element={<Navigate to="/admin/tienda/pagina"      replace />} />
      <Route path="/admin/config"      element={<Navigate to="/admin/tienda/config"      replace />} />
      <Route path="/admin/reservas"    element={<Navigate to="/admin/general/reservas"   replace />} />
      <Route path="/admin/cierres"     element={<Navigate to="/admin/general/cierres"    replace />} />

      <Route path="*" element={<Login />} />
    </Routes>
  );
}
