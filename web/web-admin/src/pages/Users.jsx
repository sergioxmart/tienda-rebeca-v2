// Gestión de usuarios del panel (solo admin).
// Lista los `auth_users`, permite crear / editar / desactivar / resetear pass.
// Tabla: auth_users (id, email, password_hash, name, role, active, …).
// Reglas que el server ya enforce: no desactivarse, no cambiarse
// el rol a sí mismo, siempre ≥1 admin activo.

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api, setAccessToken } from '../api.js';
import Modal from '../components/Modal.jsx';
import { useMe } from '../hooks/useMe.js';

const ROLES = [
  { value: 'admin',    label: 'Admin' },
  { value: 'operator', label: 'Operador' },
  { value: 'viewer',   label: 'Visualizador' },
];

function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

export default function Users() {
  const me = useMe();
  const [users, setUsers] = useState(null);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null);   // form de crear/editar
  const [resetPwd, setResetPwd] = useState(null); // form de reset pass
  const [twoFactorSetup, setTwoFactorSetup] = useState(null);
  const [pending, setPending] = useState(false);

  async function load() {
    setErr('');
    const r = await api('/api/admin/users');
    if (r.ok) setUsers(r.data.data);
    else setErr(r.data?.error || 'Error al cargar');
  }
  useEffect(() => { load(); }, []);

  const isAdmin = me?.role === 'admin';
  const firstAdmin = users?.find((u) => u.role === 'admin');

  function openNew() {
    setErr('');
    setEditing({ isNew: true, email: '', name: '', role: 'operator', password: '', active: true });
  }
  function openEdit(u) {
    setErr('');
    setEditing({ isNew: false, id: u.id, email: u.email, name: u.name, role: u.role, active: u.active });
  }
  function close() { setEditing(null); setErr(''); }

  function errMsg(r) {
    const e = r.data?.error;
    if (e === 'email_in_use')         return 'Ya existe un usuario con ese email.';
    if (e === 'invalid_email')        return 'Email inválido.';
    if (e === 'name_required')        return 'El nombre es obligatorio.';
    if (e === 'invalid_role')         return 'Rol inválido.';
    if (e === 'password_too_short')   return 'La contraseña debe tener al menos 8 caracteres.';
    if (e === 'cannot_change_own_role') return 'No puedes cambiar tu propio rol.';
    if (e === 'cannot_deactivate_self') return 'No puedes desactivarte.';
    if (e === 'cannot_delete_self')   return 'No puedes eliminarte.';
    if (e === 'last_admin')           return 'No puedes: tiene que quedar al menos un admin activo.';
    if (e === 'forbidden')            return 'Solo un admin puede hacer esto.';
    return e || r.data?.message || `Error (${r.status})`;
  }

  async function save() {
    if (!editing) return;
    setPending(true);
    setErr('');
    let r;
    if (editing.isNew) {
      r = await api('/api/admin/users', { method: 'POST', body: {
        email: editing.email.trim(),
        name: editing.name.trim(),
        role: editing.role,
        password: editing.password,
      }});
    } else {
      r = await api(`/api/admin/users/${editing.id}`, { method: 'PATCH', body: {
        name: editing.name.trim(),
        role: editing.role,
        active: !!editing.active,
      }});
    }
    setPending(false);
    if (r.ok) { close(); load(); }
    else setErr(errMsg(r));
  }

  async function toggleActive(u) {
    const r = await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } });
    if (r.ok) load();
    else alert(errMsg(r));
  }

  async function remove(u) {
    if (!confirm(`¿Desactivar a "${u.email}"?\n\nPodés volver a activarlo después.`)) return;
    const r = await api(`/api/admin/users/${u.id}`, { method: 'DELETE' });
    if (r.ok) load();
    else alert(errMsg(r));
  }

  async function submitResetPwd() {
    if (!resetPwd) return;
    setPending(true);
    const r = await api(`/api/admin/users/${resetPwd.id}/reset-password`, {
      method: 'POST',
      body: { new_password: resetPwd.password },
    });
    setPending(false);
    if (r.ok) { setResetPwd(null); }
    else alert(errMsg(r));
  }

  async function beginTwoFactor(u) {
    setPending(true); setErr('');
    const r = await api(`/api/admin/users/${u.id}/2fa/setup`, { method: 'POST' });
    setPending(false);
    if (r.ok) setTwoFactorSetup({ ...r.data.data, code: '' });
    else setErr(errMsg(r));
  }

  async function confirmTwoFactor() {
    if (!twoFactorSetup) return;
    setPending(true); setErr('');
    const r = await api('/api/auth/2fa/confirm', { method: 'POST', body: { setup_token: twoFactorSetup.setup_token, code: twoFactorSetup.code } });
    setPending(false);
    if (r.ok) {
      setAccessToken(r.data.data.access_token);
      setTwoFactorSetup(null);
      load();
    } else setErr(r.data?.error === 'invalid_two_factor_code' ? 'El código no es válido.' : errMsg(r));
  }

  if (users === null) return <div style={{ padding: 40, color: 'var(--gray-500)' }}>Cargando…</div>;
  if (!isAdmin) {
    return (
      <div>
        <h1>Usuarios</h1>
        <p className="sub">Solo accesible para administradores.</p>
        <div className="placeholder-card">Pedile a un admin que te dé permisos para ver esta sección.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1>Usuarios</h1>
          <p className="sub">Cuentas con acceso al panel. Los usuarios nuevos activan 2FA en su primer ingreso.</p>
        </div>
        <button className="btn" onClick={openNew}>+ Nuevo usuario</button>
      </div>

      {err && <div className="placeholder-card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', marginBottom: 16 }}>{err}</div>}

      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Último login</th>
              <th>Creado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isMe = me && me.id === u.id;
              return (
                <tr key={u.id} style={u.active ? null : { opacity: 0.55 }}>
                  <td style={{ fontWeight: 500 }}>{u.email}{isMe && <span className="badge on" style={{ marginLeft: 6 }}>Tú</span>}</td>
                  <td>{u.name || '—'}</td>
                  <td><span className="badge">{ROLES.find((r) => r.value === u.role)?.label || u.role}</span></td>
                  <td>
                    {u.active
                      ? <span className="badge on">Activo</span>
                      : <span className="badge off">Inactivo</span>}
                  </td>
                  <td style={{ color: 'var(--gray-500)', fontSize: 13 }}>{fmtDate(u.last_login_at)}</td>
                  <td style={{ color: 'var(--gray-500)', fontSize: 13 }}>{fmtDate(u.created_at)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {isMe && firstAdmin?.id === u.id && !u.two_factor_enabled_at && (
                      <button className="row-btn" onClick={() => beginTwoFactor(u)}>Activar 2FA</button>
                    )}
                    <button className="row-btn" onClick={() => openEdit(u)}>Editar</button>
                    <button className="row-btn" style={{ marginLeft: 4 }} onClick={() => setResetPwd({ id: u.id, email: u.email, password: '' })}>Reset pass</button>
                    {!isMe && (
                      <>
                        <button className="row-btn" style={{ marginLeft: 4 }} onClick={() => toggleActive(u)}>
                          {u.active ? 'Desactivar' : 'Activar'}
                        </button>
                        <button className="row-btn danger" style={{ marginLeft: 4 }} onClick={() => remove(u)}>Eliminar</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr><td colSpan={7} style={{ color: 'var(--gray-500)', textAlign: 'center', padding: 24 }}>No hay usuarios.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="form-hint" style={{ marginTop: 10 }}>
        Eliminación = soft delete (el usuario se marca como inactivo y conserva
        su historial de ventas / caja). Reset pass invalida sus sesiones
        activas. La primera cuenta admin puede activar 2FA aquí para recuperar
        su contraseña desde el login.
      </p>

      {/* Modal: crear / editar */}
      <Modal
        open={!!editing}
        onClose={close}
        title={editing?.isNew ? 'Nuevo usuario' : `Editar ${editing?.email || ''}`}
        footer={
          <>
            <button className="btn secondary" onClick={close} disabled={pending}>Cancelar</button>
            <button
              className="btn"
              onClick={save}
              disabled={pending || !editing?.name?.trim() || !editing?.email?.trim() || (editing.isNew && !editing.password)}
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
              <label>Email *</label>
              <input
                type="email"
                value={editing.email}
                disabled={!editing.isNew}
                onChange={(e) => setEditing((p) => ({ ...p, email: e.target.value }))}
                placeholder="usuario@ejemplo.com"
                autoFocus={editing.isNew}
              />
              {!editing.isNew && <div className="form-hint">El email no se puede cambiar.</div>}
            </div>
            <div className="form-row">
              <label>Nombre *</label>
              <input
                value={editing.name}
                onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))}
                placeholder="Nombre para mostrar"
              />
            </div>
            <div className="form-row">
              <label>Rol *</label>
              <select
                value={editing.role}
                disabled={me && editing.id === me.id}
                onChange={(e) => setEditing((p) => ({ ...p, role: e.target.value }))}
              >
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              {me && editing.id === me.id && <div className="form-hint">No puedes cambiar tu propio rol.</div>}
            </div>
            {editing.isNew && (
              <div className="form-row">
                <label>Contraseña * (mín. 8)</label>
                <input
                  type="password"
                  value={editing.password}
                  onChange={(e) => setEditing((p) => ({ ...p, password: e.target.value }))}
                  placeholder="Contraseña inicial"
                />
                <div className="form-hint">El usuario podrá cambiarla desde su perfil cuando agreguemos esa pantalla.</div>
              </div>
            )}
            {!editing.isNew && me && editing.id !== me.id && (
              <div className="form-row">
                <label>
                  <input
                    type="checkbox"
                    checked={!!editing.active}
                    onChange={(e) => setEditing((p) => ({ ...p, active: e.target.checked }))}
                  />
                  {' '}Activo
                </label>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal: reset password */}
      <Modal
        open={!!resetPwd}
        onClose={() => setResetPwd(null)}
        title={`Resetear contraseña de ${resetPwd?.email || ''}`}
        footer={
          <>
            <button className="btn secondary" onClick={() => setResetPwd(null)} disabled={pending}>Cancelar</button>
            <button
              className="btn"
              onClick={submitResetPwd}
              disabled={pending || !resetPwd?.password || resetPwd.password.length < 8}
            >
              {pending ? 'Reseteando…' : 'Resetear'}
            </button>
          </>
        }
      >
        {resetPwd && (
          <div className="form">
            <div className="form-row">
              <label>Nueva contraseña (mín. 8)</label>
              <input
                type="password"
                value={resetPwd.password}
                onChange={(e) => setResetPwd((p) => ({ ...p, password: e.target.value }))}
                autoFocus
              />
              <div className="form-hint">
                El usuario tendrá que volver a iniciar sesión en todos sus
                dispositivos.
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!twoFactorSetup}
        onClose={() => !pending && setTwoFactorSetup(null)}
        title="Activar autenticación en dos pasos"
        footer={<>
          <button className="btn secondary" onClick={() => setTwoFactorSetup(null)} disabled={pending}>Cancelar</button>
          <button className="btn" onClick={confirmTwoFactor} disabled={pending || twoFactorSetup?.code?.length !== 6}>{pending ? 'Verificando…' : 'Confirmar código'}</button>
        </>}
      >
        {twoFactorSetup && <div className="form">
          <p className="form-hint">Escanea el QR con Google Authenticator, Authy o 1Password. Guarda el token y confirma el primer código de seis dígitos.</p>
          <div style={{ display: 'flex', justifyContent: 'center', margin: '18px 0' }}><QRCodeSVG value={twoFactorSetup.otpauth_uri} size={190} /></div>
          <div className="form-row"><label>Código de autenticación</label><input value={twoFactorSetup.code} onChange={(e) => setTwoFactorSetup((p) => ({ ...p, code: e.target.value.replace(/\D/g, '').slice(0, 6) }))} inputMode="numeric" autoComplete="one-time-code" autoFocus /></div>
        </div>}
      </Modal>
    </div>
  );
}
