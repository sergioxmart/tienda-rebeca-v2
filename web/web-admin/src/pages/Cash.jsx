// Caja (Gestión General): cuánta plata hay ahora y dónde está. Se alimenta de
// las ventas completadas + movimientos manuales (ingreso, retiro, traslado).
// El saldo lo calcula el server en cada request; acá no se suma nada.
// Regla dura: las reservas y los cierres por WhatsApp no tocan Caja.

import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';
import { money } from '../lib/format.js';
import { PAYMENT_METHODS, PAYMENT_LABELS } from '../lib/constants.js';
import { useMe } from '../hooks/useMe.js';
import { canWrite } from '../lib/permissions.js';

const KIND_LABELS = {
  venta: 'Venta',
  ingreso: 'Ingreso',
  retiro: 'Retiro',
  traslado: 'Traslado',
};

const emptyMovement = { kind: 'ingreso', method: 'efectivo', method_to: '', amount: '', note: '' };

export default function Cash() {
  const me = useMe();
  const canEdit = me ? canWrite('cash', me.role) : true;
  const [balance, setBalance] = useState(null);
  const [feed, setFeed] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filterMethod, setFilterMethod] = useState('');
  const [creating, setCreating] = useState(null);
  const [err, setErr] = useState('');
  const [pending, setPending] = useState(false);

  async function loadBalance() {
    const r = await api('/api/admin/cash/balance');
    if (r.ok) setBalance(r.data.data);
  }

  async function loadFeed({ f = from, t = to, m = filterMethod } = {}) {
    const params = new URLSearchParams();
    if (f) params.set('from', f);
    if (t) params.set('to', t);
    if (m) params.set('method', m);
    const r = await api(`/api/admin/cash/movements?${params}`);
    if (r.ok) setFeed(r.data.data);
  }

  useEffect(() => { loadBalance(); loadFeed(); }, []);

  function openMovement(kind) {
    setErr('');
    setCreating({ ...emptyMovement, kind });
  }

  async function saveMovement() {
    if (!creating) return;
    setPending(true);
    setErr('');
    const body = {
      kind: creating.kind,
      method: creating.method,
      amount: Number(creating.amount),
      note: creating.note.trim(),
    };
    if (creating.kind === 'traslado') body.method_to = creating.method_to;
    const r = await api('/api/admin/cash/movements', { method: 'POST', body });
    setPending(false);
    if (r.ok) {
      setCreating(null);
      loadBalance();
      loadFeed();
    } else {
      setErr(r.data?.message || r.data?.details?.join(', ') || r.data?.error || 'Error al registrar');
    }
  }

  // Cómo se ve cada fila del feed: una venta anulada aparece atenuada y no
  // suma al saldo (el balance ya la excluye).
  function amountLabel(row) {
    if (row.kind === 'retiro') return `− ${money(row.amount)}`;
    if (row.kind === 'traslado') return money(row.amount);
    return `+ ${money(row.amount)}`;
  }

  function methodLabel(row) {
    const base = PAYMENT_LABELS[row.method] || row.method;
    if (row.kind === 'traslado') {
      return `${base} → ${PAYMENT_LABELS[row.method_to] || row.method_to}`;
    }
    return base;
  }

  if (balance === null) return <div style={{ padding: 40, color: 'var(--gray-500)' }}>Cargando…</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1>Caja</h1>
          <p className="sub">Saldo por medio de pago: ventas completadas + movimientos manuales.</p>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn secondary" onClick={() => openMovement('ingreso')}>Registrar ingreso</button>
            <button className="btn secondary" onClick={() => openMovement('retiro')}>Registrar retiro</button>
            <button className="btn secondary" onClick={() => openMovement('traslado')}>Traslado entre medios</button>
          </div>
        )}
      </div>

      <div className="stat-grid">
        {PAYMENT_METHODS.map((m) => (
          <div key={m.value} className="stat-card">
            <div className="stat-value" style={Number(balance[m.value]) < 0 ? { color: 'var(--danger)' } : {}}>
              {money(balance[m.value])}
            </div>
            <div className="stat-label">{m.label}</div>
          </div>
        ))}
        <div className="stat-card" style={{ borderColor: 'var(--gold)' }}>
          <div className="stat-value" style={{ color: 'var(--gold)' }}>{money(balance.total)}</div>
          <div className="stat-label">Total</div>
        </div>
      </div>

      <h2 style={{ fontSize: 15, margin: '24px 0 10px' }}>Movimientos</h2>
      <div className="filters" style={{ marginBottom: 12 }}>
        <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); loadFeed({ f: e.target.value }); }} />
        <input type="date" value={to} onChange={(e) => { setTo(e.target.value); loadFeed({ t: e.target.value }); }} />
        <select value={filterMethod} onChange={(e) => { setFilterMethod(e.target.value); loadFeed({ m: e.target.value }); }}>
          <option value="">Todos los medios</option>
          {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      {feed === null ? (
        <div style={{ padding: 20, color: 'var(--gray-500)' }}>Cargando…</div>
      ) : feed.length === 0 ? (
        <div className="placeholder-card" style={{ textAlign: 'center', color: 'var(--gray-500)' }}>
          Sin movimientos en el rango.
        </div>
      ) : (
        <div className="data-table">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Medio</th>
                <th>Monto</th>
                <th>Nota</th>
                <th>Quién</th>
              </tr>
            </thead>
            <tbody>
              {feed.map((row) => (
                <tr key={`${row.kind}-${row.id}`} style={row.status === 'anulada' ? { opacity: 0.5 } : {}}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {new Date(row.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td>
                    {KIND_LABELS[row.kind] || row.kind}
                    {row.status === 'anulada' && <span className="badge off" style={{ marginLeft: 6 }}>Anulada</span>}
                  </td>
                  <td>{methodLabel(row)}</td>
                  <td style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{amountLabel(row)}</td>
                  <td>{row.note || '—'}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{row.created_by_email || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!creating}
        onClose={() => setCreating(null)}
        title={creating ? `${KIND_LABELS[creating.kind]} de caja` : ''}
        footer={
          canEdit ? (
            <>
              <button className="btn secondary" onClick={() => setCreating(null)} disabled={pending}>Cancelar</button>
              <button
                className="btn"
                onClick={saveMovement}
                disabled={pending || !Number(creating?.amount) || (creating?.kind === 'traslado' && !creating?.method_to)}
              >
                {pending ? 'Guardando…' : 'Registrar'}
              </button>
            </>
          ) : (
            <button className="btn secondary" onClick={() => setCreating(null)}>Cerrar</button>
          )
        }
      >
        {creating && (
          <div className="form">
            {err && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</div>}
            <div className="form-row">
              <label>{creating.kind === 'traslado' ? 'Desde' : 'Medio'}</label>
              <select
                value={creating.method}
                onChange={(e) => setCreating({ ...creating, method: e.target.value })}
              >
                {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            {creating.kind === 'traslado' && (
              <div className="form-row">
                <label>Hacia</label>
                <select
                  value={creating.method_to}
                  onChange={(e) => setCreating({ ...creating, method_to: e.target.value })}
                >
                  <option value="">— Elegir —</option>
                  {PAYMENT_METHODS.filter((m) => m.value !== creating.method).map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-row">
              <label>Monto (COP)</label>
              <input
                type="number" min="0" step="1000"
                value={creating.amount}
                onChange={(e) => setCreating({ ...creating, amount: e.target.value })}
                autoFocus
              />
            </div>
            <div className="form-row">
              <label>Nota</label>
              <input
                value={creating.note}
                onChange={(e) => setCreating({ ...creating, note: e.target.value })}
                placeholder={creating.kind === 'retiro' ? 'Ej: pago de servicios' : 'Opcional'}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
