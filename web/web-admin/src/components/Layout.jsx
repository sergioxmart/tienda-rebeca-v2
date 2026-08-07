// Layout del admin autenticado: sidebar + header + outlet de React Router.

import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

const NAV_GROUPS = [
  {
    label: 'Operación',
    items: [
      { to: '/', label: 'Resumen', icon: 'dashboard' },
      { to: '/products', label: 'Productos', icon: 'box' },
      { to: '/inventory', label: 'Inventario', icon: 'inventory' },
      { to: '/categories', label: 'Categorías', icon: 'folder' },
      { to: '/attributes', label: 'Atributos', icon: 'tag' },
      { to: '/media', label: 'Imágenes', icon: 'image' },
    ],
  },
  {
    label: 'Sitio web',
    items: [
      { to: '/builder', label: 'Constructor', icon: 'layout' },
      { to: '/themes', label: 'Temas', icon: 'sparkles' },
      { to: '/site-config', label: 'Configuración', icon: 'settings' },
    ],
  },
  {
    label: 'Administración',
    items: [{ to: '/users', label: 'Usuarios', icon: 'users' }],
  },
];

function Icon({ name }) {
  const paths = {
    dashboard: 'M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z',
    box: 'm12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 9 8-4.5M12 12v9M4 7.5 12 12',
    inventory: 'M5 5h14v14H5V5Zm3 3h8M8 12h8M8 16h5',
    folder: 'M3 6.5h7l2 2h9v9.5H3V6.5Zm0 0V5h6l2 2',
    tag: 'm20 13-7 7-9-9V4h7l9 9ZM7.5 8.5h.01',
    image: 'M4 5h16v14H4V5Zm1 12 4-4 3 3 2-2 5 5M15.5 9a1.5 1.5 0 1 0 0-.01',
    layout: 'M4 5h16v14H4V5Zm0 4h16M10 9v10',
    sparkles: 'm12 3 1.2 4.8L18 9l-4.8 1.2L12 15l-1.2-4.8L6 9l4.8-1.2L12 3ZM19 15l.6 2.4L22 18l-2.4.6L19 21l-.6-2.4L16 18l2.4-.6L19 15Z',
    settings: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm0-5 1 .2.7 2.1 1.5.6 2-1.1 1.5 1.5-1.1 2 .6 1.5 2.1.7.7-.2 1-2.1.7-.6 1.5 1.1 2-1.5 1.5-2-1.1-1.5.6-.7 2.1-1-.2-1-.7-.7-2.1-1.5-.6-2 1.1-1.5-1.5 1.1-2-.6-1.5-2.1-.7-.7.2-1Z',
    users: 'M16 20v-1.5a3.5 3.5 0 0 0-7 0V20m3.5-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm4-5a2.5 2.5 0 0 1 0 4.8M19 20v-1a3 3 0 0 0-2-2.8',
  };

  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [site, setSite] = useState({ site_name: 'TechStore', logo_url: null });

  useEffect(() => {
    let active = true;
    fetch('/api/public/site-config')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (active && data?.config) setSite({
          site_name: data.config.site_name || 'TechStore',
          logo_url: data.config.logo_url || null,
        });
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">
            {site.logo_url ? <img src={site.logo_url} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : String(site.site_name || 'TechStore').slice(0, 1).toUpperCase()}
          </span>
          <span className="brand-copy">
            <strong>{site.site_name}</strong>
            <small>Panel de administración</small>
          </span>
        </div>
        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              {group.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => (isActive ? 'active' : undefined)}>
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="user-avatar">{(user?.email || 'A').slice(0, 1).toUpperCase()}</span>
            <span className="sidebar-user-copy"><strong>{user?.email || 'Administrador'}</strong><small>{user?.role || 'admin'}</small></span>
          </div>
          <button className="sidebar-logout" onClick={handleLogout}><span aria-hidden="true">↪</span> Cerrar sesión</button>
        </div>
      </aside>
      <header className="header">
        <div className="header-context"><span className="header-kicker">TechStore</span><span>Panel de administración</span></div>
        <div className="user">
          <span className="role-pill">{user?.role || 'admin'}</span>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
