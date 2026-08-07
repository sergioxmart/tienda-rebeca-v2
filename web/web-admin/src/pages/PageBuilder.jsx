// Web Builder: gestión de page_modules (los bloques que se renderizan en
// la home del store).
//
// Acciones:
//   - Listar módulos en orden (con ↑↓)
//   - Crear nuevo módulo (selector de tipo)
//   - Editar módulo (form generado desde el schema del tipo)
//   - Toggle activo/inactivo
//   - Eliminar
//   - Guardar el orden nuevo después de mover ↑↓
//
// El form se genera dinámicamente desde MODULE_SCHEMAS para no tener
// que escribir un form por cada tipo de módulo. Si agregás un type
// nuevo, agregalo en:
//   - web/server/routes/admin/page-modules.js (MODULE_TYPES)
//   - web/server/routes/admin/page-modules.js (seed inicial opcional)
//   - aca en MODULE_SCHEMAS (label, icon, settings[])

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import Modal from '../components/Modal.jsx';
import Confirm from '../components/Confirm.jsx';
import Empty from '../components/Empty.jsx';

// Schema de los settings por tipo. Cada setting tiene key, label y type.
const MODULE_SCHEMAS = {
  hero: {
    label: 'Hero',
    description: 'Banner principal con título, subtítulo, imagen y un botón de acción.',
    icon: '🎯',
    settings: [
      { key: 'eyebrow',  label: 'Etiqueta superior', type: 'text', placeholder: 'Tecnología para tu día a día', defaultValue: 'Tecnología para tu día a día' },
      { key: 'title',    label: 'Título',         type: 'text' },
      { key: 'subtitle', label: 'Subtítulo',      type: 'textarea' },
      { key: 'image_url',label: 'Imagen de fondo (URL)', type: 'url', placeholder: 'Opcional: imagen que cubre el fondo' },
      { key: 'visual_mode', label: 'Visual del lado derecho', type: 'select', defaultValue: 'abstract', options: [
        { value: 'abstract', label: 'Abstracto TechStore' },
        { value: 'product', label: 'Producto real del catálogo' },
        { value: 'image', label: 'Imagen personalizada' },
      ] },
      { key: 'product_slug', label: 'Producto destacado', type: 'product', placeholder: 'Selecciona un producto' },
      { key: 'visual_image_url', label: 'Imagen personalizada (URL)', type: 'url', placeholder: 'Se usa cuando eliges Imagen personalizada' },
      { key: 'cta_text', label: 'Texto del botón',type: 'text',  placeholder: 'Ver catálogo' },
      { key: 'cta_link', label: 'Link del botón', type: 'text',  placeholder: '/categoria/accesorios-telefono' },
      { key: 'secondary_cta_text', label: 'Texto del segundo enlace', type: 'text', defaultValue: 'Explorar catálogo' },
      { key: 'secondary_cta_link', label: 'Link del segundo enlace', type: 'text', defaultValue: '/categoria' },
    ],
  },
  banner: {
    label: 'Banner',
    description: 'Imagen clickeable horizontal.',
    icon: '🖼️',
    settings: [
      { key: 'image_url', label: 'Imagen (URL)', type: 'url' },
      { key: 'link',      label: 'Link al hacer click', type: 'text', placeholder: '/categoria/...' },
      { key: 'alt',       label: 'Texto alternativo',   type: 'text' },
    ],
  },
  categories: {
    label: 'Categorías (chips)',
    description: 'Lista horizontal de chips con las categorías. El admin no elige cuáles, son todas.',
    icon: '🏷️',
    settings: [
      { key: 'title', label: 'Título de la sección', type: 'text', placeholder: 'Categorías' },
    ],
  },
  categories_grid: {
    label: 'Categorías (grid)',
    description: 'Grid de cards con cada categoría, ideal para hero secundario.',
    icon: '🗂️',
    settings: [
      { key: 'title', label: 'Título de la sección', type: 'text' },
    ],
  },
  featured_products: {
    label: 'Productos destacados',
    description: 'Grid de productos con featured=TRUE.',
    icon: '⭐',
    settings: [
      { key: 'title', label: 'Título de la sección', type: 'text', placeholder: 'Destacados' },
      { key: 'limit', label: 'Cantidad máxima',      type: 'number', defaultValue: 8 },
    ],
  },
  recent_products: {
    label: 'Productos recientes',
    description: 'Grid de productos ordenados por más nuevos.',
    icon: '🆕',
    settings: [
      { key: 'title', label: 'Título de la sección', type: 'text', placeholder: 'Lo más nuevo' },
      { key: 'limit', label: 'Cantidad máxima',      type: 'number', defaultValue: 8 },
    ],
  },
};

const EMPTY_NEW = { type: 'hero', settings: {}, active: true };
const NAV_DEFAULTS = {
  navbar_announcement: 'Envíos a toda Colombia · Compra fácil y segura',
  navbar_show_announcement: true,
  navbar_show_search: true,
  navbar_show_cart: true,
  navbar_show_categories: true,
  navbar_links: [],
};

function normalizeNavLinks(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((link) => link && typeof link === 'object')
    .map((link) => ({ label: String(link.label || ''), href: String(link.href || ''), featured: Boolean(link.featured) }))
    .filter((link) => link.label || link.href);
}

function defaultSettingsForType(type) {
  const schema = MODULE_SCHEMAS[type];
  if (!schema) return {};
  const out = {};
  for (const f of schema.settings) {
    if (f.defaultValue !== undefined) out[f.key] = f.defaultValue;
    else if (f.type === 'number') out[f.key] = 0;
    else out[f.key] = '';
  }
  return out;
}

export default function PageBuilder() {
  const toast = useToast();
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);   // modulo en edición o { type, settings, active } para nuevo
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reorderDirty, setReorderDirty] = useState(false);
  const [products, setProducts] = useState([]);
  const [navSettings, setNavSettings] = useState(NAV_DEFAULTS);
  const [navSaving, setNavSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/admin/page-modules');
      setModules(data.modules || []);
      setReorderDirty(false);
    } catch (err) {
      toast.error('No se pudieron cargar los módulos', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get('/api/admin/site-config');
        const config = data.config || data;
        setNavSettings((current) => ({
          ...current,
          ...Object.fromEntries(Object.keys(NAV_DEFAULTS).filter((key) => key !== 'navbar_links').map((key) => [key, config[key] ?? current[key]])),
          navbar_links: normalizeNavLinks(config.navbar_links),
        }));
      } catch (err) {
        toast.error('No se pudo cargar la configuración del navbar', err.message);
      }
    })();
    api.get('/api/admin/products?active=true').then((data) => setProducts(data.products || [])).catch(() => setProducts([]));
  }, [toast]);

  const move = (idx, dir) => {
    const next = [...modules];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setModules(next);
    setReorderDirty(true);
  };

  const saveOrder = async () => {
    try {
      await api.patch('/api/admin/page-modules/reorder', { ids: modules.map((m) => m.id) });
      toast.success('Orden guardado');
      setReorderDirty(false);
    } catch (err) {
      toast.error('No se pudo guardar el orden', err.message);
    }
  };

  const openNew = () => setEditing({ mode: 'new', ...EMPTY_NEW, settings: defaultSettingsForType('hero') });
  const openEdit = (m) => setEditing({ mode: 'edit', id: m.id, type: m.type, settings: { ...m.settings }, active: m.active });

  const onTypeChange = (newType) => {
    setEditing((cur) => {
      if (cur.mode === 'edit') {
        // Al cambiar tipo, mantenemos settings que coincidan con el schema nuevo.
        const merged = {};
        const schema = MODULE_SCHEMAS[newType];
        for (const f of (schema?.settings || [])) {
          if (cur.settings[f.key] !== undefined) merged[f.key] = cur.settings[f.key];
        }
        // Llenar defaults si faltan
        for (const f of (schema?.settings || [])) {
          if (merged[f.key] === undefined) {
            if (f.defaultValue !== undefined) merged[f.key] = f.defaultValue;
            else if (f.type === 'number') merged[f.key] = 0;
            else merged[f.key] = '';
          }
        }
        return { ...cur, type: newType, settings: merged };
      }
      // En new, regenero todo desde el schema del tipo nuevo.
      return { ...cur, type: newType, settings: defaultSettingsForType(newType) };
    });
  };

  const setSetting = (key, value) => {
    setEditing((cur) => ({ ...cur, settings: { ...cur.settings, [key]: value } }));
  };

  const setNavValue = (key, value) => setNavSettings((current) => ({ ...current, [key]: value }));
  const updateNavLink = (index, key, value) => setNavSettings((current) => ({
    ...current,
    navbar_links: current.navbar_links.map((link, linkIndex) => linkIndex === index ? { ...link, [key]: value } : link),
  }));
  const addNavLink = () => setNavSettings((current) => ({ ...current, navbar_links: [...current.navbar_links, { label: '', href: '', featured: false }] }));
  const removeNavLink = (index) => setNavSettings((current) => ({ ...current, navbar_links: current.navbar_links.filter((_, linkIndex) => linkIndex !== index) }));

  const saveNavSettings = async () => {
    setNavSaving(true);
    try {
      await api.patch('/api/admin/site-config', {
        ...navSettings,
        navbar_links: navSettings.navbar_links.filter((link) => link.label.trim() && link.href.trim()),
      });
      toast.success('Navbar actualizado');
    } catch (err) {
      toast.error('No se pudo guardar el navbar', err.message);
    } finally {
      setNavSaving(false);
    }
  };

  const handleSave = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      // Coerce numbers y limpia vacíos
      const settingsOut = {};
      const schema = MODULE_SCHEMAS[editing.type];
      for (const f of (schema?.settings || [])) {
        const raw = editing.settings[f.key];
        if (raw === '' || raw === undefined || raw === null) continue;
        settingsOut[f.key] = f.type === 'number' ? Number(raw) : raw;
      }
      if (editing.mode === 'new') {
        await api.post('/api/admin/page-modules', { type: editing.type, settings: settingsOut, active: editing.active });
        toast.success('Módulo creado');
      } else {
        await api.patch(`/api/admin/page-modules/${editing.id}`, { type: editing.type, settings: settingsOut, active: editing.active });
        toast.success('Módulo actualizado');
      }
      setEditing(null);
      await load();
    } catch (err) {
      toast.error('No se pudo guardar', err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (m) => {
    try {
      await api.patch(`/api/admin/page-modules/${m.id}`, { active: !m.active });
      await load();
    } catch (err) {
      toast.error('No se pudo cambiar el estado', err.message);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/api/admin/page-modules/${deleting.id}`);
      toast.success('Módulo eliminado');
      setDeleting(null);
      await load();
    } catch (err) {
      toast.error('No se pudo eliminar', err.message);
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>;

  const schema = editing ? MODULE_SCHEMAS[editing.type] : null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Web Builder</h1>
          <p style={{ color: 'var(--color-muted)', margin: 0, fontSize: 13 }}>
            Estos bloques se renderizan en la home del store. Reordénalos con ↑↓ y guarda el orden.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {reorderDirty && (
            <button className="btn btn-primary" onClick={saveOrder}>Guardar orden</button>
          )}
          <button className="btn btn-accent" onClick={openNew}>+ Nuevo módulo</button>
        </div>
      </div>

      <section className="builder-global-card">
        <div className="builder-card-heading">
          <div><span className="builder-kicker">Apariencia global</span><h2>Navbar de la tienda</h2><p>Personaliza la barra que aparece en todas las páginas de 5173.</p></div>
          <button className="btn btn-primary" onClick={saveNavSettings} disabled={navSaving}>{navSaving ? <span className="spinner" /> : 'Guardar navbar'}</button>
        </div>
        <div className="builder-nav-preview">
          <div className="builder-preview-logo"><span>TS</span> {navSettings.navbar_links.find((link) => link.label)?.label || 'TechStore'}</div>
          <div className="builder-preview-search">⌕ ¿Qué estás buscando?</div>
          <div className="builder-preview-actions">{navSettings.navbar_show_search ? 'Buscar' : 'Sin búsqueda'} · {navSettings.navbar_show_cart ? 'Carrito' : 'Sin carrito'}</div>
        </div>
        <div className="form-row builder-global-fields">
          <div className="form-group"><label>Mensaje superior</label><input className="input" value={navSettings.navbar_announcement} onChange={(e) => setNavValue('navbar_announcement', e.target.value)} placeholder="Envíos a toda Colombia · Compra fácil y segura" /></div>
          <div className="form-group"><label>Mostrar categorías automáticas</label><select className="select" value={String(navSettings.navbar_show_categories)} onChange={(e) => setNavValue('navbar_show_categories', e.target.value === 'true')}><option value="true">Sí, usar categorías del catálogo</option><option value="false">No</option></select></div>
        </div>
        <div className="builder-toggle-row">
          <label><input type="checkbox" checked={navSettings.navbar_show_announcement} onChange={(e) => setNavValue('navbar_show_announcement', e.target.checked)} /> Mostrar mensaje superior</label>
          <label><input type="checkbox" checked={navSettings.navbar_show_search} onChange={(e) => setNavValue('navbar_show_search', e.target.checked)} /> Mostrar buscador</label>
          <label><input type="checkbox" checked={navSettings.navbar_show_cart} onChange={(e) => setNavValue('navbar_show_cart', e.target.checked)} /> Mostrar carrito</label>
        </div>
        <div className="builder-links-heading"><div><h3>Enlaces personalizados</h3><p>Si agregas enlaces, aparecerán antes que las categorías automáticas. Usa rutas como <code>/categoria</code> o URLs externas.</p></div><button className="btn btn-sm" onClick={addNavLink}>+ Agregar enlace</button></div>
        {navSettings.navbar_links.length > 0 && <div className="builder-links-list">
          {navSettings.navbar_links.map((link, index) => <div className="builder-link-row" key={`${index}-${link.label}`}>
            <input className="input" value={link.label} placeholder="Texto del enlace" onChange={(e) => updateNavLink(index, 'label', e.target.value)} />
            <input className="input" value={link.href} placeholder="/categoria/ofertas o https://..." onChange={(e) => updateNavLink(index, 'href', e.target.value)} />
            <label className="builder-featured-toggle"><input type="checkbox" checked={link.featured} onChange={(e) => updateNavLink(index, 'featured', e.target.checked)} /> Destacado</label>
            <button className="btn btn-sm btn-danger" onClick={() => removeNavLink(index)} aria-label={`Eliminar enlace ${link.label || index + 1}`}>×</button>
          </div>)}
        </div>}
      </section>

      {modules.length === 0 ? (
        <Empty title="Sin módulos" description="La home no muestra nada. Crea el primero." action={
          <button className="btn btn-primary" onClick={openNew}>+ Nuevo módulo</button>
        } />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {modules.map((m, idx) => {
            const sch = MODULE_SCHEMAS[m.type];
            const label = sch?.label || m.type;
            const icon = sch?.icon || '📦';
            return (
              <div key={m.id} style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius)',
                padding: 12,
                opacity: m.active ? 1 : 0.55,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <button className="btn btn-sm" onClick={() => move(idx, -1)} disabled={idx === 0} title="Subir">↑</button>
                    <button className="btn btn-sm" onClick={() => move(idx, 1)} disabled={idx === modules.length - 1} title="Bajar">↓</button>
                  </div>
                  <div style={{ fontSize: 22 }}>{icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{label}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                      {sch?.description || `Tipo: ${m.type}`}
                    </div>
                  </div>
                  <span className={`badge ${m.active ? 'active' : 'inactive'}`}>{m.active ? 'Activo' : 'Inactivo'}</span>
                  <div className="table-actions">
                    <button className="btn btn-sm" onClick={() => toggleActive(m)}>
                      {m.active ? 'Desactivar' : 'Activar'}
                    </button>
                    <button className="btn btn-sm" onClick={() => openEdit(m)}>Configurar</button>
                    <button className="btn btn-sm btn-danger" onClick={() => setDeleting(m)}>×</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 16 }}>
        Tip: el store público lee los módulos activos en orden desde <code>/api/public/page-modules</code>.
        Cambios se ven al refrescar el browser (cache de 60s).
      </p>

      <Modal
        open={!!editing}
        onClose={() => !saving && setEditing(null)}
        size="lg"
        title={editing?.mode === 'new' ? 'Nuevo módulo' : `Editar módulo · ${editing?.type}`}
        footer={
          <>
            <button className="btn" onClick={() => setEditing(null)} disabled={saving}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <span className="spinner" /> : 'Guardar'}
            </button>
          </>
        }
      >
        {editing && schema && (
          <form onSubmit={handleSave}>
            <div className="form-row">
              <div className="form-group">
                <label>Tipo de módulo</label>
                <select className="select" value={editing.type} onChange={(e) => onTypeChange(e.target.value)}>
                  {Object.entries(MODULE_SCHEMAS).map(([k, s]) => (
                    <option key={k} value={k}>{s.icon} {s.label}</option>
                  ))}
                </select>
                <div className="help">{schema.description}</div>
              </div>
              <div className="form-group">
                <label>Estado</label>
                <select className="select" value={String(editing.active)}
                        onChange={(e) => setEditing({ ...editing, active: e.target.value === 'true' })}>
                  <option value="true">Activo</option>
                  <option value="false">Inactivo</option>
                </select>
              </div>
            </div>
            <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '12px 0' }} />
            {schema.settings.map((f) => (
              <div className="form-group" key={f.key}>
                <label>{f.label}</label>
                {f.type === 'textarea' ? (
                  <textarea className="textarea"
                            value={editing.settings[f.key] ?? ''}
                            onChange={(e) => setSetting(f.key, e.target.value)} />
                ) : f.type === 'select' ? (
                  <select className="select" value={editing.settings[f.key] ?? f.defaultValue ?? ''} onChange={(e) => setSetting(f.key, e.target.value)}>
                    {(f.options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                ) : f.type === 'product' ? (
                  <select className="select" value={editing.settings[f.key] ?? ''} onChange={(e) => setSetting(f.key, e.target.value)}>
                    <option value="">{f.placeholder || 'Selecciona un producto'}</option>
                    {products.map((product) => <option key={product.id} value={product.slug}>{product.name}{product.brand ? ` · ${product.brand}` : ''}</option>)}
                  </select>
                ) : (
                  <input className="input"
                         type={f.type === 'number' ? 'number' : (f.type === 'url' ? 'url' : 'text')}
                         value={editing.settings[f.key] ?? ''}
                         placeholder={f.placeholder || ''}
                         onChange={(e) => setSetting(f.key, e.target.value)} />
                )}
              </div>
            ))}
          </form>
        )}
      </Modal>

      <Confirm
        open={!!deleting}
        title="¿Eliminar módulo?"
        message="Se va a quitar de la home. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
