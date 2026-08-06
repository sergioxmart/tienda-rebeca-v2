// Carrito: lista de items, controles de cantidad, total, link a checkout.

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../cart/CartContext.jsx';
import { formatCOP } from '../components/Price.jsx';
import Empty from '../components/Empty.jsx';
import QuantitySelector from '../components/QuantitySelector.jsx';

export default function Cart() {
  const { items, subtotal, updateQty, removeItem } = useCart();
  const navigate = useNavigate();

  if (items.length === 0) {
    return (
      <Empty
        title="Tu carrito está vacío"
        description="Explorá nuestro catálogo y agregá productos."
        action={<Link to="/" className="btn btn-primary">Ver productos</Link>}
      />
    );
  }

  return (
    <div>
      <h1>Tu carrito</h1>
      <div className="cart-page">
        <div>
          {items.map((it) => (
            <div className="cart-item" key={it.variant_id}>
              <div className="thumb" style={it.image_url ? { backgroundImage: `url(${it.image_url})` } : undefined} />
              <div>
                <div className="name">
                  <Link to={`/producto/${it.product_slug}`}>{it.product_name}</Link>
                </div>
                {it.attribute_summary && <div className="attrs">{it.attribute_summary}</div>}
                {it.sku && <div className="attrs">SKU: <code>{it.sku}</code></div>}
                <div className="price">{formatCOP(it.unit_price)}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                <QuantitySelector value={it.qty} onChange={(q) => updateQty(it.variant_id, q)} />
                <button className="btn btn-sm btn-danger" onClick={() => removeItem(it.variant_id)}>Quitar</button>
              </div>
            </div>
          ))}
        </div>

        <aside className="cart-summary">
          <h3 style={{ marginTop: 0 }}>Resumen</h3>
          <div className="line">
            <span>Subtotal</span>
            <span>{formatCOP(subtotal)}</span>
          </div>
          <div className="line" style={{ color: 'var(--color-muted)', fontSize: 13 }}>
            <span>Envío</span>
            <span>Calculado en checkout</span>
          </div>
          <div className="line total">
            <span>Total</span>
            <span>{formatCOP(subtotal)}</span>
          </div>
          <button className="btn btn-accent btn-block btn-lg" style={{ marginTop: 16 }}
                  onClick={() => navigate('/checkout')}>
            Continuar al checkout
          </button>
          <Link to="/" className="btn btn-block" style={{ marginTop: 8 }}>
            Seguir comprando
          </Link>
        </aside>
      </div>
    </div>
  );
}
