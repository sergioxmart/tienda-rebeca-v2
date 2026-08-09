// Checkout conectado al backend. El pedido se crea como pending y la pasarela
// elegida lo confirma únicamente mediante el webhook firmado.

import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../cart/CartContext.jsx';
import { useSite } from '../site/SiteContext.jsx';
import { formatCOP } from '../components/Price.jsx';
import { api } from '../api.js';
import DeliveryLocationPicker from '../components/DeliveryLocationPicker.jsx';
import ColombiaLocationFields from '../components/ColombiaLocationFields.jsx';
import { useCustomer } from '../customer/CustomerContext.jsx';

const EMPTY = {
  name: '',
  email: '',
  phone: '',
  department: '',
  address: '',
  city: '',
  notes: '',
};

const MERCADO_PAGO_LOGO = '/assets/payment-methods/Mercado%20Pago%20Uso%20digital%20-%20RGB/SVGs/MP_RGB_HANDSHAKE_color_horizontal.svg';

function MercadoPagoLogo() {
  return (
    <span className="payment-method-logo payment-method-logo-mercadopago">
      <img className="payment-method-logo-image" src={MERCADO_PAGO_LOGO} alt="Mercado Pago" />
    </span>
  );
}

function EpaycoLogo() {
  return (
    <span className="payment-method-logo payment-method-logo-epayco" aria-label="ePayco">
      <span className="payment-method-logo-mark" aria-hidden="true">e</span>
      <span className="payment-method-logo-wordmark"><b>e</b>payco</span>
    </span>
  );
}

export default function Checkout() {
  const { items, subtotal, clear, revalidate } = useCart();
  const { site } = useSite();
  const { customer, addresses, login } = useCustomer();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [orderId, setOrderId] = useState(null);
  const [paymentCheckout, setPaymentCheckout] = useState(null);
  const [paymentMessage, setPaymentMessage] = useState('');
  const [paymentProvider, setPaymentProvider] = useState('mercadopago');
  const [deliveryLocation, setDeliveryLocation] = useState(null);
  const [accountHint, setAccountHint] = useState(false);
  const [accountLookupLoading, setAccountLookupLoading] = useState(false);
  const [customerOtpSent, setCustomerOtpSent] = useState(false);
  const [customerOtp, setCustomerOtp] = useState('');
  const [customerAuthBusy, setCustomerAuthBusy] = useState(false);
  const [customerAuthMessage, setCustomerAuthMessage] = useState('');
  const [customerAuthError, setCustomerAuthError] = useState('');
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState(8 * 60);
  const expiryHandled = useRef(false);
  const deadline = useRef(Date.now() + 8 * 60 * 1000);

  useEffect(() => {
    if (!customer || form.name) return;
    setForm((current) => ({ ...current, name: customer.name || current.name, phone: customer.phone || current.phone }));
  }, [customer]);

  useEffect(() => {
    const email = form.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || customer || customerOtpSent) {
      setAccountHint(false);
      setAccountLookupLoading(false);
      return undefined;
    }
    let cancelled = false;
    setAccountLookupLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = await api.customerLookup(email);
        if (!cancelled) setAccountHint(Boolean(result.has_history && result.can_login));
      } catch {
        if (!cancelled) setAccountHint(false);
      } finally {
        if (!cancelled) setAccountLookupLoading(false);
      }
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [form.email, customer, customerOtpSent]);

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

  const requestCustomerLogin = async () => {
    setCustomerAuthBusy(true); setCustomerAuthError(''); setCustomerAuthMessage('');
    try {
      const result = await api.requestCustomerOtp(form.email);
      if (!result.sent) {
        setCustomerAuthMessage('No encontramos una cuenta para ese correo. Puedes continuar como invitado.');
      } else {
        setCustomerOtpSent(true);
        setAccountHint(false);
        setCustomerAuthMessage('Te enviamos un PIN de 6 dígitos. Revisa tu correo.');
      }
    } catch (error) { setCustomerAuthError(error.message || 'No pudimos enviar el PIN.'); }
    finally { setCustomerAuthBusy(false); }
  };

  const verifyCustomerLogin = async () => {
    setCustomerAuthBusy(true); setCustomerAuthError('');
    try {
      const result = await api.verifyCustomerOtp(form.email, customerOtp);
      login(result);
      setForm((current) => ({ ...current, name: result.customer?.name || current.name, phone: result.customer?.phone || current.phone }));
      if (result.addresses?.length > 0) {
        setSelectedAddressId(String(result.addresses[0].id));
        const address = result.addresses[0];
        setForm((current) => ({ ...current, name: result.customer?.name || current.name, phone: address.phone || result.customer?.phone || current.phone, department: address.department || current.department, address: address.address, city: address.city, notes: address.notes || current.notes }));
        setDeliveryLocation(address.latitude !== null && address.longitude !== null ? { lat: address.latitude, lon: address.longitude } : null);
      }
      setCustomerOtpSent(false);
      setCustomerOtp('');
      setCustomerAuthMessage('Sesión iniciada. Puedes usar tus datos o continuar como invitado.');
    } catch (error) { setCustomerAuthError(error.message || 'El PIN no es válido.'); }
    finally { setCustomerAuthBusy(false); }
  };

  const selectSavedAddress = (value) => {
    setSelectedAddressId(value);
    const address = addresses.find((item) => String(item.id) === String(value));
    if (!address) return;
    setForm((current) => ({ ...current, phone: address.phone || current.phone, department: address.department || current.department, address: address.address, city: address.city, notes: address.notes || '' }));
    setDeliveryLocation(address.latitude !== null && address.longitude !== null ? { lat: address.latitude, lon: address.longitude } : null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.phone || !form.address || !form.city) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const data = await api.createOrder({
        customer: { ...form, delivery_location: deliveryLocation },
        items: items.map((item) => ({
          variant_id: item.variant_id,
          product_id: item.product_id,
          qty: item.qty,
        })),
      });
      if (!data.order?.order_number) throw new Error('El servidor no devolvió el número del pedido.');
      setOrderId(data.order.order_number);
      try {
        const payment = await api.createPaymentIntent({
          order_number: data.order.order_number,
          email: form.email,
          provider: paymentProvider,
        });
        setPaymentCheckout(payment?.checkout || null);
      } catch (paymentError) {
        // El pedido sí quedó guardado. No simulamos un pago exitoso si las
        // llaves de ePayco aún no están configuradas o la sesión falla.
        setPaymentMessage(paymentError.message || 'El pedido quedó pendiente; no pudimos abrir el pago en línea.');
      }
      setConfirmed(true);
      clear();
    } catch (err) {
      if (err.status === 409) await revalidate();
      setSubmitError(err.message || 'No pudimos registrar el pedido. Intenta nuevamente.');
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmed) {
    const openPayment = () => {
      if (paymentCheckout?.type === 'redirect' && paymentCheckout.redirect_url) {
        window.location.assign(paymentCheckout.redirect_url);
        return;
      }
      if (!paymentCheckout?.session_id || !window.ePayco?.checkout) {
        setPaymentMessage('No se pudo cargar la pasarela de pago. Recarga la página e inténtalo nuevamente.');
        return;
      }
      const checkout = window.ePayco.checkout.configure({
        sessionId: paymentCheckout.session_id,
        type: paymentCheckout.type || 'onpage',
        test: paymentCheckout.test !== false,
      });
      checkout.setHooks({
        onCreated: () => setPaymentMessage('Checkout abierto. Completa el pago en la ventana.'),
        onResponse: () => setPaymentMessage('Respuesta recibida. Estamos confirmando el pago de forma segura.'),
        onErrors: () => setPaymentMessage('La pasarela reportó un error. Puedes intentarlo nuevamente.'),
        onClosed: () => setPaymentMessage('Checkout cerrado. El pedido continuará pendiente hasta confirmar el pago.'),
      });
      checkout.open();
    };
    return (
      <div className="center" style={{ maxWidth: 480, margin: '0 auto' }}>
        <h1>¡Pedido recibido!</h1>
        <p>Tu pedido <strong>{orderId}</strong> quedó registrado como pendiente.</p>
        {paymentCheckout ? (
          <button type="button" className="btn btn-accent" onClick={openPayment}>
            {paymentProvider === 'mercadopago' ? 'Pagar con Mercado Pago' : 'Pagar con ePayco'}
          </button>
        ) : (
          <div className="alert alert-warning">{paymentMessage || 'El pedido quedó pendiente de pago.'}</div>
        )}
        {paymentMessage && paymentCheckout && <p className="alert alert-info" role="status">{paymentMessage}</p>}
        <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>
          El pedido solo pasará a pagado cuando la pasarela confirme la
          transacción en el servidor. La pantalla de respuesta no modifica el pedido.
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
              {!customer && accountLookupLoading && <small className="account-inline-hint">Revisando si puedes usar tus datos guardados…</small>}
              {!customer && accountHint && !customerOtpSent && (
                <div className="account-checkout-invite">
                  <div><strong>Ya has comprado con nosotros</strong><small>¿Quieres recibir un PIN y autocompletar tus datos?</small></div>
                  <button type="button" className="btn btn-primary" onClick={requestCustomerLogin} disabled={customerAuthBusy}>{customerAuthBusy ? 'Enviando…' : 'Enviar PIN'}</button>
                </div>
              )}
              {!customer && customerOtpSent && (
                <div className="account-checkout-otp">
                  <label htmlFor="checkout-customer-otp">PIN de 6 dígitos</label>
                  <div className="account-checkout-otp-row"><input id="checkout-customer-otp" className="input" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={customerOtp} onChange={(e) => setCustomerOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} /><button type="button" className="btn btn-primary" onClick={verifyCustomerLogin} disabled={customerAuthBusy || customerOtp.length !== 6}>{customerAuthBusy ? 'Validando…' : 'Ingresar'}</button></div>
                  <button type="button" className="account-continue-guest" onClick={() => { setCustomerOtpSent(false); setCustomerOtp(''); setCustomerAuthMessage(''); }}>Continuar como invitado</button>
                </div>
              )}
              {customerAuthMessage && <small className="account-inline-message" role="status">{customerAuthMessage}</small>}
              {customerAuthError && <small className="account-inline-error" role="alert">{customerAuthError}</small>}
            </div>
            <div className="form-group">
              <label>Teléfono / WhatsApp *</label>
              <input className="input" type="tel" required value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
            </div>
          </div>

          <h3 style={{ marginTop: 16 }}>Envío</h3>
          {customer && addresses.length > 0 && (
            <div className="form-group">
              <label htmlFor="saved-address">Usar una dirección guardada <span style={{ color: 'var(--color-muted)' }}>(opcional)</span></label>
              <select id="saved-address" className="input" value={selectedAddressId} onChange={(event) => selectSavedAddress(event.target.value)}>
                <option value="">Elegir dirección…</option>
                {addresses.map((address) => <option key={address.id} value={address.id}>{address.label} · {address.address}, {address.city}</option>)}
              </select>
            </div>
          )}
          <ColombiaLocationFields
            department={form.department}
            city={form.city}
            onChange={({ department, city }) => setForm((current) => ({ ...current, department, city }))}
          />
          <div className="form-group">
            <label>Dirección *</label>
            <input className="input" required value={form.address} onChange={(e) => setField('address', e.target.value)} placeholder="Calle 100 #15-20, Apto 301" />
          </div>
          <div className="form-group">
            <label>Notas <span style={{ color: 'var(--color-muted)' }}>(opcional)</span></label>
            <textarea className="textarea" value={form.notes} onChange={(e) => setField('notes', e.target.value)} placeholder="Barrio, referencias, indicaciones especiales..." />
          </div>
          <DeliveryLocationPicker
            address={form.address}
            city={form.city}
            value={deliveryLocation}
            onChange={setDeliveryLocation}
          />

          <h3 style={{ marginTop: 16 }}>Pago</h3>
          <div className="form-group payment-method-field">
            <span className="payment-method-label">Elige cómo quieres pagar</span>
            <div className="payment-method-grid" role="group" aria-label="Selecciona la pasarela de pago">
              <button
                type="button"
                className={`payment-method-card ${paymentProvider === 'mercadopago' ? 'is-selected' : ''}`}
                aria-pressed={paymentProvider === 'mercadopago'}
                onClick={() => setPaymentProvider('mercadopago')}
              >
                <span className="payment-method-card-top">
                  <MercadoPagoLogo />
                  <span className="payment-method-check" aria-hidden="true">✓</span>
                </span>
                <span className="payment-method-card-copy">
                  <strong>Mercado Pago</strong>
                  <small>Pago seguro en la plataforma</small>
                </span>
              </button>

              <button type="button" className="payment-method-card is-disabled" disabled aria-disabled="true">
                <span className="payment-method-card-top">
                  <EpaycoLogo />
                  <span className="payment-method-disabled-badge">No disponible</span>
                </span>
                <span className="payment-method-card-copy">
                  <strong>ePayco</strong>
                  <small>Próximamente</small>
                </span>
                <span className="payment-method-disabled-strike" aria-hidden="true">No disponible</span>
              </button>
            </div>
          </div>
          <div className="alert alert-info">
            {paymentProvider === 'mercadopago'
              ? 'Serás redirigido a Mercado Pago para completar el pago de forma segura.'
              : 'ePayco abrirá su Checkout para que selecciones el medio de pago disponible.'}
          </div>

          {submitError && <div className="alert alert-error" role="alert">{submitError}</div>}

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
