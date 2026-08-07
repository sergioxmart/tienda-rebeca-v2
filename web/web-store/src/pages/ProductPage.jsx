// Detalle de producto: imagen, info, selector de variante, agregar al carrito.
//
// Si el producto no tiene variantes (caso raro en v1 pero soportado), el
// botón "Agregar" crea un item sin variant_id (igual lo soportamos en el
// CartContext si llega).

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useCart } from '../cart/CartContext.jsx';
import Price from '../components/Price.jsx';
import VariantSelector from '../components/VariantSelector.jsx';
import QuantitySelector from '../components/QuantitySelector.jsx';
import Empty from '../components/Empty.jsx';

export default function ProductPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { addItem, items } = useCart();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState({});  // { attribute_id: attribute_value_id }
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [activeImageId, setActiveImageId] = useState(null);
  const [zoom, setZoom] = useState({ visible: false, imageLeft: 0, imageTop: 0, left: 0, top: 0 });

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.product(slug)
      .then(setProduct)
      .catch((err) => setError(err.message || 'No se encontró el producto'))
      .finally(() => setLoading(false));
    setSelected({});
    setQty(1);
    setAdded(false);
  }, [slug]);

  // Construir la lista de attributes a partir del product
  const attributes = useMemo(() => {
    if (!product) return [];
    return (product.attributes || []).map((a) => ({
      id: a.attribute_id,
      name: a.attribute_name,
      slug: a.attribute_slug,
      type: a.attribute_type,
      isRequired: a.is_required !== false,
      values: a.values || [],
    }));
  }, [product]);

  // Encontrar la variant que matchea la selección actual
  const matchedVariant = useMemo(() => {
    if (!product?.variants?.length) return null;
    const sel = Object.entries(selected);
    if (sel.length === 0) return null;
    return product.variants.find((v) => {
      const avs = v.attribute_values || [];
      if (avs.length !== sel.length) return false;
      return sel.every(([attrId, valueId]) =>
        avs.some((x) => x.attribute_id === Number(attrId) && x.attribute_value_id === Number(valueId))
      );
    }) || null;
  }, [product, selected]);

  // Precio y stock efectivos
  // Antes de que el cliente elija, usamos la primera variante activa como
  // referencia visual. No marcamos sus atributos como seleccionados: solo
  // definimos la imagen, descripción y precio iniciales de la página.
  const defaultVariant = product?.variants?.find((variant) => Number(variant.stock) > 0)
    || product?.variants?.[0]
    || null;
  const displayVariant = matchedVariant || defaultVariant;
  const effectivePrice = displayVariant && Number(displayVariant.price) > 0
    ? displayVariant.price
    : product?.base_price;
  const effectiveCompare = displayVariant && Number(displayVariant.compare_at) > 0
    ? displayVariant.compare_at
    : product?.compare_at;
  const requiredAttributes = attributes.filter((attribute) => attribute.isRequired);
  const isAllSelected = requiredAttributes.every((attribute) => selected[attribute.id]);
  const hasSelectedVariant = attributes.length === 0 || (isAllSelected && !!matchedVariant);
  const selectedVariantId = matchedVariant?.id ?? (attributes.length === 0 ? product?.id : null);
  const rawSelectedStock = hasSelectedVariant
    ? (matchedVariant?.stock ?? (attributes.length === 0 ? defaultVariant?.stock ?? product?.total_stock : 0))
    : null;
  const selectedStock = rawSelectedStock === null ? null : Number(rawSelectedStock || 0);
  const cartQty = selectedVariantId === null
    ? 0
    : Number(items.find((item) => Number(item.variant_id) === Number(selectedVariantId))?.qty || 0);
  const remainingStock = selectedStock === null ? 0 : Math.max(0, selectedStock - cartQty);
  const maxQty = Math.min(99, remainingStock);
  const canAdd = hasSelectedVariant && remainingStock > 0 && qty <= maxQty;
  const activeMedia = displayVariant?.media?.length ? displayVariant.media : (product?.media || []);
  const galleryImages = activeMedia.filter((item) => item.kind === 'image');
  const selectedGalleryImage = galleryImages.find((item) => item.id === activeImageId) || galleryImages[0];
  const image = selectedGalleryImage?.url || product?.image_url || product?.thumb_url;
  const variantDescription = displayVariant?.description || product?.description;

  useEffect(() => {
    setActiveImageId(null);
    setZoom((current) => ({ ...current, visible: false }));
  }, [displayVariant?.id, product?.id]);

  const handleGalleryMove = (event) => {
    if (!image) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const clamp = (value) => Math.max(0, Math.min(1, value));
    const x = clamp((event.clientX - rect.left) / rect.width);
    const y = clamp((event.clientY - rect.top) / rect.height);
    const zoomScale = 2.5;
    // La imagen interna mide 250% del recuadro. El offset centra el punto del
    // cursor dentro del zoom y se limita en los bordes para no dejar espacios.
    const imageOffset = (point) => Math.max(100 - (zoomScale * 100), Math.min(0, 50 - (point * zoomScale * 100)));
    const size = 184;
    const left = Math.min(Math.max(10, event.clientX - rect.left + 18), Math.max(10, rect.width - size - 10));
    const top = Math.min(Math.max(10, event.clientY - rect.top + 18), Math.max(10, rect.height - size - 10));
    setZoom({
      visible: true,
      imageLeft: imageOffset(x),
      imageTop: imageOffset(y),
      left,
      top,
    });
  };

  useEffect(() => {
    setQty((current) => Math.min(Math.max(Number(current) || 1, 1), Math.max(1, maxQty)));
  }, [maxQty]);

  const handleSelectionChange = (nextSelected) => {
    setSelected(nextSelected);
    setQty(1);
  };

  const handleAdd = () => {
    if (!canAdd || !product) return;
    const attributeSummary = (matchedVariant?.attribute_values || [])
      .map((x) => `${x.attribute_name}: ${x.value}`)
      .join(' · ');
    addItem({
      variant_id: matchedVariant?.id ?? product.id,  // si no hay variants, usamos product.id
      product_id: product.id,
      product_slug: product.slug,
      product_name: product.name,
      sku: matchedVariant?.sku ?? product.sku ?? null,
      attribute_summary: attributeSummary,
      unit_price: Number(effectivePrice),
      image_url: image || null,
      qty,
      stock: selectedStock,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };

  const handleBuyNow = () => {
    handleAdd();
    setTimeout(() => navigate('/carrito'), 100);
  };

  if (loading) return <div className="center"><span className="spinner" /></div>;
  if (error) return <Empty title="Producto no encontrado" description={error} action={
    <Link to="/" className="btn btn-primary">Volver al inicio</Link>
  } />;
  if (!product) return null;

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>
        <Link to="/">Inicio</Link> {' > '}
        {product.category_name && <Link to={`/categoria/${product.category_slug}`}>{product.category_name}</Link>}
        {' > '}
        {product.name}
      </p>

      <div className="product-page">
        <div className="product-gallery">
          <div
            className="gallery-frame"
            onMouseMove={handleGalleryMove}
            onMouseLeave={() => setZoom((current) => ({ ...current, visible: false }))}
          >
            <div className="gallery" style={image ? { backgroundImage: `url(${image})` } : undefined} />
            {zoom.visible && image && (
              <div
                className="gallery-zoom"
                aria-hidden="true"
                style={{
                  left: `${zoom.left}px`,
                  top: `${zoom.top}px`,
                }}
              >
                <img
                  className="gallery-zoom-image"
                  src={image}
                  alt=""
                  style={{ left: `${zoom.imageLeft}%`, top: `${zoom.imageTop}%` }}
                />
              </div>
            )}
          </div>
          {galleryImages.length > 1 && <div className="gallery-strip">
            {galleryImages.map((item) => (
              <button
                type="button"
                className={`gallery-thumb ${selectedGalleryImage?.id === item.id ? 'is-active' : ''}`}
                key={item.id}
                onClick={() => setActiveImageId(item.id)}
                aria-label={`Ver foto ${item.alt_text || product.name}`}
              >
                <img src={item.url} alt={item.alt_text || product.name} />
              </button>
            ))}
          </div>}
          {activeMedia.some((item) => item.kind === 'video_embed') && <div className="gallery-video-links">
            {activeMedia.filter((item) => item.kind === 'video_embed').map((item) => <a key={item.id} href={item.url} target="_blank" rel="noreferrer">▶ Ver video de esta variante</a>)}
          </div>}
        </div>

        <div>
          {product.brand && (
            <div style={{ color: 'var(--color-muted)', fontSize: 13, marginBottom: 4 }}>{product.brand}</div>
          )}
          <h1>{product.name}</h1>
          <div className="price-main" style={{ marginBottom: 16 }}>
            <Price value={effectivePrice} compare={effectiveCompare} />
          </div>

          {attributes.length > 0 && (
            <VariantSelector
              attributes={attributes}
              variants={product.variants || []}
              selected={selected}
              onChange={handleSelectionChange}
            />
          )}

          {hasSelectedVariant && (
            <div className="stock-status-line" style={{ color: selectedStock > 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
              <span>{selectedStock > 0 ? `✓ ${selectedStock} en stock` : '✗ Sin stock'}</span>
              {cartQty > 0 && selectedStock > 0 && <small>{cartQty} en tu carrito · {remainingStock} disponibles para agregar</small>}
            </div>
          )}

          {hasSelectedVariant && remainingStock > 0 && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 14 }}>Cantidad:</span>
              <QuantitySelector value={qty} onChange={setQty} max={maxQty} />
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-accent btn-lg" onClick={handleAdd} disabled={!canAdd}>
              {added ? '✓ Agregado' : 'Agregar al carrito'}
            </button>
            <button className="btn btn-primary btn-lg" onClick={handleBuyNow} disabled={!canAdd}>
              Comprar ahora
            </button>
          </div>

          {variantDescription && (
            <div style={{ marginTop: 24 }}>
              <h3>Descripción</h3>
              <p className="description">{variantDescription}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
