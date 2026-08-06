// App: layout con header sticky y carrito integrado en el nav, páginas Home / Collection / Product.

import { useEffect, useMemo, useState } from 'react';
import { Link, Route, Routes, useParams } from 'react-router-dom';
import { useSite, SiteProvider } from './SiteContext.jsx';
import { ModuleList } from './Modules.jsx';
import ReservationModal from './ReservationModal.jsx';
import Cart from './Cart.jsx';
import { api } from './api.js';
import { addToCart } from './cart.js';
import { typeBadge, productTypes, date } from './format.js';
import PriceLabel from './Price.jsx';

export default function App() {
  return (
    <SiteProvider>
      <Shell />
    </SiteProvider>
  );
}

function Shell() {
  const { modules } = useSite();
  const [cartOpen, setCartOpen] = useState(false);
  useEffect(() => {
    const openCart = () => setCartOpen(true);
    window.addEventListener('rebeca:open-cart', openCart);
    return () => window.removeEventListener('rebeca:open-cart', openCart);
  }, []);

  // Header global: se toma del page builder para que sus opciones se reflejen
  // también en rutas de colección y producto.
  const headerModule = modules.find((module) => module.type === 'header') || {
    type: 'header',
    config: { show_wa_button: true, layout: 'logo-nav-wa', variant: 'classic', text_color: '#1a1d21', bg_color: '#ffffff' },
  };

  return (
    <div className="app-public">
      <ModuleList modules={[headerModule]} />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/coleccion/:slug" element={<CollectionPage />} />
        <Route path="/producto/:id" element={<ProductPage />} />
        <Route path="*" element={<Home />} />
      </Routes>

      <Cart open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
}

function Home() {
  const { modules } = useSite();
  // Renderizar todos los módulos EXCEPTO el header (que ya está en el shell)
  const body = modules.filter((m) => m.type !== 'header');
  return <ModuleList modules={body} />;
}

function CollectionPage() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setData(null);
    setErr('');
    api(`/api/public/collections/${slug}`).then((r) => {
      if (r.ok) setData(r.data.data);
      else setErr(r.data?.error || 'No se encontró la colección');
    });
  }, [slug]);

  if (err) return <div className="page-pad"><p style={{ color: 'var(--gray)' }}>{err}</p></div>;
  if (!data) return <div className="page-pad"><p style={{ color: 'var(--gray)' }}>Cargando…</p></div>;

  return (
    <div className="page-pad">
      <nav className="breadcrumb">
        <Link to="/">Inicio</Link> / <span>{data.name}</span>
      </nav>
      <header className="page-header" style={{ borderColor: data.accent_color }}>
        <span className="eyebrow" style={{ color: data.accent_color }}>Colección</span>
        <h1>{data.name}</h1>
        {data.description && <p>{data.description}</p>}
      </header>

      {data.products.length === 0 ? (
        <p style={{ color: 'var(--gray)' }}>Esta colección todavía no tiene productos.</p>
      ) : (
        <div className="grid">
          {data.products.map((p) => (
            <Link to={`/producto/${p.id}`} key={p.id} className="m-card">
              <div className="m-card__img">
                {p.hero_image ? <img src={p.hero_image} alt={p.name} /> : <PlaceholderImg />}
              </div>
              <div className="m-card__body">
                <span className="m-card__type">{typeBadge(p)}</span>
                <span className="m-card__name">{p.name}</span>
                <span className="m-card__price"><PriceLabel product={p} /></span>
                {p.use_colors && p.swatch_hex && (
                  <span
                    className="m-card__swatch"
                    style={{ background: p.swatch_hex }}
                    title="Tiene variantes por color"
                    aria-label="Variantes por color"
                  />
                )}
                {Number(p.stock_total) === 0 && <span className="m-card__soldout">Agotado</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductPage() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [err, setErr] = useState('');
  const [reserveOpen, setReserveOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [actionType, setActionType] = useState('');
  const [sizeId, setSizeId] = useState('');
  // Color activo: null = "general" (o sin colores). Cuando el producto usa
  // colores, el primer color del array se autoseelecciona al cargar.
  const [activeColor, setActiveColor] = useState(null);

  useEffect(() => {
    setProduct(null);
    setActionType('');
    setSizeId('');
    setActiveColor(null);
    api(`/api/public/products/${id}`).then((r) => {
      if (r.ok) {
        const p = r.data.data;
        setProduct(p);
        // Si el producto maneja colores y el primer color tiene stock, lo
        // autoseccionamos. Si está agotado, queda null (la galería muestra
        // las fotos generales como fallback).
        if (p.use_colors && p.colors?.length > 0) {
          const first = p.colors[0];
          const hasStock = p.variants?.some((v) => Number(v.color_id) === Number(first.id) && Number(v.stock) > 0);
          if (hasStock) setActiveColor(first.id);
        }
      } else setErr(r.data?.error || 'No se encontró el producto');
    });
  }, [id]);

  // Galería: si hay color activo, fotos de ese color + las generales
  // (fallback). Si no, todas las del producto. Si el color no tiene fotos
  // propias, mostramos las generales.
  const allImages = product?.media?.filter((m) => m.kind === 'image') || [];
  let images = allImages;
  if (product?.use_colors && activeColor) {
    const fromColor = allImages.filter((m) => Number(m.color_id) === Number(activeColor));
    images = fromColor.length > 0 ? fromColor : allImages.filter((m) => m.color_id == null);
  } else if (product?.use_colors && !activeColor) {
    images = allImages.filter((m) => m.color_id == null);
  }
  // Reset índice de imagen si cambió la lista.
  useEffect(() => { if (active >= images.length) setActive(0); }, [images.length, active]);

  // Tallas: si el producto maneja colores, derivamos de variants filtradas
  // por color activo. Si no, del array sizes (modelo aditivo).
  const sizes = useMemo(() => {
    if (!product) return [];
    if (product.use_colors) {
      const relevant = (product.variants || []).filter((v) =>
        activeColor == null ? true : Number(v.color_id) === Number(activeColor)
      );
      const bySize = new Map();
      for (const v of relevant) {
        const k = v.size_id == null ? 'null' : v.size_id;
        if (!bySize.has(k)) bySize.set(k, { size_id: v.size_id, label: v.size_label, stock: 0 });
        bySize.get(k).stock += Number(v.stock || 0);
      }
      return Array.from(bySize.values()).filter((s) => s.stock > 0);
    }
    return product.sizes || [];
  }, [product, activeColor]);

  // Talla válida después de cambiar de color: si la que estaba elegida no
  // existe más, limpiamos.
  useEffect(() => {
    if (sizeId && !sizes.find((s) => String(s.size_id) === String(sizeId))) setSizeId('');
  }, [activeColor, sizes, sizeId]);

  // Todos los hooks quedan antes de estos retornos: el primer render no tiene
  // producto y el segundo sí, pero React debe ver siempre el mismo orden.
  if (err) return <div className="page-pad"><p style={{ color: 'var(--gray)' }}>{err}</p></div>;
  if (!product) return <div className="page-pad"><p style={{ color: 'var(--gray)' }}>Cargando…</p></div>;

  const types = productTypes(product);
  const selectedSize = sizes.find((size) => String(size.size_id) === String(sizeId));
  const actionChoices = [
    { type: 'venta', label: 'Compra' },
    { type: 'alquiler', label: 'Alquiler' },
    { type: 'alquiler_nuevo', label: 'Alquiler como nuevo' },
  ];
  // Agotado (derivado del stock) deshabilita la compra pero el producto sigue
  // visible: sin stock NO se despublica solo.
  const canAdd = !product.out_of_stock && !!actionType && (!sizes?.length || !!selectedSize);

  function addSelection() {
    if (!canAdd) return;
    if (actionType === 'venta') {
      const color = product.colors?.find((c) => Number(c.id) === Number(activeColor));
      addToCart(product, {
        sizeId: selectedSize?.size_id,
        sizeLabel: selectedSize?.label,
        colorId: product.use_colors ? activeColor : null,
        colorLabel: color?.label || null,
      });
      window.dispatchEvent(new Event('rebeca:open-cart'));
    } else {
      setReserveOpen(true);
    }
  }

  function changeColor(c) {
    setActiveColor(c == null ? null : Number(c));
    setActive(0);
    setSizeId('');
  }

  return (
    <div className="page-pad">
      <nav className="breadcrumb">
        <Link to="/">Inicio</Link> / <Link to={`/coleccion/${product.collection_slug}`}>{product.collection_name}</Link> / <span>{product.name}</span>
      </nav>

      <div className="pdp">
        <div>
          <div className="pdp__gallery">
            {images.length > 0 ? (
              <img src={images[active]?.url} alt={images[active]?.alt_text || product.name} />
            ) : <PlaceholderImg large />}
          </div>
          {images.length > 1 && (
            <div className="pdp__thumbs">
              {images.map((m, i) => (
                <button key={m.id} onClick={() => setActive(i)} className={`pdp__thumb ${i === active ? 'is-active' : ''}`}>
                  <img src={m.url} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="pdp__info">
          <span className="pdp__tag">{typeBadge(product)}</span>
          {product.out_of_stock && <span className="pdp__soldout">Agotado</span>}
          <h1 className="pdp__title">{product.name}</h1>
          <p className="pdp__price"><PriceLabel product={product} /></p>
          {product.promo && (
            <p className="pdp__promo-until">Precio de promoción hasta el {date(product.promo.ends_at)}.</p>
          )}
          {product.description && <p className="pdp__desc">{product.description}</p>}

          {product.use_colors && product.colors?.length > 0 && (
            <section className="pdp__colors">
              <span className="pdp__step-label">Color</span>
              <div className="pdp__color-chips">
                {product.colors.map((c) => {
                  const isActive = Number(activeColor) === Number(c.id);
                  // Stock total de este color (suma de variants de este color).
                  const colorStock = (product.variants || [])
                    .filter((v) => Number(v.color_id) === Number(c.id))
                    .reduce((a, v) => a + Number(v.stock || 0), 0);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      title={`${c.label}${colorStock === 0 ? ' (agotado)' : ''}`}
                      className={`pdp__color-chip ${isActive ? 'is-active' : ''} ${colorStock === 0 ? 'is-soldout' : ''}`}
                      onClick={() => changeColor(colorStock > 0 ? c.id : null)}
                      aria-pressed={isActive}
                    >
                      <span
                        className="pdp__color-swatch"
                        style={{ background: c.hex || 'transparent' }}
                      />
                      <span className="pdp__color-label">{c.label}</span>
                    </button>
                  );
                })}
              </div>
              {activeColor && (() => {
                const color = product.colors.find((c) => Number(c.id) === Number(activeColor));
                return (
                  <small className="pdp__color-hint">
                    <span className="pdp__color-swatch" style={{ background: color?.hex || 'transparent' }} />
                    Mostrando fotos y stock de: {color?.label}
                  </small>
                );
              })()}
            </section>
          )}

          <section className="pdp__selection">
            <span className="pdp__step-label">1. Elige cómo la quieres</span>
            <div className="pdp__action-options">
              {actionChoices.map((choice) => {
                const available = types.includes(choice.type);
                return <button key={choice.type} type="button" disabled={!available} className={`pdp__action-option ${actionType === choice.type ? 'is-active' : ''} ${!available ? 'is-unavailable' : ''}`} onClick={() => { setActionType(choice.type); setSizeId(''); }}>
                  {choice.label}
                  {!available && <small>No disponible</small>}
                </button>;
              })}
            </div>
          </section>

          {product.sizes?.length > 0 && (
            <section className={`pdp__sizes ${!actionType ? 'is-locked' : ''}`}>
              <span className="pdp__step-label">2. Elige tu talla *</span>
              <div className="pdp__sizes-list">
                {product.sizes.map((size) => (
                  <button key={size.size_id} type="button" disabled={!actionType} className={`pdp__size ${String(sizeId) === String(size.size_id) ? 'is-active' : ''}`} onClick={() => setSizeId(String(size.size_id))}>
                    {size.label}
                  </button>
                ))}
              </div>
            </section>
          )}
          <button className="btn pdp__cta" disabled={!canAdd} onClick={addSelection}>
            {product.out_of_stock ? 'Agotado' : 'Agregar al carrito'}
          </button>

          <p className="pdp__hint">Cotización, tallas, prueba y disponibilidad se confirman directamente por WhatsApp.</p>
        </div>
      </div>

      <ReservationModal product={product} selectedSizeId={sizeId} requestedType={actionType} activeColor={activeColor} open={reserveOpen} onClose={() => setReserveOpen(false)} />
    </div>
  );
}

function PlaceholderImg({ large }) {
  return (
    <div style={{
      width: '100%', aspectRatio: large ? 'auto' : '1',
      height: large ? 480 : 'auto',
      background: 'linear-gradient(135deg, #f0e6d2, #d9c79f)',
      display: 'grid', placeItems: 'center',
      color: '#8a6a2a', fontSize: 11, letterSpacing: '0.1em',
      borderRadius: 6,
    }}>
      SIN IMAGEN
    </div>
  );
}
