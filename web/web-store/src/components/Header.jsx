// Header de la tienda: logo (o texto si no hay), nav (categorías), botón de carrito.

import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useSite } from '../site/SiteContext.jsx';
import { useCart } from '../cart/CartContext.jsx';
import { api } from '../api.js';
import { formatCOP } from './Price.jsx';
import CustomCode from '../modules/CustomCode.jsx';

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>;
}

function CartIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 4.5h2l1.6 10.2a1.8 1.8 0 0 0 1.8 1.5h8.7a1.8 1.8 0 0 0 1.7-1.3L21 8H7" /><circle cx="9.5" cy="19.2" r="1.2" /><circle cx="18" cy="19.2" r="1.2" /></svg>;
}

export default function Header() {
  const { site, categories } = useSite();
  const { count } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const name = site?.site_name || 'TechStore';
  const logoUrl = site?.logo_url;
  const visibleCategories = Array.isArray(categories) ? categories.slice(0, 5) : [];
  const customLinks = Array.isArray(site?.navbar_links)
    ? site.navbar_links.filter((link) => link && link.label && link.href)
    : [];
  const showAnnouncement = site?.navbar_show_announcement !== false;
  const showSearch = site?.navbar_show_search !== false;
  const showCart = site?.navbar_show_cart !== false;
  const showCategories = site?.navbar_show_categories !== false;
  const announcement = site?.navbar_announcement || 'Envíos a toda Colombia · Compra fácil y segura';
  const navLinks = customLinks.length > 0
    ? customLinks
    : [
        { label: 'Tienda', href: '/categoria', featured: true },
        ...(showCategories ? visibleCategories.map((c) => ({ label: c.name, href: `/categoria/${c.slug}` })) : []),
      ];

  if (site?.navbar_custom_code_enabled && site.navbar_custom_code) {
    return <CustomCode code={site.navbar_custom_code} className="navbar-custom-code" />;
  }

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSuggestionsLoading(true);
      try {
        const data = await api.products({ q: term, limit: '6' });
        if (!cancelled) setSuggestions(data.products || []);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setSuggestionsLoading(false);
      }
    }, 240);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('menu-is-open', menuOpen);
    return () => document.body.classList.remove('menu-is-open');
  }, [menuOpen]);

  if (site && site.navbar_enabled === false) return null;

  const submitSearch = (event) => {
    event.preventDefault();
    const value = query.trim();
    navigate(value ? `/categoria?q=${encodeURIComponent(value)}` : '/categoria');
    setMenuOpen(false);
  };

  const openSuggestion = (product) => {
    setQuery('');
    setSuggestions([]);
    setMenuOpen(false);
    navigate(`/producto/${product.slug}`);
  };

  const searchForm = (className = '') => (
    <div className={`header-search-wrap ${className}`}>
      <form className="header-search" onSubmit={submitSearch} role="search">
        <SearchIcon />
        <input
          type="search"
          aria-label="Buscar productos"
          placeholder="¿Qué estás buscando?"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit">Buscar</button>
      </form>
      {query.trim().length >= 2 && (
        <div className="search-dropdown" role="listbox" aria-label="Productos sugeridos">
          {suggestionsLoading && <div className="search-dropdown-state">Buscando productos…</div>}
          {!suggestionsLoading && suggestions.length === 0 && <div className="search-dropdown-state">No encontramos coincidencias.</div>}
          {!suggestionsLoading && suggestions.map((product) => {
            const image = product.media?.find((media) => media.kind === 'image')?.url;
            return (
              <button key={product.id} type="button" className="search-suggestion" onClick={() => openSuggestion(product)} role="option">
                <span className="search-suggestion-image" style={image ? { backgroundImage: `url(${image})` } : undefined}>{!image && product.name?.slice(0, 1)}</span>
                <span className="search-suggestion-copy"><strong>{product.name}</strong><small>{product.brand || product.category_name || 'Producto'} · {formatCOP(product.base_price)}</small></span>
                <span className="search-suggestion-arrow">→</span>
              </button>
            );
          })}
          {!suggestionsLoading && suggestions.length > 0 && <button type="submit" className="search-see-all">Ver todos los resultados para “{query.trim()}”</button>}
        </div>
      )}
    </div>
  );

  return (
    <header className="header">
      {showAnnouncement && <div className="announcement-bar"><div className="header-width">{announcement.split('·').map((part, index) => <React.Fragment key={`${part}-${index}`}>{index > 0 && <span>·</span>}{part.trim()}</React.Fragment>)}</div></div>}
      <div className="header-inner">
        <button
          className={`menu-toggle ${menuOpen ? 'is-open' : ''}`}
          type="button"
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span /><span /><span />
        </button>
        <Link to="/" className="logo" aria-label={`Ir al inicio de ${name}`}>
          {logoUrl
            ? <img src={logoUrl} alt={name} />
            : <><span className="logo-mark">T</span><span>{name}<span className="accent">.</span></span></>}
        </Link>
        {showSearch && searchForm('header-search-desktop')}
        <div className="header-actions">
          {showSearch && <button className="mobile-search-button" type="button" aria-label="Buscar" onClick={() => setMenuOpen(true)}><SearchIcon /></button>}
          {showCart && <button className="cart-button" onClick={() => navigate('/carrito')} aria-label={`Ver carrito${count > 0 ? `, ${count} productos` : ''}`}>
            <CartIcon /><span className="cart-label">Carrito</span>
            {count > 0 && <span className="cart-badge">{count}</span>}
          </button>}
        </div>
      </div>
      <div className="header-nav-row">
        <nav className="nav header-width" aria-label="Navegación principal">
          {navLinks.map((link) => (
            link.href.startsWith('http')
              ? <a key={`${link.label}-${link.href}`} href={link.href} target="_blank" rel="noreferrer" className={link.featured ? 'nav-all' : ''}>{link.label}</a>
              : <Link key={`${link.label}-${link.href}`} to={link.href} className={link.featured ? 'nav-all' : ''}>{link.label}</Link>
          ))}
        </nav>
      </div>
      <div className={`mobile-menu ${menuOpen ? 'is-open' : ''}`} aria-hidden={!menuOpen}>
        <div className="mobile-menu-inner">
          {showSearch && searchForm('header-search-mobile')}
          <nav aria-label="Navegación móvil">
            {navLinks.map((link) => (
              link.href.startsWith('http')
                ? <a key={`${link.label}-${link.href}`} href={link.href} target="_blank" rel="noreferrer" className="mobile-nav-link">{link.label} <span>↗</span></a>
                : <Link key={`${link.label}-${link.href}`} to={link.href} className="mobile-nav-link">{link.label} <span>→</span></Link>
            ))}
          </nav>
          {showCart && <Link to="/carrito" className="mobile-cart-link"><CartIcon /> Ver carrito {count > 0 && <strong>({count})</strong>}</Link>}
        </div>
      </div>
    </header>
  );
}
