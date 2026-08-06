import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';
import { useMe } from '../hooks/useMe.js';
import { canWrite } from '../lib/permissions.js';

const COLUMNS = [
  { status: 'pending',   label: 'Pendientes',   color: '#fdf2e9' },
  { status: 'confirmed', label: 'Confirmadas',  color: '#e7f6ec' },
  { status: 'completed', label: 'Completadas',  color: '#eaf2fa' },
  { status: 'cancelled', label: 'Canceladas',   color: '#f5f5f5' },
];

function fmtDate(s) {
  if (!s) return '—';
  return new Date(s + (s.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

function dateRange(r) {
  if (r.start_date === r.end_date) return fmtDate(r.start_date);
  return `${fmtDate(r.start_date)} → ${fmtDate(r.end_date)}`;
}

function requestedTypeLabel(r) {
  return r.requested_type === 'alquiler_nuevo' ? 'Alquiler como nuevo' : 'Alquiler';
}

function buildWaLink(r) {
  const phone = (r.client_phone || '').replace(/[^0-9]/g, '');
  const text = `Hola ${r.client_name}, te confirmamos la reserva de "${r.product_name}" del ${dateRange(r)}. ¡Gracias!`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export default function Reservations() {
  const me = useMe();
  const canEdit = me ? canWrite('reservations', me.role) : true;
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);
  const [pending, setPending] = useState(false);

  async function load() {
    const r = await api('/api/admin/reservations');
    if (r.ok) setItems(r.data.data);
  }
  useEffect(() => { load(); }, []);

  async function setStatus(r, newStatus) {
    const url = r.id;
    const r2 = await api(`/api/admin/reservations/${url}/${newStatus === 'confirmed' ? 'confirm' : newStatus === 'cancelled' ? 'cancel' : 'complete'}`, { method: 'POST' });
    if (r2.ok) load();
    else alert(r2.data?.error || 'Error');
  }

  async function saveNotes(r, notes) {
    const r2 = await api(`/api/admin/reservations/${r.id}`, { method: 'PATCH', body: { notes } });
    if (r2.ok) load();
  }

  if (items === null) return <div style={{ padding: 40, color: 'var(--gray-500)' }}>Cargando…</div>;

  const byStatus = Object.fromEntries(COLUMNS.map((c) => [c.status, items.filter((i) => i.status === c.status)]));

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1>Reservas</h1>
        <p className="sub">{items.length} en total · kanban por estado</p>
      </div>

      <div className="kanban">
        {COLUMNS.map((col) => (
          <div key={col.status} className="kanban-col" style={{ background: col.color }}>
            <div className="kanban-col-header">
              <h3>{col.label}</h3>
              <span className="kanban-count">{byStatus[col.status].length}</span>
            </div>
            <div className="kanban-col-body">
              {byStatus[col.status].length === 0 ? (
                <p className="kanban-empty">Sin reservas.</p>
              ) : (
                byStatus[col.status].map((r) => (
                  <ReservationCard
                    key={r.id}
                    r={r}
                    onOpen={() => setEditing(r)}
                    onMove={(newStatus) => setStatus(r, newStatus)}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`Reserva #${editing?.id || ''}`}
        size="md"
      >
        {editing && (
          <div className="form">
            <div className="placeholder-card" style={{ background: 'var(--gray-50)' }}>
              <h2 style={{ marginBottom: 4 }}>{editing.product_name}</h2>
              <p style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                {editing.collection_name} · {requestedTypeLabel(editing)}
                {editing.color_id ? ` · ${colorChip(editing)}` : ''}
                {editing.size_label ? ` · Talla ${editing.size_label}` : ''}
              </p>
            </div>

            <div className="form-row">
              <label>Cliente</label>
              <div style={{ fontSize: 14 }}>
                <div style={{ fontWeight: 500 }}>{editing.client_name}</div>
                <div style={{ color: 'var(--gray-500)', fontSize: 13 }}>{editing.client_email} · {editing.client_phone}</div>
              </div>
            </div>

            <div className="form-row">
              <label>Fechas</label>
              <div style={{ fontSize: 14 }}>
                Recogida: <strong>{fmtDate(editing.pickup_date)}</strong><br />
                Devolución: <strong>{fmtDate(editing.end_date)}</strong>
              </div>
            </div>

            <div className="form-row">
              <label>Notas internas</label>
              <NotesEditor
                initial={editing.notes || ''}
                onSave={(v) => saveNotes(editing, v)}
                canEdit={canEdit}
              />
            </div>

            <div className="form-row">
              <label>Acciones</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {canEdit && editing.status !== 'confirmed' && (
                  <button className="btn" onClick={() => { setStatus(editing, 'confirmed'); setEditing(null); }}>
                    ✓ Confirmar
                  </button>
                )}
                {canEdit && editing.status !== 'completed' && (
                  <button className="btn secondary" onClick={() => { setStatus(editing, 'completed'); setEditing(null); }}>
                    Marcar completada
                  </button>
                )}
                {canEdit && editing.status !== 'cancelled' && (
                  <button className="btn danger" onClick={() => { if (confirm('¿Cancelar esta reserva?')) { setStatus(editing, 'cancelled'); setEditing(null); } }}>
                    Cancelar
                  </button>
                )}
                <a className="btn secondary" href={buildWaLink(editing)} target="_blank" rel="noreferrer">
                  💬 Abrir WhatsApp
                </a>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function ReservationCard({ r, onOpen, onMove }) {
  return (
    <div className="kanban-card" onClick={onOpen}>
      <div className="kanban-card-title">{r.product_name}</div>
      <div className="kanban-card-collection">
        {r.collection_name} · {requestedTypeLabel(r)}
        {r.color_id ? <> · {colorChip(r)}</> : ''}
        {r.size_label ? ` · ${r.size_label}` : ''}
      </div>
      <div className="kanban-card-dates">{dateRange(r)}</div>
      <div className="kanban-card-client">{r.client_name}</div>
      <div className="kanban-card-phone">{r.client_phone}</div>
    </div>
  );
}

// Chip de color con swatch + label. Si no hay hex, solo label.
function colorChip(r) {
  if (!r.color_id) return null;
  const hasHex = r.color_hex && r.color_hex.startsWith('#');
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
      <span
        aria-hidden="true"
        style={{
          width: 12, height: 12, borderRadius: '50%',
          background: hasHex ? r.color_hex : 'transparent',
          border: '1px solid var(--gray-200, #ddd)',
          display: 'inline-block',
        }}
      />
      <span>{r.color_label || `Color #${r.color_id}`}</span>
    </span>
  );
}

function NotesEditor({ initial, onSave, canEdit }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(false);
  function save() {
    onSave(value);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }
  return (
    <div>
      <textarea
        rows={3}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Anotaciones internas (no se muestran al cliente)…"
      />
      {canEdit && (
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn secondary" onClick={save}>Guardar notas</button>
          {saved && <span style={{ fontSize: 12, color: 'var(--success)' }}>✓ Guardado</span>}
        </div>
      )}
    </div>
  );
}
