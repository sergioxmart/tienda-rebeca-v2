// Rutas del admin. Envuelve con RequireAuth para todo lo que requiere sesión.

import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Products from './pages/Products.jsx';
import ProductForm from './pages/ProductForm.jsx';
import Categories from './pages/Categories.jsx';
import Attributes from './pages/Attributes.jsx';
import Media from './pages/Media.jsx';
import SiteConfig from './pages/SiteConfig.jsx';
import Users from './pages/Users.jsx';
import PageBuilder from './pages/PageBuilder.jsx';
import Themes from './pages/Themes.jsx';

function RequireAuth({ children }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="spinner" />
      </div>
    );
  }
  if (status !== 'auth') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}

function RedirectIfAuth({ children }) {
  const { status } = useAuth();
  if (status === 'loading') return null;
  if (status === 'auth') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<RedirectIfAuth><Login /></RedirectIfAuth>} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/products" element={<Products />} />
        <Route path="/products/new" element={<ProductForm />} />
        <Route path="/products/:id" element={<ProductForm />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/attributes" element={<Attributes />} />
        <Route path="/media" element={<Media />} />
        <Route path="/site-config" element={<SiteConfig />} />
        <Route path="/users" element={<Users />} />
        <Route path="/builder" element={<PageBuilder />} />
        <Route path="/themes" element={<Themes />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
