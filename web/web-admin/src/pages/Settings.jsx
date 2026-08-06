// Ajustes: catálogo de variantes que Rebeca gestiona a nivel plataforma.
// Hoy: dos pestañas — Sistemas de tallas y Sistemas de colores. Cada
// pestaña es independiente: sus datos, su modal de edición, sus permisos.
//
// Sistemas de tallas: 014_size_systems.sql. Réplica para ropa/calzado y
// tallas custom (Niños, Cinturones, etc.). Una talla con ventas no se
// renombra; un sistema con productos no se borra.
//
// Sistemas de colores: 018_color_systems.sql. Catálogo opcional de colores
// que un producto puede activar (Fase 2 del plan 2026-07-27). El hex es
// opcional; si está, se renderiza como swatch en tienda y form.

import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';
import { useMe } from '../hooks/useMe.js';
import RoleGate from '../components/RoleGate.jsx';
import { canRead } from '../lib/permissions.js';
import ColorSystemsTab from '../components/ColorSystemsTab.jsx';

// Tabs: cada uno con su id, su label y la sección de permisos que requiere
// para verse. El sidebar sigue mapeando /admin/ajustes a size_systems
// (compatibilidad con el permiso viejo); el tab colores valida por su
// propia sección. Ambos tienen el mismo read, así que en la práctica es
// el mismo permiso.
const TABS = [
  { id: 'sizes',  label: 'Sistemas de tallas',  section: 'size_systems'  },
  { id: 'colors', label: 'Sistemas de colores', section: 'color_systems' },
];

export default function Settings() {
  const me = useMe();
  const [activeTab, setActiveTab] = useState('sizes');
  const [systems, setSystems] = useState(null);
  const [colorSystems, setColorSystems] = useState(null);
  const [err, setErr] = useState('');

  async function loadSystems() {
    const r = await api('/api/admin/size-systems');
    if (r.ok) setSystems(r.data.data);
    else setErr(r.data?.error || 'Error al cargar');
  }

  async function loadColorSystems() {
    const r = await api('/api/admin/color-systems');
    if (r.ok) setColorSystems(r.data.data);
    else setErr(r.data?.error || 'Error al cargar');
  }

  useEffect(() => {
    loadSystems();
    loadColorSystems();
  }, []);

  // Solo mostramos las tabs que el rol puede ver. En la práctica ambos
  // tienen el mismo read, pero si en el futuro se separan permisos, la
  // UI ya está lista.
  const visibleTabs = TABS.filter((t) => canRead(t.section, me?.role));

  // Si la tab activa quedó fuera de las visibles (por permisos), caemos a
  // la primera visible.
  if (visibleTabs.length > 0 && !visibleTabs.find((t) => t.id === activeTab)) {
    setActiveTab(visibleTabs[0].id);
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Ajustes</h1>
        <p className="sub">Catálogos de variantes a nivel plataforma</p>
      </div>

      {visibleTabs.length > 1 && (
        <div className="tabs" style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--gray-200)', marginBottom: 20 }}>
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                color: activeTab === t.id ? 'var(--accent)' : 'var(--gray-700)',
                fontWeight: activeTab === t.id ? 600 : 400,
                cursor: 'pointer',
                fontSize: 14,
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {err && <div className="placeholder-card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', marginBottom: 16 }}>{err}</div>}

      {activeTab === 'sizes'  && <SizeSystemsTab systems={systems} load={loadSystems} me={me} err={err} />}
      {activeTab === 'colors' && <ColorSystemsTab systems={colorSystems} load={loadColorSystems} me={me} />}
    </div>
  );
}

// ============================================================================
// Tab: Sistemas de tallas (réplica del comportamiento previo, ahora encapsulado
// en este componente para convivir con la tab de colores).
// ============================================================================
function SizeSystemsTab({ systems, load, me, err }) {
  const [editing, setEditing] = useState(null); // { id?, name, sizes: [{id?, label}] }
  const [pending, setPending] = useState(false);
  const [localErr, setLocalErr] = useState('');

  function openNew() {
    setLocalErr('');
    setEditing({ name: '', sizes: [{ label: '' }] });
  }

  function openEdit(sys) {
    setLocalErr('');
    setEditing({
      id: sys.id,
      name: sys.name,
      sizes: (sys.sizes || []).map((s) => ({ id: s.id, label: s.label })),
    });
  }

  function close() { setEditing(null); setLocalErr(''); }

  async function save() {
    if (!editing) return;
    const sizes = editing.sizes.map((s) => ({ ...s, label: s.label.trim() })).filter((s) => s.label);
    setPending(true);
    setLocalErr('');
    const body = { name: editing.name.trim(), sizes };
    const r = editing.id
      ? await api(`/api/admin/size-systems/${editing.id}`, { method: 'PATCH', body })
      : await api('/api/admin/size-systems', { method: 'POST', body });
    setPending(false);
    if (r.ok) { close(); load(); }
    else setLocalErr(r.data?.message || r.data?.details?.join(', ') || r.data?.error || 'Error al guardar');
  }

  async function duplicate(sys) {
    const name = prompt(`Nombre del nuevo sistema (copia de "${sys.name}"):`, `${sys.name} (copia)`);
    if (!name || !name.trim()) return;
    const r = await api(`/api/admin/size-systems/${sys.id}/duplicate`, { method: 'POST', body: { name: name.trim() } });
    if (r.ok) load();
    else alert(r.data?.message || r.data?.error || 'Error al duplicar');
  }

  async function remove(sys) {
    if (!confirm(`¿Eliminar el sistema "${sys.name}"?\n\nSolo se puede si ningún producto lo usa.`)) return;
    const r = await api(`/api/admin/size-systems/${sys.id}`, { method: 'DELETE' });
    if (r.ok) load();
    else alert(r.data?.message || r.data?.error || 'Error al eliminar');
  }

  function patchSize(i, label) {
    setEditing((p) => ({ ...p, sizes: p.sizes.map((s, j) => j === i ? { ...s, label } : s) }));
  }
  function addSize() {
    setEditing((p) => ({ ...p, sizes: [...p.sizes, { label: '' }] }));
  }
  function removeSize(i) {
    setEditing((p) => ({ ...p, sizes: p.sizes.filter((_, j) => j !== i) }));
  }
  function moveSize(i, dir) {
    setEditing((p) => {
      const sizes = [...p.sizes];
      const j = i + dir;
      if (j < 0 || j >= sizes.length) return p;
      [sizes[i], sizes[j]] = [sizes[j], sizes[i]];
      return { ...p, sizes };
    });
  }

  if (systems === null) return <div style={{ padding: 40, color: 'var(--gray-500)' }}>Cargando…</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0 }}>Sistemas de tallas</h1>
          <p className="sub">Tallas de la plataforma agrupadas por sistema (Ropa, Calzado, y los custom que Rebeca necesite)</p>
        </div>
        <RoleGate section="size_systems" me={me}>
          <button className="btn" onClick={openNew}>+ Nuevo sistema</button>
        </RoleGate>
      </div>

      {err && !editing && (
        <div className="placeholder-card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', marginBottom: 16 }}>{err}</div>
      )}

      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>Sistema</th>
              <th>Tallas</th>
              <th>Productos</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {systems.map((sys) => (
              <tr key={sys.id}>
                <td style={{ fontWeight: 500 }}>
                  {sys.name}
                  {sys.is_system && <span className="badge off" style={{ marginLeft: 6 }}>De sistema</span>}
                </td>
                <td>
                  <span style={{ color: 'var(--gray-700)', fontSize: 13 }}>
                    {(sys.sizes || []).map((s) => s.label).join(' · ') || '—'}
                  </span>
                </td>
                <td>{sys.products_count}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <RoleGate section="size_systems" me={me}>
                    {!sys.is_system && (
                      <button className="row-btn" onClick={() => openEdit(sys)}>Editar</button>
                    )}
                    <button className="row-btn" style={{ marginLeft: 4 }} onClick={() => duplicate(sys)}>Duplicar</button>
                    {!sys.is_system && (
                      <button className="row-btn danger" style={{ marginLeft: 4 }} onClick={() => remove(sys)}>Eliminar</button>
                    )}
                  </RoleGate>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="form-hint" style={{ marginTop: 10 }}>
        "Ropa" y "Calzado" vienen con la plataforma: no se editan, pero puedes
        duplicarlos como punto de partida. Un producto también puede ser
        "sin tallas" (se elige al crearlo en Inventario).
      </p>

      <Modal
        open={!!editing}
        onClose={close}
        title={editing?.id ? `Editar "${editing.name}"` : 'Nuevo sistema de tallas'}
        footer={
          <>
            <button className="btn secondary" onClick={close} disabled={pending}>Cancelar</button>
            <button
              className="btn"
              onClick={save}
              disabled={pending || !editing?.name?.trim() || !editing?.sizes?.some((s) => s.label.trim())}
            >
              {pending ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        }
      >
        {editing && (
          <div className="form">
            {localErr && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{localErr}</div>}
            <div className="form-row">
              <label>Nombre *</label>
              <input
                value={editing.name}
                onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ej: Niños"
                autoFocus={!editing.id}
              />
            </div>
            <div className="form-row">
              <label>Tallas (en orden) *</label>
              <ul className="dash-list">
                {editing.sizes.map((s, i) => (
                  <li key={s.id ?? `new-${i}`}>
                    <input
                      value={s.label}
                      onChange={(e) => patchSize(i, e.target.value)}
                      placeholder="Etiqueta (ej: 4, S, 38…)"
                      style={{ flex: 1 }}
                    />
                    <span style={{ display: 'flex', gap: 4 }}>
                      <button type="button" className="row-btn" onClick={() => moveSize(i, -1)} disabled={i === 0}>↑</button>
                      <button type="button" className="row-btn" onClick={() => moveSize(i, 1)} disabled={i === editing.sizes.length - 1}>↓</button>
                      <button type="button" className="row-btn danger" onClick={() => removeSize(i)} title="Quitar talla">×</button>
                    </span>
                  </li>
                ))}
              </ul>
              <div>
                <button type="button" className="row-btn" onClick={addSize}>+ Agregar talla</button>
              </div>
              <div className="form-hint">
                Renombrar una talla que ya tiene ventas está bloqueado (el
                histórico la congela). Eliminar una exige que no tenga stock,
                ventas ni reservas.
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
