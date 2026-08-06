// Module renderer: cada type tiene su componente. El site_config.theme del
// módulo se aplica como CSS vars (text_color, bg_color).

import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useSite } from './SiteContext.jsx';
import { api } from './api.js';
import { cartCount, subscribe } from './cart.js';

function moduleStyle(cfg = {}) {
  return {
    '--text': cfg.text_color || 'inherit',
    '--bg':   cfg.bg_color   || 'transparent',
    color: 'var(--text)',
    background: 'var(--bg)',
  };
}

function HeaderModule({ cfg }) {
  const { site, collections } = useSite();
  const [count, setCount] = useState(cartCount());
  const [menuOpen, setMenuOpen] = useState(false);
  const layout = ['logo-nav-wa', 'logo-wa-nav', 'nav-logo-wa', 'nav-wa-logo', 'wa-logo-nav', 'wa-nav-logo'].includes(cfg.layout)
    ? cfg.layout
    : 'logo-nav-wa';

  useEffect(() => subscribe(() => setCount(cartCount())), []);

  const navLinks = collections.filter((c) => c.show_in_nav !== false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className={`site-header site-header--${cfg.variant || 'classic'}`} style={moduleStyle(cfg)}>
      <div className={`site-header__inner site-header__inner--${layout}`}>
        <Link to="/" className="site-header__logo" aria-label="Inicio">
          {site.logo_url
            ? <img src={site.logo_url} alt={site.site_name} />
            : <span>{site.site_name || 'REBECA ANDRADE'}</span>}
        </Link>
        {/* Botón hamburguesa: solo se muestra en mobile (CSS) y abre
            el drawer con los links de las colecciones. */}
        <button
          className="site-hamburger"
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={menuOpen}
          aria-controls="site-mobile-menu"
        >
          {menuOpen ? <CloseIcon /> : <MenuIcon />}
        </button>
        <nav className="site-nav">
          {navLinks.map((c) => (
            <Link key={c.id} to={`/coleccion/${c.slug}`}>{c.nav_label || c.name}</Link>
          ))}
        </nav>
        {cfg.show_wa_button !== false && site.contact_phone && (
          <a className="site-header__wa" href={`https://wa.me/${String(site.contact_phone).replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer">
            <WaIcon size={18} /> <span>WhatsApp</span>
          </a>
        )}
        <button className="site-cart" type="button" onClick={() => window.dispatchEvent(new Event('rebeca:open-cart'))} aria-label={`Abrir carrito${count ? ` (${count} producto${count === 1 ? '' : 's'})` : ''}`}>
          <CartIcon />
          {count > 0 && <span className="site-cart__count">{count}</span>}
        </button>
      </div>
      {/* Drawer mobile: debajo del header, se abre/cierra con el botón
          de hamburguesa. Se cierra también al hacer click en un link. */}
      <div
        id="site-mobile-menu"
        className={`site-mobile-menu${menuOpen ? ' is-open' : ''}`}
        aria-hidden={!menuOpen}
      >
        <nav className="site-mobile-nav">
          {navLinks.map((c) => (
            <Link key={c.id} to={`/coleccion/${c.slug}`} onClick={closeMenu}>
              {c.nav_label || c.name}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

function CartIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 4h2l2.1 10.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 1.9-1.5L20 8H6" />
      <circle cx="10" cy="20" r="1" /><circle cx="17" cy="20" r="1" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

function HeroModule({ cfg }) {
  // Si el admin guardó un focal point, usarlo. Default: centro.
  const focal = cfg.image_focal;
  const objectPosition = focal
    ? `${Math.round(focal.x * 100)}% ${Math.round(focal.y * 100)}%`
    : '50% 50%';
  return (
    <section className={`m-hero m-hero--${cfg.variant || 'classic'}`} style={moduleStyle(cfg)}>
      {cfg.image_url && (
        <img
          className="m-hero__bg"
          src={cfg.image_url}
          alt=""
          style={{ objectFit: 'cover', objectPosition }}
        />
      )}
      <div className="m-hero__overlay">
        {cfg.eyebrow && <span className="m-hero__eyebrow">{cfg.eyebrow}</span>}
        {cfg.title && <h1 className="m-hero__title">{cfg.title}</h1>}
        {cfg.cta_label && (
          <a className="m-hero__cta" href="#productos" onClick={(e) => {
            e.preventDefault();
            const el = document.getElementById('productos');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}>
            {cfg.cta_label}
          </a>
        )}
      </div>
    </section>
  );
}

function CarouselModule({ cfg }) {
  const [items, setItems] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [touchX, setTouchX] = useState(null);
  const carouselStyle = { ...moduleStyle(cfg), '--bg': cfg.bg_color || '#F5EFE0' };
  const autoplayMs = Number.isFinite(Number(cfg.autoplay_ms))
    ? Math.max(0, Math.floor(Number(cfg.autoplay_ms)))
    : 5500;

  useEffect(() => {
    const url = cfg.source === 'featured'
      ? '/api/public/collections/destacado'
      : cfg.source?.startsWith('collection:')
        ? `/api/public/collections/${cfg.source.split(':')[1]}`
        : '/api/public/collections/destacado';
    api(url).then((r) => {
      if (r.ok) {
        const all = r.data.data.products || [];
        setItems(all.slice(0, cfg.max_items || 6));
        setActiveIndex(0);
      }
    });
  }, [cfg.source, cfg.max_items]);

  useEffect(() => {
    if (!items?.length || items.length < 2 || paused || autoplayMs === 0) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % items.length);
    }, autoplayMs);

    return () => window.clearInterval(timer);
  }, [items, paused, autoplayMs]);

  useEffect(() => {
    if (items?.length && activeIndex >= items.length) setActiveIndex(0);
  }, [items, activeIndex]);

  if (!items) return <section className="m-carousel" style={carouselStyle} />;
  if (!items.length) return null;

  const goTo = (nextIndex) => {
    setActiveIndex((nextIndex + items.length) % items.length);
  };
  const next = () => goTo(activeIndex + 1);
  const prev = () => goTo(activeIndex - 1);

  const handleTouchStart = (event) => {
    setTouchX(event.touches?.[0]?.clientX ?? null);
  };

  const handleTouchEnd = (event) => {
    if (touchX == null) return;
    const endX = event.changedTouches?.[0]?.clientX ?? touchX;
    const delta = endX - touchX;
    if (Math.abs(delta) > 40) delta < 0 ? next() : prev();
    setTouchX(null);
  };

  return (
    <section
      className={`m-carousel m-carousel--${cfg.variant || 'classic'}`}
      style={carouselStyle}
      id="productos"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {cfg.title && <h2 className="m-carousel__title">{cfg.title}</h2>}
      <div className="m-carousel__inner">
        <div
          className="m-carousel__frame"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {items.map((p, index) => (
            <Link
              to={`/producto/${p.id}`}
              key={p.id}
              className={`m-carousel__slide${index === activeIndex ? ' is-active' : ''}`}
              aria-label={p.name}
              aria-hidden={index !== activeIndex}
              tabIndex={index === activeIndex ? 0 : -1}
            >
              {p.hero_image
                ? <img src={p.hero_image} alt={p.name} />
                : <PlaceholderImg />}
            </Link>
          ))}
        </div>

        <div className="m-carousel__controls">
          <button className="m-carousel__arrow" type="button" onClick={prev} aria-label="Anterior">
            <svg width="30" height="12" viewBox="0 0 30 12" fill="none" aria-hidden="true">
              <path d="M29 6H1M1 6L6 1M1 6L6 11" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
          <div className="m-carousel__dots" role="tablist" aria-label="Imágenes destacadas">
            {items.map((p, index) => (
              <button
                key={p.id}
                className={`m-carousel__dot${index === activeIndex ? ' is-active' : ''}`}
                type="button"
                role="tab"
                aria-selected={index === activeIndex}
                aria-label={`Ir a ${p.name}`}
                onClick={() => goTo(index)}
              />
            ))}
          </div>
          <button className="m-carousel__arrow" type="button" onClick={next} aria-label="Siguiente">
            <svg width="30" height="12" viewBox="0 0 30 12" fill="none" aria-hidden="true">
              <path d="M1 6H29M29 6L24 1M29 6L24 11" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}

function CollectionsModule({ cfg }) {
  const { collections } = useSite();
  return (
    <section className={`m-collections m-collections--${cfg.variant || 'classic'}`} style={moduleStyle(cfg)}>
      {cfg.title && <h2 className="m-collections__title">{cfg.title}</h2>}
      <div className="m-collections__grid">
        {collections.map((c) => (
          <Link key={c.id} to={`/coleccion/${c.slug}`} className="m-collection" style={{ background: c.hero_image ? `url(${c.hero_image}) center/cover` : 'var(--cream-2)' }}>
            <div className="m-collection__scrim">
              <h3 className="m-collection__title">{c.name}</h3>
              <span className="m-collection__cta">Ver colección →</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function TextModule({ cfg }) {
  return (
    <section className="m-text" style={{ ...moduleStyle(cfg), textAlign: cfg.align || 'center' }}>
      {cfg.body && <div className="m-text__body" dangerouslySetInnerHTML={{ __html: simpleMd(cfg.body) }} />}
    </section>
  );
}

function ContactModule({ cfg }) {
  const { site } = useSite();
  return (
    <section className="m-contact" style={moduleStyle(cfg)}>
      <div className="m-contact__grid">
        <div>
          <h2 className="m-contact__title">Contacto</h2>
          {site.contact_address_lines && site.contact_address_lines.length > 0 && (
            <div className="m-contact__block">
              {site.contact_address_lines.map((l, i) => <p key={i}>{l}</p>)}
            </div>
          )}
          {site.contact_phone_display && (
            <div className="m-contact__block">
              <h4>WhatsApp</h4>
              <p>{site.contact_phone_display}</p>
            </div>
          )}
        </div>
        <div>
          <h4>Horarios</h4>
          {site.business_hours_weekday && <p>{site.business_hours_weekday}</p>}
          {site.business_hours_holiday && <p>{site.business_hours_holiday}</p>}
          {(site.contact_instagram || site.contact_facebook) && (
            <>
              <h4 style={{ marginTop: 18 }}>Redes</h4>
              {site.contact_instagram && (
                <p><a href={`https://instagram.com/${site.contact_instagram}`} target="_blank" rel="noreferrer">@{site.contact_instagram}</a></p>
              )}
              {site.contact_facebook && (
                <p><a href={`https://facebook.com/${site.contact_facebook}`} target="_blank" rel="noreferrer">{site.contact_facebook}</a></p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function FooterModule({ cfg }) {
  const { site } = useSite();
  return (
    <footer className="m-footer" style={moduleStyle(cfg)}>
      <div className="m-footer__bar">
        <span>© {new Date().getFullYear()} {site.site_name || 'Rebeca Andrade'} · Venta y alquiler</span>
        {site.contact_phone_display && <span>{site.contact_phone_display}</span>}
      </div>
    </footer>
  );
}

const MODULES = {
  header: HeaderModule,
  hero: HeroModule,
  carousel: CarouselModule,
  collections: CollectionsModule,
  text: TextModule,
  contact: ContactModule,
  footer: FooterModule,
};

export function ModuleRenderer({ module }) {
  const C = MODULES[module.type];
  if (!C) return null;
  return <C cfg={module.config || {}} />;
}

export function ModuleList({ modules }) {
  return (
    <>
      {modules.map((m, i) => <ModuleRenderer key={m.id ?? `${m.type}-${i}`} module={m} />)}
    </>
  );
}

function PlaceholderImg() {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'linear-gradient(135deg, #f0e6d2, #d9c79f)',
      display: 'grid', placeItems: 'center',
      color: '#8a6a2a', fontSize: 11, letterSpacing: '0.1em',
    }}>
      SIN IMAGEN
    </div>
  );
}

function WaIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.5 14.4c-.3-.2-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.1-.1.3-.4.4-.5.1-.2.2-.3.2-.5.1-.2-.5-1-.7-1.4-.2-.3-.4-.3-.6-.3h-.5c-.2 0-.5.1-.8.4s-1 1-1 2.5 1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.2-.6-.4zM12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 5L2 22l5.2-1.3c1.4.8 3 1.3 4.8 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18.3c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3.2.8.8-3.1-.2-.3c-.9-1.4-1.4-3-1.4-4.6 0-4.6 3.7-8.3 8.3-8.3s8.3 3.7 8.3 8.3-3.7 8.6-8.3 8.6z" />
    </svg>
  );
}

function simpleMd(text) {
  // Conversor markdown MUY básico: **bold**, *italic*, line breaks
  const safe = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return safe
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>');
}
