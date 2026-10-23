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
import { useBuilderPreview } from './preview/BuilderPreviewContext.jsx';

function StoreSplash() {
  const { site, siteLoading } = useSite();
  const preview = useBuilderPreview();
  const { pathname } = useLocation();
  const [visible, setVisible] = React.useState(pathname === '/' && !preview.active);

  React.useEffect(() => {
    if (pathname !== '/' || preview.active) {
      setVisible(false);
      return undefined;
    }
    if (siteLoading) {
      setVisible(true);
      return undefined;
    }
    if (site?.store_splash_enabled === false) {
      setVisible(false);
      return undefined;
    }

    const configuredDuration = Number(site?.store_splash_duration);
    const duration = Number.isFinite(configuredDuration)
      ? Math.min(10, Math.max(1, configuredDuration))
      : 2.5;
    setVisible(true);
    const timeout = window.setTimeout(() => setVisible(false), duration * 1000);
    return () => window.clearTimeout(timeout);
  }, [pathname, preview.active, siteLoading, site?.store_splash_enabled, site?.store_splash_duration]);

  if (!visible) return null;
  const configuredStyle = site?.store_splash_style;
  const splashStyle = ['image', 'image_title', 'spinner', 'spinner_title'].includes(configuredStyle) ? configuredStyle : 'image';
  const configuredSize = Number(site?.store_splash_size);
  const splashSize = Number.isFinite(configuredSize) ? Math.min(520, Math.max(80, configuredSize)) : 520;
  const imageUrl = typeof site?.store_splash_image_url === 'string' ? site.store_splash_image_url : '';
  const configuredImageBorderRadius = site?.store_splash_image_border_radius;
  const imageBorderRadius = configuredImageBorderRadius == null || configuredImageBorderRadius === ''
    ? 100
    : Number(configuredImageBorderRadius);
  const safeImageBorderRadius = Number.isFinite(imageBorderRadius) ? Math.min(100, Math.max(0, imageBorderRadius)) : 0;
  const backgroundColor = /^#[0-9A-Fa-f]{6}$/.test(String(site?.store_splash_background_color || ''))
    ? site.store_splash_background_color
    : '#FAF7F2';
  const isCircularImage = safeImageBorderRadius === 100;
  const siteName = site?.site_name || 'Rebeca Andrade';
  const splashTitle = typeof site?.store_splash_title === 'string' && site.store_splash_title.trim()
    ? site.store_splash_title.trim()
    : siteName;
  const selectedSplashFont = typeof site?.store_splash_title_font === 'string' && site.store_splash_title_font.startsWith('custom:')
    ? site?.custom_fonts?.find((font) => font.id === site.store_splash_title_font.slice('custom:'.length))
    : null;
  const splashTitleFont = selectedSplashFont?.family ? `"${selectedSplashFont.family}", sans-serif` : undefined;
  const spinnerStyle = { width: `${Math.min(56, splashSize / 5)}px`, height: `${Math.min(56, splashSize / 5)}px` };
  return (
    <div className={`store-splash store-splash--${splashStyle}`} style={{ backgroundColor }} role="status" aria-live="polite" aria-label="Cargando tienda">
      {splashStyle.startsWith('spinner')
        ? <div className="store-splash-spinner-content"><span className="spinner store-splash-spinner" style={spinnerStyle} aria-hidden="true" />{splashStyle === 'spinner_title' && <span className="store-splash-title" style={{ fontFamily: splashTitleFont }}>{splashTitle}</span>}</div>
        : imageUrl
          ? <div className={`store-splash-content${splashStyle === 'image_title' ? ' has-title' : ''}`}>
            <img className={`store-splash-image${isCircularImage ? ' is-circular' : ''}`} src={imageUrl} alt={splashStyle === 'image_title' ? splashTitle : siteName} style={{ maxWidth: `min(78vw, ${splashSize}px)`, maxHeight: `min(72vh, ${splashSize}px)`, ...(isCircularImage ? undefined : { borderRadius: `${safeImageBorderRadius / 2}%` }) }} />
            {splashStyle === 'image_title' && <span className="store-splash-title" style={{ fontFamily: splashTitleFont }}>{splashTitle}</span>}
          </div>
          : <div className="store-splash-brand"><span>{splashStyle === 'image_title' ? splashTitle : siteName}</span><i aria-hidden="true" /></div>}
    </div>
  );
}

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
      <StoreSplash />
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
