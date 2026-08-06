import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useMe } from '../hooks/useMe.js';
import { canWrite } from '../lib/permissions.js';

// El backend manda DATE como 'YYYY-MM-DD', pero por las dudas normalizamos
// cualquier ISO timestamp que llegue (slice a los primeros 10 chars).
function dateOnly(s) {
  return String(s).slice(0, 10);
}

function fmt(s) {
  if (!s) return '—';
  return new Date(dateOnly(s) + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ym(y, m) {
  // m is 0-indexed
  return new Date(y, m, 1);
}

function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d)   { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

function inRange(iso, start, end) {
  if (!iso) return false;
  const d = new Date(iso + 'T00:00:00');
  return d >= start && d <= end;
}

function dayHasClosure(d, closures) {
  for (const c of closures) {
    if (inRange(d.toISOString().slice(0, 10), new Date(dateOnly(c.start_date) + 'T00:00:00'), new Date(dateOnly(c.end_date) + 'T00:00:00'))) {
      return c;
    }
  }
  return null;
}

export default function Closures() {
  const me = useMe();
  const canEdit = me ? canWrite('closures', me.role) : true;
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [form, setForm] = useState({ start_date: '', end_date: '', reason: '' });
  const [pending, setPending] = useState(false);

  async function load() {
    const r = await api('/api/admin/closures');
    if (r.ok) setItems(r.data.data);
    else setErr(r.data?.error || 'Error al cargar');
  }
  useEffect(() => { load(); }, []);

  const monthDays = useMemo(() => {
    const start = startOfMonth(cursor);
    const end = endOfMonth(cursor);
    // Empezar el lunes de la semana del primer día
    const firstDay = new Date(start);
    const offset = (firstDay.getDay() + 6) % 7; // lunes=0
    const gridStart = new Date(firstDay);
    gridStart.setDate(firstDay.getDate() - offset);
    const days = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      days.push(d);
    }
    return { days, start, end };
  }, [cursor]);

  function onDayClick(d) {
    const iso = d.toISOString().slice(0, 10);
    setForm((f) => ({
      start_date: f.start_date || iso,
      end_date:   f.end_date   || iso,
      reason: f.reason,
    }));
  }

  async function save() {
    if (!form.start_date || !form.end_date) {
      setErr('Elige fecha de inicio y fin');
      return;
    }
    setPending(true);
    setErr('');
    const r = await api('/api/admin/closures', { method: 'POST', body: form });
    setPending(false);
    if (r.ok) {
      setForm({ start_date: '', end_date: '', reason: '' });
      load();
    } else {
      setErr(r.data?.error || 'Error al guardar');
    }
  }

  async function remove(c) {
    if (!confirm(`¿Eliminar el cierre del ${fmt(c.start_date)}${c.start_date !== c.end_date ? ` al ${fmt(c.end_date)}` : ''}?`)) return;
    const r = await api(`/api/admin/closures/${c.id}`, { method: 'DELETE' });
    if (r.ok) load();
  }

  if (items === null) return <div style={{ padding: 40, color: 'var(--gray-500)' }}>Cargando…</div>;

  const monthName = cursor.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1>Cierres</h1>
        <p className="sub">Días en que la boutique no abre. El sistema no acepta reservas en esas fechas.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Calendario */}
        <div className="placeholder-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button className="row-btn" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>←</button>
            <h2 style={{ margin: 0, textTransform: 'capitalize' }}>{monthName}</h2>
            <button className="row-btn" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>→</button>
          </div>
          <div className="cal-grid">
            {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
              <div key={i} className="cal-head">{d}</div>
            ))}
            {monthDays.days.map((d, i) => {
              const inMonth = d.getMonth() === cursor.getMonth();
              const closure = dayHasClosure(d, items);
              const isToday = d.toDateString() === new Date().toDateString();
              return (
                <div
                  key={i}
                  className={`cal-day ${inMonth ? '' : 'out'} ${closure ? 'closed' : ''} ${isToday ? 'today' : ''}`}
                  onClick={() => onDayClick(d)}
                  title={closure?.reason || ''}
                >
                  <span>{d.getDate()}</span>
                </div>
              );
            })}
          </div>
          <p className="form-hint" style={{ marginTop: 8 }}>Click en un día para setear inicio y fin. La razón se completa en el form.</p>
        </div>

        {/* Form + lista */}
        <div>
          <div className="placeholder-card" style={{ marginBottom: 16 }}>
            <h2 style={{ marginTop: 0 }}>Nuevo cierre</h2>
            <div className="form">
              <div className="form-row-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div>
                  <label>Inicio</label>
                  <input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
                </div>
                <div>
                  <label>Fin</label>
                  <input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
                </div>
              </div>
              <div>
                <label>Razón</label>
                <input
                  value={form.reason}
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="Navidad, inventario, vacaciones…"
                />
              </div>
              {err && <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{err}</p>}
              {canEdit && (
                <button className="btn" onClick={save} disabled={pending}>
                  {pending ? 'Guardando…' : 'Crear cierre'}
                </button>
              )}
            </div>
          </div>

          <div className="placeholder-card">
            <h2 style={{ marginTop: 0 }}>Cierres existentes</h2>
            {items.length === 0 ? (
              <p style={{ color: 'var(--gray-500)', fontSize: 14, margin: 0 }}>Ninguno. La boutique está abierta todos los días según los horarios default.</p>
            ) : (
              <ul className="closures-list">
                {items.map((c) => (
                  <li key={c.id}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>
                        {fmt(c.start_date)}{c.start_date !== c.end_date ? ` → ${fmt(c.end_date)}` : ''}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>{c.reason || 'sin razón'}</div>
                    </div>
                    {canEdit && <button className="row-btn danger" onClick={() => remove(c)}>Eliminar</button>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
