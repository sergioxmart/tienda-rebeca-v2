// Sistemas de colores (/admin/ajustes, tab "Sistemas de colores").
//
// Réplica estructural del flujo de Sistemas de tallas, adaptada a colores.
// Un sistema = nombre + lista ordenada de colores. El sistema "Rebeca" viene
// de la plataforma (protegido: no se renombra ni se editan sus colores, se
// duplica). Cada color tiene label obligatorio y hex opcional (#RRGGBB) que
// se renderiza como swatch al lado del label.
//
// Como en tallas, el código valida con SELECT propio antes de INSERT/UPDATE
// (la trampa anotada en conventions.md): nunca confiamos en el 23505 para
// detectar duplicados de nombre.

import { useState } from 'react';
import { api } from '../api.js';
import Modal from './Modal.jsx';
import { useMe } from '../hooks/useMe.js';
import RoleGate from './RoleGate.jsx';
import { canRead, canWrite } from '../lib/permissions.js';

// Swatch inline: cuadrito de 14x14 con el color. Si hex es null, se ve
// un cuadrito vacío con un "—" adentro. Border gris para que se note
// sobre fondos claros.
function Swatch({ hex, size = 14 }) {
  const style = {
    width: size,
    height: size,
    borderRadius: 3,
    border: '1px solid var(--gray-300)',
    display: 'inline-block',
    verticalAlign: 'middle',
    background: hex || 'transparent',
    position: 'relative',
  };
  return (
    <span style={style} title={hex || 'sin hex'} aria-label={hex || 'sin hex'}>
      {!hex && (
        <span style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--gray-400)',
          fontSize: 9,
          lineHeight: 1,
        }}>—</span>
      )}
    </span>
  );
}

// Input de hex con un color-picker al lado. Sincronizados: si el user elige
// desde el picker, el text se actualiza; si edita el text, el swatch refleja
// el cambio. Validación: solo #RRGGBB (6 hex).
function HexInput({ value, onChange, disabled }) {
  const v = value || '';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <input
        type="color"
        value={/^#[0-9a-f]{6}$/i.test(v) ? v : '#cccccc'}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{ width: 32, height: 28, padding: 0, border: '1px solid var(--gray-300)', borderRadius: 4, cursor: 'pointer' }}
        title="Elegir color"
      />
      <input
        type="text"
        value={v}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#RRGGBB"
        pattern="^#[0-9a-fA-F]{6}$"
        maxLength={7}
        disabled={disabled}
        style={{ width: 110, fontFamily: 'monospace', fontSize: 13 }}
      />
      {v && (
        <button
          type="button"
          className="row-btn"
          onClick={() => onChange('')}
          disabled={disabled}
          title="Quitar hex"
        >×</button>
      )}
    </span>
  );
}

export default function ColorSystemsTab({ systems, load, me }) {
  const [editing, setEditing] = useState(null); // { id?, name, colors: [{id?, label, hex}] }
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState('');

  function openNew() {
    setErr('');
    setEditing({ name: '', colors: [{ label: '', hex: '' }] });
  }

  function openEdit(sys) {
    setErr('');
    setEditing({
      id: sys.id,
      name: sys.name,
      colors: (sys.colors || []).map((c) => ({ id: c.id, label: c.label, hex: c.hex || '' })),
    });
  }

  function close() { setEditing(null); setErr(''); }

  async function save() {
    if (!editing) return;
    // Normalizamos: label trim, hex en formato válido o vacío. Sin label vacío
    // (el server igual valida, pero filtramos acá para no mandar filas vacías).
    const colors = (editing.colors || [])
      .map((c) => ({ ...c, label: (c.label || '').trim(), hex: (c.hex || '').trim() }))
      .filter((c) => c.label);
    setPending(true);
    setErr('');
    const body = { name: editing.name.trim(), colors };
    const r = editing.id
      ? await api(`/api/admin/color-systems/${editing.id}`, { method: 'PATCH', body })
      : await api('/api/admin/color-systems', { method: 'POST', body });
    setPending(false);
    if (r.ok) { close(); load(); }
    else setErr(r.data?.message || r.data?.details?.join(', ') || r.data?.error || 'Error al guardar');
  }

  async function duplicate(sys) {
    const name = prompt(`Nombre del nuevo sistema (copia de "${sys.name}"):`, `${sys.name} (copia)`);
    if (!name || !name.trim()) return;
    const r = await api(`/api/admin/color-systems/${sys.id}/duplicate`, { method: 'POST', body: { name: name.trim() } });
    if (r.ok) load();
    else alert(r.data?.message || r.data?.error || 'Error al duplicar');
  }

  async function remove(sys) {
    if (!confirm(`¿Eliminar el sistema "${sys.name}"?\n\nSus colores dejarán de estar disponibles para los productos. Los colores ya asignados a productos se mantienen.`)) return;
    const r = await api(`/api/admin/color-systems/${sys.id}`, { method: 'DELETE' });
    if (r.ok) load();
    else alert(r.data?.message || r.data?.error || 'Error al eliminar');
  }

  function patchColor(i, field, value) {
    setEditing((p) => ({ ...p, colors: p.colors.map((c, j) => j === i ? { ...c, [field]: value } : c) }));
  }
  function addColor() {
    setEditing((p) => ({ ...p, colors: [...(p.colors || []), { label: '', hex: '' }] }));
  }
  function removeColor(i) {
    setEditing((p) => ({ ...p, colors: (p.colors || []).filter((_, j) => j !== i) }));
  }
  function moveColor(i, dir) {
    setEditing((p) => {
      const colors = [...(p.colors || [])];
      const j = i + dir;
      if (j < 0 || j >= colors.length) return p;
      [colors[i], colors[j]] = [colors[j], colors[i]];
      return { ...p, colors };
    });
  }

  const canEdit = canWrite('color_systems', me?.role);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0 }}>Sistemas de colores</h1>
          <p className="sub">Agrupa los colores que Rebeca maneja para agrupar variantes de un mismo producto</p>
        </div>
        {canEdit && <button className="btn" onClick={openNew}>+ Nuevo sistema</button>}
      </div>

      {err && !editing && (
        <div className="placeholder-card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', marginBottom: 16 }}>{err}</div>
      )}

      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>Sistema</th>
              <th>Colores</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(systems || []).map((sys) => (
              <tr key={sys.id}>
                <td style={{ fontWeight: 500 }}>
                  {sys.name}
                  {sys.is_system && <span className="badge off" style={{ marginLeft: 6 }}>De plataforma</span>}
                </td>
                <td>
                  {(sys.colors && sys.colors.length > 0) ? (
                    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      {sys.colors.map((c) => (
                        <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 6px', border: '1px solid var(--gray-200)', borderRadius: 12, fontSize: 12 }}>
                          <Swatch hex={c.hex} size={12} />
                          {c.label}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--gray-500)', fontSize: 13 }}>—</span>
                  )}
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {canEdit && (
                    <>
                      {!sys.is_system && (
                        <button className="row-btn" onClick={() => openEdit(sys)}>Editar</button>
                      )}
                      <button className="row-btn" style={{ marginLeft: 4 }} onClick={() => duplicate(sys)}>Duplicar</button>
                      {!sys.is_system && (
                        <button className="row-btn danger" style={{ marginLeft: 4 }} onClick={() => remove(sys)}>Eliminar</button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
            {(!systems || systems.length === 0) && (
              <tr>
                <td colSpan={3} style={{ textAlign: 'center', color: 'var(--gray-500)', padding: 24 }}>
                  Sin sistemas de colores todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="form-hint" style={{ marginTop: 10 }}>
        "Rebeca" viene con la plataforma: no se edita, pero puedes duplicarlo
        como punto de partida. Un color con <code>hex</code> se muestra como
        swatch en la tienda y en el selector de color del producto. Si lo dejas
        vacío, se ve solo el label.
      </p>

      <Modal
        open={!!editing}
        onClose={close}
        title={editing?.id ? `Editar "${editing.name}"` : 'Nuevo sistema de colores'}
        footer={
          <>
            <button className="btn secondary" onClick={close} disabled={pending}>Cancelar</button>
            <button
              className="btn"
              onClick={save}
              disabled={pending || !editing?.name?.trim() || !editing?.colors?.some((c) => (c.label || '').trim())}
            >
              {pending ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        }
      >
        {editing && (
          <div className="form">
            {err && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</div>}
            <div className="form-row">
              <label>Nombre *</label>
              <input
                value={editing.name}
                onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ej: Temporada Alta 2026"
                autoFocus={!editing.id}
              />
            </div>
            <div className="form-row">
              <label>Colores (en orden) *</label>
              <ul className="dash-list">
                {editing.colors.map((c, i) => (
                  <li key={c.id ?? `new-${i}`} style={{ gap: 8, alignItems: 'center' }}>
                    <Swatch hex={/^#[0-9a-f]{6}$/i.test(c.hex || '') ? c.hex : null} size={16} />
                    <input
                      value={c.label}
                      onChange={(e) => patchColor(i, 'label', e.target.value)}
                      placeholder="Etiqueta (ej: Marfil, Rojo vino)"
                      style={{ flex: 1 }}
                    />
                    <HexInput
                      value={c.hex}
                      onChange={(v) => patchColor(i, 'hex', v)}
                    />
                    <span style={{ display: 'flex', gap: 4 }}>
                      <button type="button" className="row-btn" onClick={() => moveColor(i, -1)} disabled={i === 0} title="Subir">↑</button>
                      <button type="button" className="row-btn" onClick={() => moveColor(i, 1)} disabled={i === editing.colors.length - 1} title="Bajar">↓</button>
                      <button type="button" className="row-btn danger" onClick={() => removeColor(i)} title="Quitar color">×</button>
                    </span>
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 6 }}>
                <button type="button" className="row-btn" onClick={addColor}>+ Agregar color</button>
              </div>
              <div className="form-hint">
                <code>hex</code> es opcional. Si lo pones, se muestra como
                swatch al lado de la etiqueta en la tienda y en el form.
                Formato <code>#RRGGBB</code> (6 hex). Si el sistema es de
                plataforma (Ropa/Calzado equivalente), no se puede editar.
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
