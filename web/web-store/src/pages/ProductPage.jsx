// Detalle de producto: imagen, info, selector de variante, agregar al carrito.
//
// Si el producto no tiene variantes (caso raro en v1 pero soportado), el
// botón "Agregar" crea un item sin variant_id (igual lo soportamos en el
// CartContext si llega).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useCart } from '../cart/CartContext.jsx';
import { useSite } from '../site/SiteContext.jsx';
import Price from '../components/Price.jsx';
import VariantSelector from '../components/VariantSelector.jsx';
import QuantitySelector from '../components/QuantitySelector.jsx';
import Empty from '../components/Empty.jsx';

function normalizeLabel(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function formatReservationDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
}

const GALLERY_ZOOM_SCALE = 2.5;

export default function ProductPage() {
  const { slug } = useParams();
  const { site } = useSite();
  const { addItem, items } = useCart();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState({});  // { attribute_id: attribute_value_id }
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [activeImageId, setActiveImageId] = useState(null);
  const [zoom, setZoom] = useState({ visible: false, imageLeft: 0, imageTop: 0, left: 0, top: 0 });
  const [reservationModalOpen, setReservationModalOpen] = useState(false);
  const [reservationSaving, setReservationSaving] = useState(false);
  const [reservationError, setReservationError] = useState('');
  const [reservationLead, setReservationLead] = useState(null);
  const [reservationForm, setReservationForm] = useState({ use_date: '', use_end_date: '', pickup_date: '', name: '', email: '', phone: '' });
  const touchZoomRef = useRef(false);
  const onlinePurchasesEnabled = site?.online_purchases_enabled !== false;

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

  const selectedEntries = useMemo(
    () => Object.entries(selected)
      .filter(([, valueId]) => valueId !== '' && valueId !== null && valueId !== undefined)
      .map(([attributeId, valueId]) => [Number(attributeId), Number(valueId)]),
    [selected],
  );

  // Variantes compatibles con la selección parcial. Esta lista solo alimenta
  // la previsualización; no habilita la compra de una combinación incompleta.
  const candidateVariants = useMemo(() => {
    if (!product?.variants?.length || selectedEntries.length === 0) return [];
    return product.variants.filter((variant) => {
      const attributeValues = variant.attribute_values || [];
      return selectedEntries.every(([attributeId, valueId]) =>
        attributeValues.some((item) =>
          Number(item.attribute_id) === attributeId
          && Number(item.attribute_value_id) === valueId
        )
      );
    });
  }, [product, selectedEntries]);

  // La variante exacta sigue siendo la única válida para comprar o reservar.
  const matchedVariant = useMemo(() => {
    if (selectedEntries.length === 0) return null;
    return candidateVariants.find((variant) =>
      (variant.attribute_values || []).length === selectedEntries.length
    ) || null;
  }, [candidateVariants, selectedEntries]);

  // Precio y stock efectivos
  // Antes de que el cliente elija, usamos la primera variante activa como
  // referencia visual. No marcamos sus atributos como seleccionados: solo
  // definimos la imagen, descripción y precio iniciales de la página.
  const defaultVariant = product?.variants?.find((variant) => Number(variant.stock) > 0)
    || product?.variants?.[0]
    || null;
  // Para una selección parcial usamos una candidata compatible como referencia
  // visual. La variante exacta sigue teniendo prioridad cuando ya existe.
  const previewVariant = candidateVariants.find((variant) => Number(variant.stock) > 0)
    || candidateVariants[0]
    || null;
  const displayVariant = matchedVariant || previewVariant || defaultVariant;
  const effectivePrice = displayVariant && Number(displayVariant.price) > 0
    ? displayVariant.price
    : product?.base_price;
  const effectiveCompare = displayVariant && Number(displayVariant.compare_at) > 0
    ? displayVariant.compare_at
    : product?.compare_at;
  const discountPercent = Number(effectiveCompare) > Number(effectivePrice) && Number(effectiveCompare) > 0
    ? Math.round(((Number(effectiveCompare) - Number(effectivePrice)) / Number(effectiveCompare)) * 100)
    : 0;
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
  const candidateMedia = useMemo(() => {
    if (selectedEntries.length === 0 || candidateVariants.length === 0) return [];

    const seen = new Set();
    const media = [];
    for (const variant of candidateVariants) {
      for (const item of variant.media || []) {
        const key = item.id !== null && item.id !== undefined
          ? `id:${item.id}`
          : `${item.kind || ''}:${item.url || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        media.push(item);
      }
    }
    return media.sort((a, b) =>
      Number(a.display_order || 0) - Number(b.display_order || 0)
    );
  }, [candidateVariants, selectedEntries]);

  const activeMedia = candidateMedia.length > 0
    ? candidateMedia
    : (displayVariant?.media?.length ? displayVariant.media : (product?.media || []));
  const galleryImages = activeMedia.filter((item) => item.kind === 'image');
  const selectedGalleryImage = galleryImages.find((item) => item.id === activeImageId) || galleryImages[0];
  // Las entradas de product_media.url son las fuentes originales subidas al
  // servidor. Preferirlas aquí evita que el zoom termine usando una miniatura
  // o un fallback optimizado cuando la galería sí tiene la imagen completa.
  const image = selectedGalleryImage?.url
    || activeMedia.find((item) => item.kind === 'image')?.url
    || product?.media?.find((item) => item.kind === 'image')?.url
    || product?.image_url
    || product?.thumb_url;
  const variantDescription = displayVariant?.description || product?.description;
  const availabilityAttribute = attributes.find((attribute) => normalizeLabel(attribute.slug) === 'disponibilidad');
  const availabilityValue = availabilityAttribute
    ? availabilityAttribute.values.find((value) => Number(value.id) === Number(selected[availabilityAttribute.id]))
    : null;
  const requestedType = normalizeLabel(availabilityValue?.value) === 'alquiler como nuevo'
    ? 'alquiler_nuevo'
    : normalizeLabel(availabilityValue?.value) === 'alquiler' ? 'alquiler' : null;
  const rentalSelected = Boolean(requestedType);

  useEffect(() => {
    setActiveImageId(null);
    setZoom((current) => ({ ...current, visible: false }));
  }, [displayVariant?.id, product?.id, selected]);

  useEffect(() => {
    if (!rentalSelected) {
      setReservationModalOpen(false);
      setReservationLead(null);
    }
  }, [rentalSelected]);

  const updateZoomFromPoint = (clientX, clientY, target) => {
    if (!image) return;
    const rect = target.getBoundingClientRect();
    const clamp = (value) => Math.max(0, Math.min(1, value));
    const x = clamp((clientX - rect.left) / rect.width);
    const y = clamp((clientY - rect.top) / rect.height);
    // La imagen interna mide 250% del recuadro. El offset centra el punto del
    // cursor dentro del zoom y se limita en los bordes para no dejar espacios.
    const imageOffset = (point) => Math.max(100 - (GALLERY_ZOOM_SCALE * 100), Math.min(0, 50 - (point * GALLERY_ZOOM_SCALE * 100)));
    const size = typeof window !== 'undefined'
      && window.matchMedia('(max-width: 760px)').matches
      ? 240
      : 184;
    const left = Math.min(Math.max(10, clientX - rect.left + 18), Math.max(10, rect.width - size - 10));
    const top = Math.min(Math.max(10, clientY - rect.top + 18), Math.max(10, rect.height - size - 10));
    setZoom({
      visible: true,
      imageLeft: imageOffset(x),
      imageTop: imageOffset(y),
      left,
      top,
    });
  };

  const handleGalleryMove = (event) => {
    if (touchZoomRef.current) return;
    updateZoomFromPoint(event.clientX, event.clientY, event.currentTarget);
  };

  const handleGalleryTouchStart = (event) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchZoomRef.current = true;
    updateZoomFromPoint(touch.clientX, touch.clientY, event.currentTarget);
  };

  const handleGalleryTouchMove = (event) => {
    const touch = event.touches[0];
    if (!touch) return;
    if (event.cancelable) event.preventDefault();
    updateZoomFromPoint(touch.clientX, touch.clientY, event.currentTarget);
  };

  const handleGalleryTouchEnd = () => {
    touchZoomRef.current = false;
    setZoom((current) => ({ ...current, visible: false }));
  };

  useEffect(() => {
    setQty((current) => Math.min(Math.max(Number(current) || 1, 1), Math.max(1, maxQty)));
  }, [maxQty]);

  const handleSelectionChange = (nextSelected) => {
    setSelected(nextSelected);
    setQty(1);
    setReservationLead(null);
  };

  const handleReservationSubmit = async (event) => {
    event.preventDefault();
    if (!product || !matchedVariant || !requestedType) return;
    setReservationSaving(true);
    setReservationError('');
    try {
      const result = await api.createReservationLead({
        product_id: product.id,
        variant_id: matchedVariant.id,
        requested_type: requestedType,
        ...reservationForm,
      });
      setReservationLead(result.reservation);
      setReservationModalOpen(false);
    } catch (error) {
      setReservationError(error.message || 'No pudimos guardar los datos de la reserva.');
    } finally {
      setReservationSaving(false);
    }
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

  const handleQuote = () => {
    if (!product || !hasSelectedVariant) return;
    const phone = String(site?.contact_phone || '').replace(/\D/g, '');
    if (!phone) {
      window.alert('La tienda todavía no tiene un teléfono de WhatsApp configurado.');
      return;
    }
    const attributeSummary = (matchedVariant?.attribute_values || [])
      .map((x) => `${x.attribute_name}: ${x.value}`)
      .join(' · ');
    const currentItem = {
      variant_id: matchedVariant?.id ?? product.id,
      product_id: product.id,
      product_name: product.name,
      attribute_summary: attributeSummary,
      qty: Math.max(1, Number(qty) || 1),
    };
    const merged = new Map();
    [currentItem, ...items].forEach((item) => {
      const key = item.variant_id !== null && item.variant_id !== undefined
        ? `variant:${item.variant_id}`
        : `product:${item.product_id}:${item.attribute_summary || ''}`;
      const existing = merged.get(key);
      merged.set(key, existing
        ? { ...existing, qty: existing.qty + Math.max(1, Number(item.qty) || 1) }
        : { ...item, qty: Math.max(1, Number(item.qty) || 1) });
    });
    const lines = [
      'Hola Rebeca, quiero cotizar estos productos:',
      ...Array.from(merged.values()).flatMap((item, index) => [
        `${index + 1}. ${item.product_name || 'Producto'} · Cantidad: ${item.qty}`,
        ...(item.attribute_summary ? [`   ${item.attribute_summary}`] : []),
      ]),
      '',
      'Quedo atento(a) a la cotización. ¡Gracias!',
    ];
    if (reservationLead || (rentalSelected && reservationForm.use_date)) {
      lines.splice(lines.length - 2, 0,
        '',
        `Datos de reserva (${requestedType === 'alquiler_nuevo' ? 'Alquiler como nuevo' : 'Alquiler'}):`,
        `Fecha de uso: ${formatReservationDate(reservationForm.use_date)} → ${formatReservationDate(reservationForm.use_end_date || reservationForm.use_date)}`,
        `Fecha de recogida: ${formatReservationDate(reservationForm.pickup_date)}`,
        `Nombre: ${reservationForm.name}`,
        `Correo: ${reservationForm.email}`,
        `Teléfono: ${reservationForm.phone}`,
        ...(reservationLead?.reservation_number ? [`Solicitud: ${reservationLead.reservation_number}`] : []),
      );
    }
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
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
            onTouchStart={handleGalleryTouchStart}
            onTouchMove={handleGalleryTouchMove}
            onTouchEnd={handleGalleryTouchEnd}
            onTouchCancel={handleGalleryTouchEnd}
          >
            <div
              className="gallery"
              role="img"
              aria-label={selectedGalleryImage?.alt_text || product.name}
              style={image ? { backgroundImage: `url(${image})` } : undefined}
            />
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
                  decoding="async"
                  style={{
                    width: `${GALLERY_ZOOM_SCALE * 100}%`,
                    height: `${GALLERY_ZOOM_SCALE * 100}%`,
                    left: `${zoom.imageLeft}%`,
                    top: `${zoom.imageTop}%`,
                  }}
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
            <div className="price-display-row">
              <Price value={effectivePrice} compare={effectiveCompare} />
              {discountPercent > 0 && <span className="discount-badge">-{discountPercent}%</span>}
            </div>
          </div>

          {attributes.length > 0 && (
            <VariantSelector
              attributes={attributes}
              variants={product.variants || []}
              selected={selected}
              onChange={handleSelectionChange}
            />
          )}

          {rentalSelected && hasSelectedVariant && (
            <div className="reservation-opt-in">
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(reservationLead)}
                  onChange={(event) => {
                    if (event.target.checked) {
                      setReservationError('');
                      setReservationModalOpen(true);
                    } else {
                      setReservationLead(null);
                    }
                  }}
                />
                <span><strong>Quiero agendar esta reserva</strong><small>Déjanos las fechas y tus datos para preparar la cotización.</small></span>
              </label>
              {reservationLead && <button type="button" className="reservation-edit-link" onClick={() => setReservationModalOpen(true)}>Editar datos</button>}
            </div>
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

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {onlinePurchasesEnabled && <button className="btn btn-accent btn-lg" onClick={handleAdd} disabled={!canAdd}>
              {added ? '✓ Agregado' : 'Agregar al carrito'}
            </button>}
            <button className="btn btn-primary btn-lg" onClick={handleQuote} disabled={!hasSelectedVariant}>
              Cotizar por WhatsApp
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

      {reservationModalOpen && (
        <div className="account-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setReservationModalOpen(false)}>
          <section className="account-modal reservation-modal" role="dialog" aria-modal="true" aria-labelledby="reservation-modal-title">
            <span className="account-modal-icon account-modal-icon-success">⌁</span>
            <h2 id="reservation-modal-title">Agenda tu reserva</h2>
            <p>Completa estos datos para que Rebeca pueda confirmar disponibilidad y prepararte una cotización.</p>
            <form onSubmit={handleReservationSubmit}>
              <div className="reservation-form-grid">
                <label>Inicio de uso<input className="input" type="date" required value={reservationForm.use_date} onChange={(event) => setReservationForm((current) => ({ ...current, use_date: event.target.value }))} /></label>
                <label>Fin de uso<input className="input" type="date" required min={reservationForm.use_date || undefined} value={reservationForm.use_end_date} onChange={(event) => setReservationForm((current) => ({ ...current, use_end_date: event.target.value }))} /></label>
                <label>Fecha de recogida<input className="input" type="date" required value={reservationForm.pickup_date} onChange={(event) => setReservationForm((current) => ({ ...current, pickup_date: event.target.value }))} /></label>
                <label>Nombre completo<input className="input" type="text" required maxLength={160} value={reservationForm.name} onChange={(event) => setReservationForm((current) => ({ ...current, name: event.target.value }))} /></label>
                <label>Correo electrónico<input className="input" type="email" required maxLength={254} value={reservationForm.email} onChange={(event) => setReservationForm((current) => ({ ...current, email: event.target.value }))} /></label>
                <label>Teléfono<input className="input" type="tel" required maxLength={40} value={reservationForm.phone} onChange={(event) => setReservationForm((current) => ({ ...current, phone: event.target.value }))} /></label>
              </div>
              {reservationError && <div className="alert alert-error" role="alert">{reservationError}</div>}
              <div className="account-modal-actions">
                <button className="btn" type="button" onClick={() => setReservationModalOpen(false)} disabled={reservationSaving}>Cancelar</button>
                <button className="btn btn-primary" type="submit" disabled={reservationSaving}>{reservationSaving ? 'Guardando…' : 'Guardar reserva'}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
