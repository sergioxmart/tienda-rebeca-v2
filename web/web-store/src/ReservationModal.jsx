// Modal de reserva: cliente completa nombre, email, teléfono, fechas.
// Envía POST /api/public/reservations y abre el link de WhatsApp devuelto.

import { useEffect, useState } from 'react';
import { api } from './api.js';
import { date } from './format.js';
import { addRentalToCart } from './cart.js';

export default function ReservationModal({ product, selectedSizeId, requestedType, activeColor, open, onClose }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [sizeId, setSizeId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [pickup, setPickup] = useState('');
  const [err, setErr] = useState('');
  const [pending, setPending] = useState(false);
  const [closures, setClosures] = useState([]);

  // El color activo se resuelve en el padre (ProductPage). Si el producto
  // usa colores y el padre ya seleccionó uno, lo mostramos en el form.
  const selectedColor = product?.use_colors
    ? product.colors?.find((c) => Number(c.id) === Number(activeColor)) || null
    : null;

  useEffect(() => {
    if (!open) return;
    setSizeId(selectedSizeId ? String(selectedSizeId) : '');
  }, [open, selectedSizeId]);

  useEffect(() => {
    if (!open) return;
    // Cargar cierres en el rango que el cliente está mirando (start, end)
    const url = (start && end)
      ? `/api/public/closures?from=${start}&to=${end}`
      : '/api/public/closures';
    api(url).then((r) => r.ok && setClosures(r.data.data));
  }, [open, start, end]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !product) return null;

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setPending(true);
    const r = await api('/api/public/reservations', {
      method: 'POST',
      body: {
        product_id: product.id,
        size_id: sizeId ? Number(sizeId) : undefined,
        color_id: selectedColor ? Number(selectedColor.id) : undefined,
        requested_type: requestedType,
        client_name: name,
        client_email: email,
        client_phone: phone,
        start_date: start,
        end_date: end,
        pickup_date: pickup,
      },
    });
    setPending(false);
    if (r.ok) {
      addRentalToCart({
        product,
        reservation: r.data.data,
        startDate: start,
        endDate: end,
        pickupDate: pickup,
        colorId: selectedColor ? Number(selectedColor.id) : null,
        colorLabel: selectedColor?.label || null,
      });
      onClose();
      window.dispatchEvent(new Event('rebeca:open-cart'));
    } else {
      setErr(r.data?.error || 'Error al crear la reserva');
    }
  }

  // Setea end automáticamente = start + 2 días
  function onStartChange(v) {
    setStart(v);
    if (v && !end) {
      const d = new Date(v);
      d.setDate(d.getDate() + 2);
      setEnd(d.toISOString().slice(0, 10));
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-dialog modal-md" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-header">
          <h2>Reservar "{product.name}"</h2>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {err && <div className="form-err">{err === 'dates_cover_closure' ? 'Hay un cierre de la boutique en esas fechas. Prueba con otras fechas.' : err === 'dates_conflict' ? 'Ya hay una reserva confirmada que se superpone. Prueba con otras fechas.' : err === 'size_out_of_stock' ? 'Esa talla no tiene stock. Elige otra.' : err === 'color_out_of_stock' ? 'Ese color no tiene stock. Elige otro.' : err}</div>}

          {closures.length > 0 && (
            <div className="form-err" style={{ background: '#fdf2e9' }}>
              Cierre programado: {closures.map((c) => `${date(c.start_date)}${c.start_date !== c.end_date ? ` al ${date(c.end_date)}` : ''}`).join(', ')}
            </div>
          )}

          {selectedColor && (
            <div className="form-row" style={{ background: '#f7f3ec', padding: 12, borderRadius: 6, marginBottom: 8 }}>
              <label style={{ marginBottom: 4 }}>Color</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: selectedColor.hex || 'transparent',
                    border: '1px solid #ccc', display: 'inline-block',
                  }}
                />
                <strong>{selectedColor.label}</strong>
              </div>
              <div className="form-hint">Para cambiar de color, cerrá este modal y elegilo en la ficha del producto.</div>
            </div>
          )}
          {product.use_colors && !selectedColor && (
            <div className="form-err">
              Antes de reservar, elegí un color en la ficha del producto.
            </div>
          )}

          <div className="form-row">
            <label>Tu nombre completo *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="form-row-grid">
            <div>
              <label>Email *</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label>Teléfono (con código de país) *</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+502 5555 1234" required />
            </div>
          </div>

          {product.sizes && product.sizes.length > 0 && (
            <div className="form-row">
              <label>Talla *</label>
              <select value={sizeId} onChange={(e) => setSizeId(e.target.value)} required>
                <option value="">— Elegir talla —</option>
                {product.sizes.map((s) => (
                  <option key={s.size_id} value={s.size_id}>{s.label} (stock: {s.stock})</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-row-grid">
            <div>
              <label>Desde *</label>
              <input type="date" value={start} onChange={(e) => onStartChange(e.target.value)} required />
            </div>
            <div>
              <label>Hasta *</label>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} required />
            </div>
          </div>
          <div className="form-row">
            <label>Fecha de recogida *</label>
            <input type="date" value={pickup} onChange={(e) => setPickup(e.target.value)} required />
            <div className="form-hint">Cuándo vas a pasar a retirar la pieza.</div>
          </div>

          <p className="form-hint" style={{ marginTop: 8 }}>
            Al agregarla, la reserva queda en tu carrito junto con las compras para enviarlas en un solo mensaje de WhatsApp.
          </p>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn secondary" onClick={onClose} disabled={pending}>Cancelar</button>
          <button type="submit" className="btn" disabled={pending || !name || !email || !phone || !start || !end || !pickup || (product.use_colors && !selectedColor)}>
            {pending ? 'Agregando…' : 'Agregar alquiler al carrito'}
          </button>
        </div>
      </form>
    </div>
  );
}
