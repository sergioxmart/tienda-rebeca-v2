// Temas: gestión de snapshots de la home (page_modules + subset de
// site_config) que se pueden importar/exportar como zip y aplicar.
//
// Acciones:
//   - Crear tema desde el estado actual (snapshot)
//   - Listar temas existentes
//   - Cargar un tema al borrador sin tocar la tienda publicada
//   - Exportar como zip (descarga)
//   - Importar un zip (crea un theme nuevo)
//   - Eliminar

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getToken } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import Modal from '../components/Modal.jsx';
import Confirm from '../components/Confirm.jsx';
import Empty from '../components/Empty.jsx';

const EMPTY_NEW = { name: '', description: '' };
const THEME_MODULE_META = {
  hero: { label: 'Hero', icon: '🎯', description: 'Presentación principal de la tienda con llamada a la acción.' },
  banner: { label: 'Banner', icon: '🖼️', description: 'Banda visual promocional con enlace opcional.' },
  categories: { label: 'Categorías', icon: '🏷️', description: 'Categorías del catálogo en formato de chips.' },
  categories_grid: { label: 'Grid de categorías', icon: '🗂️', description: 'Tarjetas visuales para navegar por categorías.' },
  featured_products: { label: 'Productos destacados', icon: '⭐', description: 'Productos marcados como destacados.' },
  recent_products: { label: 'Productos recientes', icon: '🆕', description: 'Productos ordenados por novedades.' },
};

function getStorePreviewUrl() {
  const configured = import.meta.env.VITE_STORE_PREVIEW_URL;
  if (configured) return `${configured.replace(/\/$/, '')}/?builder_preview=1`;
  const url = new URL(window.location.origin);
  if (url.port === '5174' || !url.port) url.port = '5173';
  url.search = '?builder_preview=1';
  return url.toString();
}

function ThemeLivePreview({ modules, siteConfig }) {
  const frameRef = useRef(null);
  const payload = {
    modules: (modules || []).map((module, index) => ({ ...module, id: module.id ?? `import-preview-${module.index ?? index}` })),
    site_config_subset: siteConfig || {},
  };
  const sendDraft = () => frameRef.current?.contentWindow?.postMessage({ type: 'techstore-builder-preview', draft: payload }, '*');

  useEffect(() => {
    const handleReady = (event) => {
      if (event.source === frameRef.current?.contentWindow && event.data?.type === 'techstore-builder-preview-ready') sendDraft();
    };
    window.addEventListener('message', handleReady);
    sendDraft();
    return () => window.removeEventListener('message', handleReady);
  }, [modules, siteConfig]);

  return <iframe className="theme-import-live-frame" ref={frameRef} title="Vista previa real del tema" src={getStorePreviewUrl()} onLoad={sendDraft} />;
}

export default function Themes() {
  const toast = useToast();
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(null);   // { name, description }
  const [applying, setApplying] = useState(null);   // theme
  const [deleting, setDeleting] = useState(null);   // theme
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [pendingImportFile, setPendingImportFile] = useState(null);
  const [selectedModuleIndexes, setSelectedModuleIndexes] = useState([]);
  const [importPreviewTab, setImportPreviewTab] = useState('summary');

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
      toast.success('Tema cargado al borrador', 'La tienda publicada no cambió.');
      setApplying(null);
      await load();
      navigate('/builder');
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
      const data = await api.upload('/api/admin/themes/import/preview', fd);
      setPendingImportFile(file);
      setImportPreview(data.preview);
      setSelectedModuleIndexes((data.preview?.modules || []).map((module) => module.index));
      setImportPreviewTab('summary');
    } catch (err) {
      toast.error('No se pudo leer el tema', err.message);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingImportFile) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', pendingImportFile);
      fd.append('module_indexes', JSON.stringify(selectedModuleIndexes));
      await api.upload('/api/admin/themes/import', fd);
      toast.success('Tema importado', 'Solo se guardaron los bloques seleccionados.');
      setImportPreview(null);
      setPendingImportFile(null);
      await load();
    } catch (err) {
      toast.error('No se pudo importar', err.message);
    } finally {
      setImporting(false);
    }
  };

  const toggleImportModule = (index) => setSelectedModuleIndexes((current) => (
    current.includes(index) ? current.filter((value) => value !== index) : [...current, index]
  ));

  const closeImportPreview = () => {
    if (importing) return;
    setImportPreview(null);
    setPendingImportFile(null);
  };

  const selectAllImportModules = () => setSelectedModuleIndexes((importPreview?.modules || []).map((module) => module.index));
  const clearImportModules = () => setSelectedModuleIndexes([]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Temas</h1>
          <p style={{ color: 'var(--color-muted)', margin: 0, fontSize: 13 }}>
            Snapshots de la home y datos del sitio. Importa o exporta como ZIP.
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
        <Empty title="Sin temas" description="Crea un snapshot del estado actual o importa un ZIP." action={
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
                     placeholder="Colección navideña, Verano 2026, etc." />
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

      <Modal
        open={!!importPreview}
        onClose={closeImportPreview}
        size="lg"
        title={`Previsualizar importación${importPreview?.name ? ` · ${importPreview.name}` : ''}`}
        footer={
          <>
            <button className="btn" onClick={closeImportPreview} disabled={importing}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleConfirmImport} disabled={importing}>
              {importing ? <span className="spinner" /> : `Importar ${selectedModuleIndexes.length} bloque${selectedModuleIndexes.length === 1 ? '' : 's'}`}
            </button>
          </>
        }
      >
        {importPreview && (
          <div className="theme-import-preview">
            <div className="theme-import-summary">
              <div className="theme-import-summary-icon">🎨</div>
              <div><span className="builder-kicker">Paquete listo para revisar</span><h2>{importPreview.name || 'Tema sin nombre'}</h2><p>{importPreview.description || 'Este paquete contiene una configuración visual para la tienda.'}</p></div>
            </div>
            <div className="theme-import-stats">
              <div><strong>{importPreview.modules.length}</strong><span>bloques detectados</span></div>
              <div><strong>{selectedModuleIndexes.length}</strong><span>bloques seleccionados</span></div>
              <div><strong>{importPreview.site_config_keys?.length || 0}</strong><span>ajustes globales</span></div>
            </div>
            <div className="builder-modal-tabs theme-import-tabs" role="tablist" aria-label="Previsualización del tema">
              <button className={`builder-modal-tab ${importPreviewTab === 'summary' ? 'is-active' : ''}`} type="button" onClick={() => setImportPreviewTab('summary')}>Bloques y configuración</button>
              <button className={`builder-modal-tab ${importPreviewTab === 'preview' ? 'is-active' : ''}`} type="button" onClick={() => setImportPreviewTab('preview')}>Vista previa real</button>
            </div>
            {importPreviewTab === 'summary' ? (
              <>
                <div className="theme-import-selection-toolbar"><strong>Elige qué deseas importar</strong><span>{selectedModuleIndexes.length} de {importPreview.modules.length}</span><div><button className="btn btn-sm" type="button" onClick={selectAllImportModules}>Todos</button><button className="btn btn-sm" type="button" onClick={clearImportModules}>Ninguno</button></div></div>
                <div className="theme-import-module-list">
                  {importPreview.modules.map((module) => {
                    const meta = THEME_MODULE_META[module.type] || { label: module.type, icon: '📦', description: 'Bloque personalizado del tema.' };
                    return <label className={`theme-import-module ${selectedModuleIndexes.includes(module.index) ? 'is-selected' : ''}`} key={module.index}>
                      <input type="checkbox" checked={selectedModuleIndexes.includes(module.index)} onChange={() => toggleImportModule(module.index)} />
                      <span className="theme-import-module-icon">{meta.icon}</span>
                      <span className="theme-import-module-copy"><strong>{meta.label}</strong><small>{meta.description}</small><em>{module.active ? 'Activo' : 'Inactivo'} · posición {module.index + 1}{Object.keys(module.settings || {}).length > 0 ? ` · ${Object.keys(module.settings).length} ajustes` : ''}</em></span>
                      <span className="badge">{module.active ? 'Activo' : 'Inactivo'}</span>
                    </label>;
                  })}
                </div>
                {importPreview.site_config_keys?.length > 0 && <div className="theme-import-config"><strong>Configuración global incluida</strong><p>{importPreview.site_config_keys.join(' · ')}</p></div>}
              </>
            ) : <ThemeLivePreview modules={importPreview.modules.filter((module) => selectedModuleIndexes.includes(module.index))} siteConfig={importPreview.site_config_subset} />}
          </div>
        )}
      </Modal>

      <Confirm
        open={!!applying}
        title={`Aplicar tema "${applying?.name}"`}
        message="Esto cargará el tema al borrador para que puedas revisarlo. La tienda publicada no cambiará hasta que pulses Publicar en el Builder. ¿Continuar?"
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
