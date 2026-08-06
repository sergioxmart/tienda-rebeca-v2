// Carrito en modal: lista de items, total, botón "Enviar por WhatsApp".

import { useEffect, useState } from 'react';
import { getCart, removeFromCart, clearCart, subscribe } from './cart.js';
import { api } from './api.js';
import { money, TYPE_LABELS, shortDate } from './format.js';

export default function Cart({ open, onClose }) {
  const [items, setItems] = useState(getCart());
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    return subscribe(() => setItems(getCart()));
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const purchases = items.filter((item) => item.type === 'venta');
  const rentals = items.filter((item) => item.type !== 'venta');

  async function send() {
    if (!items.length) return;
    setPending(true);
    setErr('');
    const r = await api('/api/public/cart-whatsapp', {
      method: 'POST',
      body: {
        items: purchases.map((i) => ({
          product_id: i.id,
          quantity: i.qty,
          size_id: i.size_id,
          color_id: i.color_id || null,
        })),
        reservation_ids: rentals.map((i) => i.reservation_id).filter(Boolean),
      },
    });
    setPending(false);
    if (r.ok) {
      if (r.data.data.whatsapp_url) {
        window.open(r.data.data.whatsapp_url, '_blank');
      }
      clearCart();
      onClose();
    } else {
      setErr(r.data?.error || 'Error al generar el link');
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-dialog modal-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Tu carrito</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {err && <div className="form-err">{err}</div>}
          {items.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--gray)', padding: 24 }}>
              Tu carrito está vacío. Agrega vestidos desde la página de cada producto.
            </p>
          ) : (
            <>
              {purchases.length > 0 && <CartGroup title="Para comprar" items={purchases} />}
              {rentals.length > 0 && <CartGroup title="Para alquilar" items={rentals} />}
              {purchases.length > 0 && <div className="cart-total"><span>Total de compra</span><strong>{money(purchases.reduce((sum, item) => sum + item.price * item.qty, 0))}</strong></div>}
              <p className="form-hint" style={{ marginTop: 12 }}>
                Al enviar, te llevamos a WhatsApp con el resumen para confirmar con Rebeca.
              </p>
            </>
          )}
        </div>
        {items.length > 0 && (
          <div className="modal-footer">
            <button className="btn secondary" onClick={clearCart}>Vaciar</button>
            <button className="btn" onClick={send} disabled={pending}>
              {pending ? 'Generando…' : 'Enviar por WhatsApp'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CartGroup({ title, items }) {
  return (
    <section className="cart-group">
      <h3>{title}</h3>
      {items.map((item) => (
        <div key={item.key} className="cart-line">
          <div className="cart-line__info">
            <div className="cart-line__name">{item.name}</div>
            <div className="cart-line__meta">
              {item.collection_name} · {TYPE_LABELS[item.type] || item.type}
              {item.color_label ? ` · Color ${item.color_label}` : ''}
              {item.size_label ? ` · Talla ${item.size_label}` : ''}
              {item.type === 'venta' ? ` · ${money(item.price)} c/u` : ` · ${shortDate(item.start_date)} al ${shortDate(item.end_date)}`}
            </div>
          </div>
          <div className="cart-line__qty">× {item.qty}</div>
          <div className="cart-line__total">{money(item.price * item.qty)}</div>
          <button className="row-btn" onClick={() => removeFromCart(item.key)} aria-label={`Quitar ${item.name}`}>×</button>
        </div>
      ))}
    </section>
  );
}
