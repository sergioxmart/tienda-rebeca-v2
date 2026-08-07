// Header de la tienda: logo (o texto si no hay), nav (categorías), botón de carrito.

import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useSite } from '../site/SiteContext.jsx';
import { useCart } from '../cart/CartContext.jsx';

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
  const name = site?.site_name || 'TechStore';
  const logoUrl = site?.logo_url;
  const visibleCategories = Array.isArray(categories) ? categories.slice(0, 5) : [];

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);

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

  const submitSearch = (event) => {
    event.preventDefault();
    const value = query.trim();
    navigate(value ? `/categoria?q=${encodeURIComponent(value)}` : '/categoria');
    setMenuOpen(false);
  };

  const searchForm = (className = '') => (
    <form className={`header-search ${className}`} onSubmit={submitSearch} role="search">
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
  );

  return (
    <header className="header">
      <div className="announcement-bar"><div className="header-width">Envíos a toda Colombia <span>·</span> Compra fácil y segura</div></div>
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
        {searchForm('header-search-desktop')}
        <div className="header-actions">
          <button className="mobile-search-button" type="button" aria-label="Buscar" onClick={() => setMenuOpen(true)}><SearchIcon /></button>
          <button className="cart-button" onClick={() => navigate('/carrito')} aria-label={`Ver carrito${count > 0 ? `, ${count} productos` : ''}`}>
          <CartIcon /><span className="cart-label">Carrito</span>
          {count > 0 && <span className="cart-badge">{count}</span>}
          </button>
        </div>
      </div>
      <div className="header-nav-row">
        <nav className="nav header-width" aria-label="Navegación principal">
          <Link to="/categoria" className="nav-all">Tienda</Link>
          {visibleCategories.map((c) => <Link key={c.id} to={`/categoria/${c.slug}`}>{c.name}</Link>)}
        </nav>
      </div>
      <div className={`mobile-menu ${menuOpen ? 'is-open' : ''}`} aria-hidden={!menuOpen}>
        <div className="mobile-menu-inner">
          {searchForm('header-search-mobile')}
          <nav aria-label="Navegación móvil">
            <Link to="/categoria" className="mobile-nav-link">Toda la tienda <span>→</span></Link>
            {visibleCategories.map((c) => <Link key={c.id} to={`/categoria/${c.slug}`} className="mobile-nav-link">{c.name} <span>→</span></Link>)}
          </nav>
          <Link to="/carrito" className="mobile-cart-link"><CartIcon /> Ver carrito {count > 0 && <strong>({count})</strong>}</Link>
        </div>
      </div>
    </header>
  );
}
