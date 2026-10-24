// Rutas del admin. Envuelve con RequireAuth para todo lo que requiere sesión.

import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import Layout from './components/Layout.jsx';
const Login = React.lazy(() => import('./pages/Login.jsx'));
const Dashboard = React.lazy(() => import('./pages/Dashboard.jsx'));
const Products = React.lazy(() => import('./pages/Products.jsx'));
const ProductForm = React.lazy(() => import('./pages/ProductForm.jsx'));
const Categories = React.lazy(() => import('./pages/Categories.jsx'));
const Attributes = React.lazy(() => import('./pages/Attributes.jsx'));
const Media = React.lazy(() => import('./pages/Media.jsx'));
const SiteConfig = React.lazy(() => import('./pages/SiteConfig.jsx'));
const Users = React.lazy(() => import('./pages/Users.jsx'));
const PageBuilder = React.lazy(() => import('./pages/PageBuilder.jsx'));
const Themes = React.lazy(() => import('./pages/Themes.jsx'));
const Inventory = React.lazy(() => import('./pages/Inventory.jsx'));
const Orders = React.lazy(() => import('./pages/Orders.jsx'));
const Sales = React.lazy(() => import('./pages/Sales.jsx'));
const NewArrivalsOrder = React.lazy(() => import('./pages/NewArrivalsOrder.jsx'));
function PageLoading() {
  return (
    <div style={{ minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span className="spinner" />
    </div>
  );
}

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
    <React.Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/login" element={<RedirectIfAuth><Login /></RedirectIfAuth>} />
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/products" element={<Products />} />
          <Route path="/products/new" element={<ProductForm />} />
          <Route path="/products/:id" element={<ProductForm />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/:id" element={<Orders />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/new-arrivals-order" element={<NewArrivalsOrder />} />
          <Route path="/attributes" element={<Attributes />} />
          <Route path="/media" element={<Media />} />
          <Route path="/site-config" element={<SiteConfig />} />
          <Route path="/users" element={<Users />} />
          <Route path="/builder" element={<PageBuilder />} />
          <Route path="/themes" element={<Themes />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </React.Suspense>
  );
}
