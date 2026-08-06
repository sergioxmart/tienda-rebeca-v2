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
  const { addItem } = useCart();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState({});  // { attribute_id: attribute_value_id }
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

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
      id: a.id,
      name: a.name,
      slug: a.slug,
      type: a.type,
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
  const effectivePrice = matchedVariant?.price ?? product?.base_price;
  const effectiveStock = matchedVariant?.stock ?? product?.total_stock ?? 0;
  const isAllSelected = attributes.length > 0 && Object.keys(selected).length === attributes.length;
  const canAdd = (attributes.length === 0 || isAllSelected) && effectiveStock > 0;

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
      image_url: product.image_url || product.thumb_url || null,
      qty,
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

  const image = product.image_url || product.thumb_url;

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>
        <Link to="/">Inicio</Link> {' > '}
        {product.category_name && <Link to={`/categoria/${product.category_slug}`}>{product.category_name}</Link>}
        {' > '}
        {product.name}
      </p>

      <div className="product-page">
        <div className="gallery" style={image ? { backgroundImage: `url(${image})` } : undefined} />

        <div>
          {product.brand && (
            <div style={{ color: 'var(--color-muted)', fontSize: 13, marginBottom: 4 }}>{product.brand}</div>
          )}
          <h1>{product.name}</h1>
          <div className="price-main" style={{ marginBottom: 16 }}>
            <Price value={effectivePrice} compare={matchedVariant?.compare_at ?? product.compare_at} />
          </div>

          {attributes.length > 0 && (
            <VariantSelector
              attributes={attributes}
              variants={product.variants || []}
              selected={selected}
              onChange={setSelected}
            />
          )}

          <div style={{ marginBottom: 16, color: effectiveStock > 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
            {effectiveStock > 0
              ? `✓ ${effectiveStock} en stock`
              : '✗ Sin stock'}
          </div>

          {effectiveStock > 0 && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 14 }}>Cantidad:</span>
              <QuantitySelector value={qty} onChange={setQty} max={Math.min(99, effectiveStock)} />
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

          {product.description && (
            <div style={{ marginTop: 24 }}>
              <h3>Descripción</h3>
              <p className="description">{product.description}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
