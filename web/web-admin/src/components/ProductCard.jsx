// Tarjeta de producto para la grilla tipo SHEIN.
// Imagen principal (la primera de product_media), estrella de destacado,
// nombre y precios. Ocultar y eliminar viven dentro del modal de edición.

import { useState } from 'react';
import { priceLines } from '../lib/products.js';

function Cover({ product }) {
  // Una URL rota (foto borrada del disco, ruta vieja) no puede terminar en el
  // ícono de imagen rota: cae al mismo placeholder que un producto sin fotos.
  const [broken, setBroken] = useState(false);

  if (!product.image_url || broken) {
    return (
      <div className="prod-cover-empty" aria-hidden="true">
        <span>Sin fotos</span>
      </div>
    );
  }
  return (
    <img
      className="prod-cover-img"
      src={product.image_url}
      alt={product.name}
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}

export default function ProductCard({ product, onEdit, onToggleFeatured, canEdit = true }) {
  const p = product;
  return (
    <div className={`prod-card ${p.published ? '' : 'is-off'}`}>
      {canEdit ? (
        <button
          type="button"
          className="prod-cover"
          onClick={() => onEdit(p)}
          aria-label={`Editar ${p.name}`}
        >
          <Cover product={p} />
          {!p.published && <span className="prod-badge">No publicado</span>}
          {Number(p.stock_total) === 0 && <span className="prod-badge prod-badge--soldout">Agotado</span>}
        </button>
      ) : (
        <div className="prod-cover" aria-label={p.name}>
          <Cover product={p} />
          {!p.published && <span className="prod-badge">No publicado</span>}
          {Number(p.stock_total) === 0 && <span className="prod-badge prod-badge--soldout">Agotado</span>}
        </div>
      )}

      {/* Fuera del botón de portada a propósito: un <button> dentro de otro no
          es HTML válido y el click del de adentro no llega. */}
      {canEdit && (
        <button
          type="button"
          className={`prod-star ${p.featured ? 'on' : ''}`}
          onClick={() => onToggleFeatured(p)}
          title={p.featured ? 'Quitar de destacados' : 'Marcar como destacado'}
          aria-label={p.featured ? `Quitar "${p.name}" de destacados` : `Marcar "${p.name}" como destacado`}
          aria-pressed={!!p.featured}
        >
          {p.featured ? '★' : '☆'}
        </button>
      )}

      <div className="prod-meta">
        <div className="prod-name" title={p.name}>{p.name}</div>
        <div className="prod-sub">
          {p.collection_name}
          {p.sku && <span className="prod-sku">{p.sku}</span>}
        </div>
        <div className="prod-prices">
          {priceLines(p).map((line) => (
            <div key={line.label} className="prod-price-line">
              <span>{line.label}</span>
              <strong>{line.price}</strong>
            </div>
          ))}
        </div>
      </div>

      {canEdit && (
        <div className="prod-actions">
          <button className="row-btn" onClick={() => onEdit(p)}>Editar</button>
        </div>
      )}
    </div>
  );
}
