// Rutas de la tienda: /, /categoria, /categoria/:slug, /producto/:slug,
// /carrito, /checkout, /pago/respuesta.

import React from 'react';
import { Navigate, Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import Home from './pages/Home.jsx';
import Catalog from './pages/Catalog.jsx';
import ProductPage from './pages/ProductPage.jsx';
import Cart from './pages/Cart.jsx';
import Checkout from './pages/Checkout.jsx';
import PaymentResponse from './pages/PaymentResponse.jsx';
import CustomerAccount from './pages/CustomerAccount.jsx';
import { useSite } from './site/SiteContext.jsx';

function ScrollToTop() {
  const { pathname } = useLocation();
  React.useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function PageContent({ children }) {
  return <div className="page-content">{children}</div>;
}

function OnlinePurchasesOnly({ children }) {
  const { site } = useSite();
  if (!site) return <div className="center"><span className="spinner" /></div>;
  if (site.online_purchases_enabled === false) return <Navigate to="/" replace />;
  return children;
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
          <Route path="/carrito" element={<OnlinePurchasesOnly><PageContent><Cart /></PageContent></OnlinePurchasesOnly>} />
          <Route path="/checkout" element={<OnlinePurchasesOnly><PageContent><Checkout /></PageContent></OnlinePurchasesOnly>} />
          <Route path="/pago/respuesta" element={<PageContent><PaymentResponse /></PageContent>} />
          <Route path="/cuenta" element={<PageContent><CustomerAccount /></PageContent>} />
          <Route path="*" element={<PageContent><div className="center"><h1>404</h1><p>No encontramos esa página.</p></div></PageContent>} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
