import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useCustomer } from '../customer/CustomerContext.jsx';
import { formatCOP } from '../components/Price.jsx';
import ColombiaLocationFields from '../components/ColombiaLocationFields.jsx';

const EMPTY_ADDRESS = {
  label: 'Casa', recipient_name: '', phone: '', department: '', address: '', city: '', notes: '', latitude: '', longitude: '',
};

const STATUS_LABELS = {
  pending: 'Pendiente', paid: 'Pagado', processing: 'En preparación', shipped: 'Enviado',
  delivered: 'Entregado', cancelled: 'Cancelado', refunded: 'Reembolsado', expired: 'Expirado',
};

function AccountLogin() {
  const { login } = useCustomer();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const request = async (event) => {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api.requestCustomerOtp(email);
      if (!result.sent) {
        setMessage('Si el correo tiene pedidos registrados, recibirás un código en unos instantes.');
      } else {
        setSent(true);
        setMessage('Te enviamos un PIN de 6 dígitos. Revisa tu correo.');
      }
    } catch (err) { setError(err.message || 'No pudimos enviar el código.'); }
    finally { setBusy(false); }
  };

  const verify = async (event) => {
    event.preventDefault();
    setBusy(true); setError('');
    try { login(await api.verifyCustomerOtp(email, code)); }
    catch (err) { setError(err.message || 'El código no es válido.'); }
    finally { setBusy(false); }
  };

  return (
    <section className="account-login panel">
      <span className="section-kicker">Mi cuenta</span>
      <h1>Ingresa sin contraseña</h1>
      <p>Te enviaremos un PIN temporal a tu correo para consultar tus pedidos y direcciones.</p>
      <form onSubmit={sent ? verify : request}>
        <div className="form-group">
          <label htmlFor="customer-email">Correo electrónico</label>
          <input id="customer-email" className="input" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={sent} />
        </div>
        {sent && (
          <div className="form-group">
            <label htmlFor="customer-otp">PIN de 6 dígitos</label>
            <input id="customer-otp" className="input" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus />
          </div>
        )}
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {message && <div className="alert alert-info" role="status">{message}</div>}
        <button className="btn btn-accent" type="submit" disabled={busy}>{busy ? 'Procesando…' : sent ? 'Ingresar' : 'Enviar PIN'}</button>
        {sent && <button className="btn account-secondary-action" type="button" onClick={() => { setSent(false); setCode(''); setMessage(''); }}>Cambiar correo</button>}
      </form>
    </section>
  );
}

function AddressForm({ value, onChange, onSubmit, onCancel, busy }) {
  const set = (key, next) => onChange({ ...value, [key]: next });
  return (
    <form className="account-address-form" onSubmit={onSubmit}>
      <div className="form-row account-form-grid">
        <div className="form-group"><label>Nombre de la dirección</label><input className="input" value={value.label} onChange={(e) => set('label', e.target.value)} placeholder="Casa, oficina…" /></div>
        <div className="form-group"><label>Persona que recibe</label><input className="input" value={value.recipient_name} onChange={(e) => set('recipient_name', e.target.value)} /></div>
      </div>
      <div className="form-row account-form-grid">
        <div className="form-group"><label>Teléfono</label><input className="input" type="tel" value={value.phone} onChange={(e) => set('phone', e.target.value)} /></div>
      </div>
      <ColombiaLocationFields department={value.department} city={value.city} onChange={({ department, city }) => onChange({ ...value, department, city })} />
      <div className="form-group"><label>Dirección</label><input className="input" required value={value.address} onChange={(e) => set('address', e.target.value)} placeholder="Calle, carrera, conjunto, torre y apartamento" /></div>
      <div className="form-group"><label>Notas de entrega</label><textarea className="textarea" value={value.notes} onChange={(e) => set('notes', e.target.value)} /></div>
      <div className="account-address-actions"><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar dirección'}</button>{onCancel && <button className="btn" type="button" onClick={onCancel}>Cancelar</button>}</div>
    </form>
  );
}

export default function CustomerAccount() {
  const { customer, addresses, setAddresses, loading, logout } = useCustomer();
  const [orders, setOrders] = useState([]);
  const [profile, setProfile] = useState({ name: '', phone: '' });
  const [addressForm, setAddressForm] = useState(EMPTY_ADDRESS);
  const [editingId, setEditingId] = useState(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (!customer) return;
    setProfile({ name: customer.name || '', phone: customer.phone || '' });
    api.customerOrders().then(setOrders).catch(() => setError('No pudimos cargar tus pedidos.'));
  }, [customer]);

  const saveProfile = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await api.updateCustomerProfile(profile); }
    catch (err) { setError(err.message || 'No pudimos actualizar tus datos.'); }
    finally { setBusy(false); }
  };

  const saveAddress = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const saved = editingId ? await api.customerAddressUpdate(editingId, addressForm) : await api.customerAddressCreate(addressForm);
      setAddresses(editingId ? addresses.map((address) => address.id === editingId ? saved : address) : [saved, ...addresses]);
      setAddressForm(EMPTY_ADDRESS); setEditingId(null); setShowAddressForm(false);
    } catch (err) { setError(err.message || 'No pudimos guardar la dirección.'); }
    finally { setBusy(false); }
  };

  const editAddress = (address) => { setAddressForm({ ...EMPTY_ADDRESS, ...address }); setEditingId(address.id); setShowAddressForm(true); };
  const deleteAddress = async (id) => {
    if (!window.confirm('¿Quieres eliminar esta dirección?')) return;
    try { await api.customerAddressDelete(id); setAddresses(addresses.filter((address) => address.id !== id)); }
    catch (err) { setError(err.message || 'No pudimos eliminar la dirección.'); }
  };

  const totalOrders = useMemo(() => orders.length, [orders]);
  if (loading) return <div className="center"><span className="spinner" /></div>;
  if (!customer) return <AccountLogin />;

  const firstName = (customer.name || customer.email || '').trim().split(/\s+/)[0];

  return (
    <div className="account-page">
      <div className="account-heading"><div><span className="section-kicker">Mi cuenta</span><h1>Hola, {firstName}</h1><p>Administra tus datos, direcciones y pedidos desde un solo lugar.</p></div><div className="account-heading-actions"><button className="btn btn-primary" type="button" onClick={() => setShowSettings((visible) => !visible)}>{showSettings ? 'Ver mis pedidos' : 'Editar Datos y direcciones'}</button><button className="btn" type="button" onClick={() => logout()}>Cerrar sesión</button></div></div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {showSettings && <div className="account-grid">
        <section className="panel"><h2>Mis datos</h2><p className="account-muted">{customer.email}</p><form onSubmit={saveProfile}><div className="form-group"><label>Nombre completo</label><input className="input" required value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></div><div className="form-group"><label>Teléfono</label><input className="input" type="tel" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></div><button className="btn btn-primary" disabled={busy}>Guardar cambios</button></form></section>
        <section className="panel"><div className="account-section-heading"><div><h2>Mis direcciones</h2><p className="account-muted">{addresses.length} dirección{addresses.length === 1 ? '' : 'es'} guardada{addresses.length === 1 ? '' : 's'}.</p></div><button className="btn btn-accent" type="button" onClick={() => { setAddressForm(EMPTY_ADDRESS); setEditingId(null); setShowAddressForm(true); }}>+ Agregar</button></div>{showAddressForm && <AddressForm value={addressForm} onChange={setAddressForm} onSubmit={saveAddress} onCancel={() => setShowAddressForm(false)} busy={busy} />}<div className="account-address-list">{addresses.map((address) => <article className="account-address-card" key={address.id}><div><strong>{address.label}</strong><p>{address.address}<br />{address.city}{address.recipient_name ? ` · ${address.recipient_name}` : ''}</p>{address.notes && <small>{address.notes}</small>}</div><div className="account-card-actions"><button className="btn" type="button" onClick={() => editAddress(address)}>Editar</button><button className="btn" type="button" onClick={() => deleteAddress(address.id)}>Eliminar</button></div></article>)}{addresses.length === 0 && <p className="account-muted">Aún no tienes direcciones guardadas.</p>}</div></section>
      </div>}
      {!showSettings && <section className="panel account-orders"><div className="account-section-heading"><div><h2>Mis pedidos</h2><p className="account-muted">{totalOrders} pedido{totalOrders === 1 ? '' : 's'} registrado{totalOrders === 1 ? '' : 's'}.</p></div><Link to="/categoria" className="btn">Seguir comprando</Link></div>{orders.length === 0 ? <p className="account-muted">Todavía no tienes pedidos.</p> : <div className="account-order-list">{orders.map((order) => <article className="account-order-card" key={order.id}><div className="account-order-top"><div><strong>{order.order_number}</strong><small>{new Date(order.created_at).toLocaleDateString('es-CO')}</small></div><span className="account-status">{STATUS_LABELS[order.status] || order.status}</span></div><div className="account-order-items">{order.items.map((item) => <div key={`${order.id}-${item.variant_id}-${item.product_name}`}><span>{item.quantity}× {item.product_name}</span><span>{formatCOP(item.line_total)}</span></div>)}</div><div className="account-order-total"><span>Total</span><strong>{formatCOP(order.total)}</strong></div></article>)}</div>}</section>}
    </div>
  );
}
