// Carrusel editorial de productos. Mantiene los datos en el API público y
// solo cambia la presentación para que el Builder pueda mezclarlo con grids.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import CustomCode from './CustomCode.jsx';

export default function Carousel({ settings = {} }) {
  const { title = 'Piezas destacadas', source = 'featured', limit = 6, autoplay_ms = 5500, variant = 'classic' } = settings;
  const [items, setItems] = useState(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const params = { limit: String(Math.min(12, Math.max(1, Number(limit) || 6))) };
    if (source === 'featured') params.featured = 'true';
    api.products(params).then((data) => {
      if (!cancelled) {
        setItems(data.products || []);
        setActive(0);
      }
    }).catch(() => {
      if (!cancelled) setItems([]);
    });
    return () => { cancelled = true; };
  }, [limit, source]);

  useEffect(() => {
    if (!items?.length || items.length < 2 || paused || Number(autoplay_ms) <= 0) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % items.length), Number(autoplay_ms));
    return () => window.clearInterval(timer);
  }, [items, autoplay_ms, paused]);

  if (settings.custom_code_enabled && settings.custom_code) return <CustomCode code={settings.custom_code} className="carousel-custom-code" />;
  if (!items?.length) return items === null ? <section className={`editorial-carousel editorial-carousel--${variant}`}><div className="center"><span className="spinner" /></div></section> : null;

  const go = (offset) => setActive((current) => (current + offset + items.length) % items.length);
  const product = items[active];
  const image = product.image_url || product.thumb_url;

  return (
    <section className={`editorial-carousel editorial-carousel--${variant}`} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {title && <h2>{title}</h2>}
      <div className="editorial-carousel__frame">
        <Link to={`/producto/${product.slug}`} className="editorial-carousel__slide">
          {image ? <img src={image} alt={product.name} /> : <span>{product.name.slice(0, 1)}</span>}
          <div className="editorial-carousel__caption"><strong>{product.name}</strong><small>{product.brand || product.category_name || 'TechStore'}</small></div>
        </Link>
      </div>
      <div className="editorial-carousel__controls">
        <button type="button" onClick={() => go(-1)} aria-label="Producto anterior">←</button>
        <div className="editorial-carousel__dots" role="tablist" aria-label="Productos destacados">
          {items.map((item, index) => <button key={item.id} type="button" className={index === active ? 'is-active' : ''} onClick={() => setActive(index)} aria-label={`Ver ${item.name}`} aria-selected={index === active} role="tab" />)}
        </div>
        <button type="button" onClick={() => go(1)} aria-label="Siguiente producto">→</button>
      </div>
    </section>
  );
}
