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
import CustomerAccount from './pages/CustomerAccount.jsx';

function ScrollToTop() {
  const { pathname } = useLocation();
  React.useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function PageContent({ children }) {
  return <div className="page-content">{children}</div>;
}

export default function App() {
  return (
    <div className="app">
      <ScrollToTop />
      <Header />
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/categoria" element={<PageContent><Catalog /></PageContent>} />
          <Route path="/categoria/:category" element={<PageContent><Catalog /></PageContent>} />
          <Route path="/producto/:slug" element={<PageContent><ProductPage /></PageContent>} />
          <Route path="/carrito" element={<PageContent><Cart /></PageContent>} />
          <Route path="/checkout" element={<PageContent><Checkout /></PageContent>} />
          <Route path="/pago/respuesta" element={<PageContent><PaymentResponse /></PageContent>} />
          <Route path="/cuenta" element={<PageContent><CustomerAccount /></PageContent>} />
          <Route path="*" element={<PageContent><div className="center"><h1>404</h1><p>No encontramos esa página.</p></div></PageContent>} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
