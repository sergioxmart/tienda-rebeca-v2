// Temas: gestión de snapshots de la home (page_modules + subset de
// site_config) que se pueden importar/exportar como zip y aplicar.
//
// Acciones:
//   - Crear tema desde el estado actual (snapshot)
//   - Listar temas existentes
//   - Aplicar un tema (reemplaza los modules activos y el subset de
//     site_config con los del theme)
//   - Exportar como zip (descarga)
//   - Importar un zip (crea un theme nuevo)
//   - Eliminar

import React, { useEffect, useRef, useState } from 'react';
import { api, getToken } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import Modal from '../components/Modal.jsx';
import Confirm from '../components/Confirm.jsx';
import Empty from '../components/Empty.jsx';

const EMPTY_NEW = { name: '', description: '' };

export default function Themes() {
  const toast = useToast();
  const fileRef = useRef(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(null);   // { name, description }
  const [applying, setApplying] = useState(null);   // theme
  const [deleting, setDeleting] = useState(null);   // theme
  const [importing, setImporting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/admin/themes');
      setItems(data.themes || []);
    } catch (err) {
      toast.error('No se pudieron cargar los temas', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e?.preventDefault();
    if (!creating?.name?.trim()) return;
    try {
      await api.post('/api/admin/themes', { name: creating.name, description: creating.description });
      toast.success('Tema creado');
      setCreating(null);
      await load();
    } catch (err) {
      toast.error('No se pudo crear el tema', err.message);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/api/admin/themes/${deleting.id}`);
      toast.success('Tema eliminado');
      setDeleting(null);
      await load();
    } catch (err) {
      toast.error('No se pudo eliminar', err.message);
    }
  };

  const handleApply = async () => {
    try {
      await api.post(`/api/admin/themes/${applying.id}/apply`, {});
      toast.success('Tema aplicado', 'La home se actualizó.');
      setApplying(null);
      await load();
    } catch (err) {
      toast.error('No se pudo aplicar el tema', err.message);
    }
  };

  const handleExport = async (theme) => {
    try {
      const token = getToken();
      const res = await fetch(`/api/admin/themes/${theme.id}/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${theme.name.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.theme.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Tema exportado');
    } catch (err) {
      toast.error('No se pudo exportar', err.message);
    }
  };

  const handleExportCurrent = async () => {
    try {
      const token = getToken();
      const res = await fetch('/api/admin/themes/current/export', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'techstore-tema-actual.theme.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Tema actual exportado');
    } catch (err) {
      toast.error('No se pudo exportar el tema actual', err.message);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.upload('/api/admin/themes/import', fd);
      toast.success('Tema importado');
      await load();
    } catch (err) {
      toast.error('No se pudo importar', err.message);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Temas</h1>
          <p style={{ color: 'var(--color-muted)', margin: 0, fontSize: 13 }}>
            Snapshots de la home y datos del sitio. Importá/exportá como zip.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input ref={fileRef} type="file" accept=".zip" style={{ display: 'none' }} onChange={handleImport} />
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? <span className="spinner" /> : '↑ Importar zip'}
          </button>
          <button className="btn" onClick={handleExportCurrent}>↓ Exportar actual</button>
          <button className="btn btn-primary" onClick={() => setCreating({ ...EMPTY_NEW })}>+ Nuevo tema</button>
        </div>
      </div>

      {items.length === 0 ? (
        <Empty title="Sin temas" description="Creá un snapshot del estado actual o importá un zip." action={
          <button className="btn btn-primary" onClick={() => setCreating({ ...EMPTY_NEW })}>+ Nuevo tema</button>
        } />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Descripción</th>
              <th>Versión</th>
              <th>Actualizado</th>
              <th style={{ textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id}>
                <td><strong>{t.name}</strong></td>
                <td style={{ color: 'var(--color-muted)' }}>{t.description || '—'}</td>
                <td>v{t.version}</td>
                <td style={{ fontSize: 12, color: 'var(--color-muted)' }}>{new Date(t.updated_at).toLocaleString('es-CO')}</td>
                <td className="table-actions">
                  <button className="btn btn-sm" onClick={() => handleExport(t)}>↓ Exportar</button>
                  <button className="btn btn-sm btn-primary" onClick={() => setApplying(t)}>Aplicar</button>
                  <button className="btn btn-sm btn-danger" onClick={() => setDeleting(t)}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal
        open={!!creating}
        onClose={() => setCreating(null)}
        title="Nuevo tema desde el estado actual"
        footer={
          <>
            <button className="btn" onClick={() => setCreating(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleCreate}>Crear</button>
          </>
        }
      >
        {creating && (
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label>Nombre *</label>
              <input className="input" required maxLength={100} autoFocus
                     value={creating.name} onChange={(e) => setCreating({ ...creating, name: e.target.value })}
                     placeholder="TechStore Navideño, Verano 2026, etc." />
            </div>
            <div className="form-group">
              <label>Descripción <span style={{ color: 'var(--color-muted)' }}>(opcional)</span></label>
              <textarea className="textarea" value={creating.description}
                        onChange={(e) => setCreating({ ...creating, description: e.target.value })} />
            </div>
            <div className="help" style={{ fontSize: 12, color: 'var(--color-muted)' }}>
              Esto guarda los page_modules activos y un subset de site_config (nombre, contacto, color de login) como snapshot.
            </div>
          </form>
        )}
      </Modal>

      <Confirm
        open={!!applying}
        title={`Aplicar tema "${applying?.name}"`}
        message="Esto va a reemplazar los módulos activos de la home y un subset de site_config. ¿Continuar?"
        confirmLabel="Aplicar"
        onCancel={() => setApplying(null)}
        onConfirm={handleApply}
      />

      <Confirm
        open={!!deleting}
        title="¿Eliminar tema?"
        message={`Vas a eliminar el tema "${deleting?.name}". Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
