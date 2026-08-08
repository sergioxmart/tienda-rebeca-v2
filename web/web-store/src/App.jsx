// Rutas de la tienda: /, /categoria, /categoria/:slug, /producto/:slug,
// /carrito, /checkout, /pago/respuesta.

import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import Home from './pages/Home.jsx';
import Catalog from './pages/Catalog.jsx';
import ProductPage from './pages/ProductPage.jsx';
import Cart from './pages/Cart.jsx';
import Checkout from './pages/Checkout.jsx';
import PaymentResponse from './pages/PaymentResponse.jsx';

function ScrollToTop() {
  const { pathname } = useLocation();
  React.useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <div className="app">
      <ScrollToTop />
      <Header />
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/categoria" element={<Catalog />} />
          <Route path="/categoria/:category" element={<Catalog />} />
          <Route path="/producto/:slug" element={<ProductPage />} />
          <Route path="/carrito" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/pago/respuesta" element={<PaymentResponse />} />
          <Route path="*" element={<div className="center"><h1>404</h1><p>No encontramos esa página.</p></div>} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
