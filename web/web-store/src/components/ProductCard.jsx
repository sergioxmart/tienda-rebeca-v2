// Tarjeta de producto. Usada en grid de Home y Catalog.

import React from 'react';
import { Link } from 'react-router-dom';
import Price from './Price.jsx';

export default function ProductCard({ product }) {
  const outOfStock = (product.total_stock ?? 1) === 0;
  const image = product.image_url || product.thumb_url;
  return (
    <Link to={`/producto/${product.slug}`} className="product-card">
      <div className="image" style={image ? { backgroundImage: `url(${image})` } : undefined}>
        {outOfStock && <span className="badge-stock">Agotado</span>}
      </div>
      <div className="info">
        {product.brand && <div className="brand">{product.brand}</div>}
        <div className="name">{product.name}</div>
        <div>
          <Price value={product.price ?? product.base_price} compare={product.compare_at ?? product.compare_at_price} className="price" />
        </div>
      </div>
    </Link>
  );
}
