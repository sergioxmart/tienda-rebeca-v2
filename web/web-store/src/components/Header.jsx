// Header de la tienda: logo (o texto si no hay), nav (categorías), botón de carrito.

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSite } from '../site/SiteContext.jsx';
import { useCart } from '../cart/CartContext.jsx';

export default function Header() {
  const { site, categories } = useSite();
  const { count } = useCart();
  const navigate = useNavigate();
  const name = site?.site_name || 'TechStore';
  const logoUrl = site?.logo_url;

  return (
    <header className="header">
      <div className="header-inner">
        <Link to="/" className="logo" aria-label={name}>
          {logoUrl
            ? <img src={logoUrl} alt={name} style={{ maxHeight: 32, maxWidth: 160, objectFit: 'contain' }} />
            : <>{name}<span className="accent">.</span></>}
        </Link>
        <nav className="nav">
          {Array.isArray(categories) && categories.slice(0, 5).map((c) => (
            <Link key={c.id} to={`/categoria/${c.slug}`}>{c.name}</Link>
          ))}
        </nav>
        <button className="cart-button" onClick={() => navigate('/carrito')} aria-label="Ver carrito">
          🛒 Carrito
          {count > 0 && <span className="cart-badge">{count}</span>}
        </button>
      </div>
    </header>
  );
}
