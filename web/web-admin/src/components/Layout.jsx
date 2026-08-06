// Layout del admin autenticado: sidebar + header + outlet de React Router.

import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

const NAV = [
  { to: '/',            label: 'Dashboard' },
  { to: '/products',    label: 'Productos' },
  { to: '/categories',  label: 'Categorías' },
  { to: '/attributes',  label: 'Atributos' },
  { to: '/media',       label: 'Imágenes' },
  { to: '/site-config', label: 'Configuración' },
  { to: '/users',       label: 'Usuarios' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>TechStore</h1>
        <nav>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <header className="header">
        <div />
        <div className="user">
          <span>{user?.email} · {user?.role}</span>
          <button className="btn btn-sm" onClick={handleLogout}>Cerrar sesión</button>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
