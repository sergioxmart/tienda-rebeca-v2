// Checkout (stub v1). Form de envío, sin pasarela de pago todavía.
//
// En esta versión, después de llenar el form, se "confirma" el pedido
// localmente: vacía el carrito y muestra un mensaje de gracias. La
// integración con Wompi/ePayco viene en la sesión 6 (cuando Sergio
// tenga las credenciales).

import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../cart/CartContext.jsx';
import { useSite } from '../site/SiteContext.jsx';
import { formatCOP } from '../components/Price.jsx';

const EMPTY = {
  name: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  notes: '',
};

export default function Checkout() {
  const { items, subtotal, clear, revalidate } = useCart();
  const { site } = useSite();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [orderId, setOrderId] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(8 * 60);
  const expiryHandled = useRef(false);
  const deadline = useRef(Date.now() + 8 * 60 * 1000);

  useEffect(() => {
    if (confirmed || items.length === 0) return undefined;
    const tick = async () => {
      const seconds = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setRemainingSeconds(seconds);
      if (seconds > 0 || expiryHandled.current) return;
      expiryHandled.current = true;
      await revalidate();
      navigate('/', { replace: true, state: { checkoutExpired: true } });
    };
    const timer = window.setInterval(tick, 1000);
    tick();
    return () => window.clearInterval(timer);
  }, [confirmed, items.length, navigate, revalidate]);

  if (items.length === 0 && !confirmed) {
    return (
      <div className="empty">
        <h3>Tu carrito está vacío</h3>
        <p>Agregá productos antes de hacer checkout.</p>
        <Link to="/" className="btn btn-primary">Ver productos</Link>
      </div>
    );
  }

  const setField = (k, v) => setForm((cur) => ({ ...cur, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.phone || !form.address || !form.city) return;
    setSubmitting(true);
    // Stub: simular creación de orden. La sesión 6 va a llamar al backend
    // con Wompi o ePayco.
    await new Promise((r) => setTimeout(r, 600));
    const fakeId = 'TS-' + Math.floor(100000 + Math.random() * 900000);
    setOrderId(fakeId);
    setConfirmed(true);
    clear();
    setSubmitting(false);
  };

  if (confirmed) {
    return (
      <div className="center" style={{ maxWidth: 480, margin: '0 auto' }}>
        <h1>¡Gracias por tu compra!</h1>
        <p>Tu pedido <strong>{orderId}</strong> fue recibido. Te contactamos pronto por WhatsApp o email para confirmar el pago y envío.</p>
        <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>
          Cuando integremos la pasarela (Wompi o ePayco), vas a poder pagar
          directamente acá sin salir de la página.
        </p>
        <Link to="/" className="btn btn-primary">Volver al inicio</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="checkout-heading">
        <h1>Checkout</h1>
        <div className={`checkout-timer ${remainingSeconds <= 60 ? 'is-warning' : ''}`} role="timer" aria-live="polite">
          Tiempo restante: <strong>{String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:{String(remainingSeconds % 60).padStart(2, '0')}</strong>
        </div>
      </div>
      <div className="cart-page">
        <form onSubmit={handleSubmit}>
          <h3>Datos de contacto</h3>
          <div className="form-group">
            <label>Nombre completo *</label>
            <input className="input" required value={form.name} onChange={(e) => setField('name', e.target.value)} />
          </div>
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Email *</label>
              <input className="input" type="email" required value={form.email} onChange={(e) => setField('email', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Teléfono / WhatsApp *</label>
              <input className="input" type="tel" required value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
            </div>
          </div>

          <h3 style={{ marginTop: 16 }}>Envío</h3>
          <div className="form-group">
            <label>Dirección *</label>
            <input className="input" required value={form.address} onChange={(e) => setField('address', e.target.value)} placeholder="Calle 100 #15-20, Apto 301" />
          </div>
          <div className="form-group">
            <label>Ciudad *</label>
            <input className="input" required value={form.city} onChange={(e) => setField('city', e.target.value)} placeholder="Bogotá" />
          </div>
          <div className="form-group">
            <label>Notas <span style={{ color: 'var(--color-muted)' }}>(opcional)</span></label>
            <textarea className="textarea" value={form.notes} onChange={(e) => setField('notes', e.target.value)} placeholder="Barrio, referencias, indicaciones especiales..." />
          </div>

          <h3 style={{ marginTop: 16 }}>Pago</h3>
          <div className="alert alert-info">
            <strong>Próximamente:</strong> Vas a poder pagar con Wompi o ePayco
            (tarjeta, PSE, Nequi, Daviplata). Por ahora, después de enviar
            el pedido te contactamos para coordinar el pago.
          </div>

          <button type="submit" className="btn btn-accent btn-lg btn-block" disabled={submitting}>
            {submitting ? <span className="spinner" /> : `Confirmar pedido · ${formatCOP(subtotal)}`}
          </button>
        </form>

        <aside className="cart-summary">
          <h3 style={{ marginTop: 0 }}>Tu pedido</h3>
          {items.map((it) => (
            <div className="line" key={it.variant_id} style={{ fontSize: 13 }}>
              <span>{it.qty}× {it.product_name}{it.attribute_summary ? ` (${it.attribute_summary})` : ''}</span>
              <span>{formatCOP(it.unit_price * it.qty)}</span>
            </div>
          ))}
          <div className="line total">
            <span>Total</span>
            <span>{formatCOP(subtotal)}</span>
          </div>
          {site?.contact_phone_display && (
            <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 16 }}>
              ¿Dudas? Escribinos al <a href={`https://wa.me/${site.contact_phone.replace(/\D/g, '')}`}>{site.contact_phone_display}</a>
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
