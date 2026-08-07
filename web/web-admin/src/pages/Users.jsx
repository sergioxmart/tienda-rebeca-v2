// CRUD de usuarios admin.
//
// Backend:
//   GET    /api/admin/users
//   GET    /api/admin/users/:id
//   POST   /api/admin/users         { email, password, role, name? }
//   PATCH  /api/admin/users/:id     { email?, role?, name?, active? }
//   POST   /api/admin/users/:id/reset-password  { password }
//   DELETE /api/admin/users/:id
//
// Roles: admin, operator, viewer. Solo admin puede crear/eliminar usuarios.

import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api, ApiError } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import Modal from '../components/Modal.jsx';
import Confirm from '../components/Confirm.jsx';
import Empty from '../components/Empty.jsx';

const ROLES = [
  { value: 'admin',    label: 'Admin' },
  { value: 'operator', label: 'Operador' },
  { value: 'viewer',   label: 'Visor' },
];

const EMPTY_NEW    = { email: '', name: '', role: 'operator', password: '' };
const EMPTY_EDIT   = { email: '', name: '', role: 'operator', active: true };

export default function Users() {
  const toast = useToast();
  const { user: currentUser } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [twoFactorSetup, setTwoFactorSetup] = useState(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorSaving, setTwoFactorSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/admin/users');
      setItems(data.users || []);
    } catch (err) {
      toast.error('No se pudieron cargar los usuarios', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => setEditing({ mode: 'new', ...EMPTY_NEW });
  const openEdit = (u) => setEditing({ mode: 'edit', id: u.id, ...EMPTY_EDIT, ...u });

  const save = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      if (editing.mode === 'new') {
        await api.post('/api/admin/users', {
          email: editing.email,
          name: editing.name,
          role: editing.role,
          password: editing.password,
        });
        toast.success('Usuario creado');
      } else {
        await api.patch(`/api/admin/users/${editing.id}`, {
          email: editing.email,
          name: editing.name,
          role: editing.role,
          active: editing.active,
        });
        toast.success('Usuario actualizado');
      }
      setEditing(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'email_already_exists') {
        toast.error('Ya existe un usuario con ese email');
      } else {
        toast.error('No se pudo guardar', err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (newPassword.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    try {
      await api.post(`/api/admin/users/${resetting.id}/reset-password`, { password: newPassword });
      toast.success('Contraseña actualizada');
      setResetting(null);
      setNewPassword('');
    } catch (err) {
      toast.error('No se pudo cambiar la contraseña', err.message);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/api/admin/users/${deleting.id}`);
      toast.success('Usuario eliminado');
      setDeleting(null);
      await load();
    } catch (err) {
      toast.error('No se pudo eliminar', err.message);
    }
  };

  const handleSetupBootstrapTwoFactor = async (u) => {
    try {
      const data = await api.post(`/api/admin/users/${u.id}/2fa/setup`, {});
      setTwoFactorSetup(data.data);
      setTwoFactorCode('');
    } catch (err) {
      toast.error('No se pudo preparar el 2FA', err.message);
    }
  };

  const handleEnableBootstrapTwoFactor = async () => {
    if (!/^\d{6}$/.test(twoFactorCode)) {
      toast.error('Escribe el código de 6 dígitos');
      return;
    }
    setTwoFactorSaving(true);
    try {
      await api.post('/api/auth/2fa/enable', { totp_code: twoFactorCode });
      toast.success('2FA activado');
      setTwoFactorSetup(null);
      setTwoFactorCode('');
      await load();
    } catch (err) {
      toast.error('Código no válido', err.message);
    } finally {
      setTwoFactorSaving(false);
    }
  };

  const handleResetTwoFactor = async (u) => {
    if (!window.confirm(`¿Resetear el 2FA de ${u.email}? Tendrá que configurarlo de nuevo en su siguiente ingreso.`)) return;
    try {
      await api.post(`/api/admin/users/${u.id}/reset-2fa`, {});
      toast.success('2FA reseteado');
      await load();
    } catch (err) {
      toast.error('No se pudo resetear el 2FA', err.message);
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <h1>Usuarios</h1>
        <button className="btn btn-primary" onClick={openNew}>+ Nuevo usuario</button>
      </div>

      {items.length === 0 ? (
        <Empty title="Sin usuarios" description="Todavía no hay usuarios creados." />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>2FA</th>
              <th>Último login</th>
              <th style={{ textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.name || '—'}</td>
                <td><span className="badge">{u.role}</span></td>
                <td>
                  {u.active
                    ? <span className="badge active">Activo</span>
                    : <span className="badge inactive">Inactivo</span>}
                </td>
                <td>{u.totp_enabled ? <span className="badge active">Activo</span> : <span className="badge">Pendiente</span>}</td>
                <td style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                  {u.last_login_at ? new Date(u.last_login_at).toLocaleString('es-CO') : '—'}
                </td>
                <td className="table-actions">
                  <button className="btn btn-sm" onClick={() => openEdit(u)}>Editar</button>
                  <button className="btn btn-sm" onClick={() => setResetting(u)}>Reset pass</button>
                  {u.id === 1 && !u.totp_enabled && Number(currentUser?.id) === 1 && <button className="btn btn-sm btn-accent" onClick={() => handleSetupBootstrapTwoFactor(u)}>Configurar 2FA</button>}
                  <button className="btn btn-sm" onClick={() => handleResetTwoFactor(u)}>Reset 2FA</button>
                  <button className="btn btn-sm btn-danger" onClick={() => setDeleting(u)}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal
        open={!!editing}
        onClose={() => !saving && setEditing(null)}
        title={editing?.mode === 'new' ? 'Nuevo usuario' : 'Editar usuario'}
        footer={
          <>
            <button className="btn" onClick={() => setEditing(null)} disabled={saving}>Cancelar</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? <span className="spinner" /> : 'Guardar'}
            </button>
          </>
        }
      >
        {editing && (
          <form onSubmit={save}>
            <div className="form-group">
              <label>Email</label>
              <input className="input" type="email" required
                     value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Nombre <span style={{ color: 'var(--color-muted)' }}>(opcional)</span></label>
              <input className="input" maxLength={120}
                     value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Rol</label>
              <select className="select" value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })}>
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            {editing.mode === 'new' && (
              <div className="form-group">
                <label>Contraseña</label>
                <input className="input" type="password" required minLength={8}
                       value={editing.password} onChange={(e) => setEditing({ ...editing, password: e.target.value })} />
                <div className="help">Mínimo 8 caracteres.</div>
              </div>
            )}
            {editing.mode === 'edit' && (
              <div className="form-group">
                <label className="checkbox">
                  <input type="checkbox" checked={editing.active}
                         onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
                  Activo
                </label>
              </div>
            )}
          </form>
        )}
      </Modal>

      <Modal
        open={!!resetting}
        onClose={() => setResetting(null)}
        title={`Resetear contraseña · ${resetting?.email}`}
        footer={
          <>
            <button className="btn" onClick={() => setResetting(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleResetPassword}>Cambiar</button>
          </>
        }
      >
        <div className="form-group">
          <label>Nueva contraseña</label>
          <input className="input" type="password" minLength={8} autoFocus
                 value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <div className="help">Mínimo 8 caracteres. Comunica esta contraseña al usuario por un canal seguro.</div>
        </div>
      </Modal>

      <Modal
        open={!!twoFactorSetup}
        onClose={() => !twoFactorSaving && setTwoFactorSetup(null)}
        title="Configurar 2FA del usuario principal"
        footer={
          <>
            <button className="btn" onClick={() => setTwoFactorSetup(null)} disabled={twoFactorSaving}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleEnableBootstrapTwoFactor} disabled={twoFactorSaving}>{twoFactorSaving ? <span className="spinner" /> : 'Activar 2FA'}</button>
          </>
        }
      >
        {twoFactorSetup && (
          <div className="two-factor-setup admin-two-factor-setup">
            <div className="qr-frame"><QRCodeSVG value={twoFactorSetup.otpauth_uri} size={190} includeMargin /></div>
            <p>Escanea el código con tu aplicación autenticadora y luego escribe el código actual.</p>
            <label htmlFor="admin-two-factor-code">Código de 6 dígitos</label>
            <input id="admin-two-factor-code" className="input code-input" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))} />
            <div className="backup-codes"><strong>Guarda tus códigos de respaldo</strong><span>{twoFactorSetup.backup_codes.join(' · ')}</span></div>
          </div>
        )}
      </Modal>

      <Confirm
        open={!!deleting}
        title="¿Eliminar usuario?"
        message={`Vas a eliminar a ${deleting?.email}. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
