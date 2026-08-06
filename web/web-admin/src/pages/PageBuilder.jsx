import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';
import FocalPointPicker from '../components/FocalPointPicker.jsx';
import { useMe } from '../hooks/useMe.js';
import { canWrite } from '../lib/permissions.js';

const MODULE_TYPES = [
  { value: 'header',     label: 'Header (logo + nav)' },
  { value: 'hero',       label: 'Hero (imagen grande + título)' },
  { value: 'carousel',   label: 'Carrusel de productos' },
  { value: 'collections',label: 'Grid de colecciones' },
  { value: 'text',       label: 'Texto libre (markdown)' },
  { value: 'contact',    label: 'Bloque de contacto' },
  { value: 'footer',     label: 'Footer' },
];

function ColorRow({ label, value, onChange }) {
  return (
    <div className="form-row-inline" style={{ gap: 8, alignItems: 'center' }}>
      <label style={{ width: 100 }}>{label}</label>
      <input
        type="color"
        value={value || '#000000'}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 40, height: 32, padding: 2, cursor: 'pointer' }}
      />
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#000000"
        style={{ flex: 1, fontFamily: 'monospace' }}
      />
    </div>
  );
}

// Mini-mockup de cada módulo: en vez de solo texto, dibuja una miniatura de
// cómo se ve el bloque en la tienda, con los colores configurados.
function ModulePreview({ type, config = {} }) {
  const text = config.text_color || '#1a1d21';
  const bg = config.bg_color || '#ffffff';
  const style = { background: bg, color: text };

  switch (type) {
    case 'header': {
      const headerOrder = config.layout || 'logo-nav-wa';
      return (
        <div className={`mp mp-header mp-header--${headerOrder} mp--${config.variant || 'classic'}`} style={style}>
          <span className="mp-logo" style={{ borderColor: text }}>LOGO</span>
          <span className="mp-navlines">
            <i style={{ background: text }} /><i style={{ background: text }} /><i style={{ background: text }} />
          </span>
          {config.show_wa_button !== false && <span className="mp-wa">WhatsApp</span>}
        </div>
      );
    }
    case 'hero':
      return (
        <div className={`mp mp-hero mp--${config.variant || 'classic'}`} style={style}>
          {config.eyebrow && <span className="mp-eyebrow">{config.eyebrow}</span>}
          <span className="mp-hero-title">{config.title || 'Título del hero'}</span>
          <span className="mp-cta" style={{ background: text, color: bg }}>{config.cta_label || 'Botón'}</span>
        </div>
      );
    case 'carousel': {
      const cardCount = Math.max(1, Math.min(6, Number(config.max_items) || 6));
      return (
        <div className={`mp mp-carousel mp--${config.variant || 'classic'}`} style={style}>
          <span className="mp-section-title">{config.title || 'Carrusel de productos'}</span>
          <div className="mp-carousel-frame" style={{ borderColor: '#C9A227' }}>
            <i className="mp-carousel-slide" />
          </div>
          <div className="mp-carousel-controls">
            <span className="mp-carousel-arrow">←</span>
            <span className="mp-carousel-dots">
              <i className="is-active" />
              {Array.from({ length: Math.max(0, cardCount - 1) }, (_, i) => <i key={i} />)}
            </span>
            <span className="mp-carousel-arrow">→</span>
          </div>
          <span className="mp-note">Muestra {cardCount} producto(s) {config.source === 'all' ? 'del catálogo' : 'destacados (★)'}</span>
        </div>
      );
    }
    case 'collections':
      return (
        <div className={`mp mp-collections mp--${config.variant || 'classic'}`} style={style}>
          <span className="mp-section-title">{config.title || 'Nuestras Colecciones'}</span>
          <div className="mp-cols">
            {['Novia', '15 Años', 'Trajes', 'Zapatos'].map((n) => (
              <span key={n} className="mp-col" style={{ borderColor: text }}>{n}</span>
            ))}
          </div>
        </div>
      );
    case 'text':
      return (
        <div className="mp mp-text" style={{ ...style, textAlign: config.align || 'center' }}>
          {config.body
            ? <span className="mp-body">{config.body.slice(0, 120)}{config.body.length > 120 ? '…' : ''}</span>
            : <span className="mp-body mp-muted">(bloque de texto vacío)</span>}
        </div>
      );
    case 'contact':
      return (
        <div className="mp mp-contact" style={style}>
          <div>
            <span className="mp-mini-title">Contacto</span>
            <i className="mp-line" style={{ background: text }} />
            <i className="mp-line short" style={{ background: text }} />
          </div>
          <div>
            <span className="mp-mini-title">Horarios</span>
            <i className="mp-line" style={{ background: text }} />
            <i className="mp-line short" style={{ background: text }} />
          </div>
        </div>
      );
    case 'footer':
      return (
        <div className="mp mp-footer" style={style}>
          <span>© {new Date().getFullYear()} · Nombre de la tienda · redes</span>
        </div>
      );
    default:
      return <div className="mp" style={style}>({type})</div>;
  }
}

function defaultConfig(type) {
  switch (type) {
    case 'header':     return { show_wa_button: true, layout: 'logo-nav-wa', variant: 'classic', text_color: '#1a1d21', bg_color: '#ffffff' };
    case 'hero':       return { image_url: null, eyebrow: '', title: '', cta_label: 'Hablar por WhatsApp', variant: 'classic', text_color: '#ffffff', bg_color: '#1a1d21' };
    case 'carousel':   return { title: 'Piezas Destacadas', source: 'featured', max_items: 6, autoplay_ms: 5500, variant: 'classic', text_color: '#1a1d21', bg_color: '#F5EFE0' };
    case 'collections':return { title: 'Nuestras Colecciones', variant: 'classic', text_color: '#1a1d21', bg_color: '#faf7f2' };
    case 'text':       return { body: '', align: 'center', text_color: '#1a1d21', bg_color: '#ffffff' };
    case 'contact':    return { text_color: '#1a1d21', bg_color: '#faf7f2' };
    case 'footer':     return { text_color: '#ffffff', bg_color: '#1a1d21' };
    default:          return {};
  }
}

export default function PageBuilder() {
  const me = useMe();
  const canEdit = me ? canWrite('modules', me.role) : true;
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null);
  const [configJson, setConfigJson] = useState('');
  const [configErr, setConfigErr] = useState('');
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const uploadTargetRef = useRef(null);

  function triggerUpload(target) {
    uploadTargetRef.current = target;
    fileInputRef.current?.click();
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite re-subir el mismo archivo
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api('/api/admin/media', { method: 'POST', body: fd, json: false });
      if (!r.ok) {
        alert(`Error subiendo imagen: ${r.data?.error || r.status}`);
        return;
      }
      const url = r.data?.url;
      if (url) {
        // El target actual (hero, header, etc.) se setea en updateConfigField.
        // Por simplicidad, si estamos editando el hero, actualizamos image_url
        // y reseteamos image_focal. Para otros tipos se puede extender.
        if (uploadTargetRef.current === 'hero') {
          setEditing((p) => p && ({
            ...p,
            config: { ...(p.config || {}), image_url: url, image_focal: null },
          }));
        }
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }

  async function load() {
    setErr('');
    const r = await api('/api/admin/modules?slot=home');
    if (r.ok) setItems(r.data.data);
    else setErr(r.data?.error || 'Error al cargar');
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing({ slot: 'home', type: 'text', title: '', config: defaultConfig('text'), active: true });
    setConfigJson(JSON.stringify(defaultConfig('text'), null, 2));
    setConfigErr('');
  }
  function openEdit(m) {
    setEditing({ ...m });
    setConfigJson(JSON.stringify(m.config || {}, null, 2));
    setConfigErr('');
  }
  function close() { setEditing(null); }

  function onTypeChange(newType) {
    const baseConfig = defaultConfig(newType);
    setEditing((p) => ({ ...p, type: newType, config: baseConfig }));
    setConfigJson(JSON.stringify(baseConfig, null, 2));
  }

  function onConfigJsonChange(text) {
    setConfigJson(text);
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
        setConfigErr('El JSON debe ser un objeto');
      } else {
        setConfigErr('');
        setEditing((p) => ({ ...p, config: parsed }));
      }
    } catch (e) {
      setConfigErr(`JSON inválido: ${e.message}`);
    }
  }

  function updateConfigField(key, value) {
    setEditing((p) => {
      const next = { ...(p.config || {}), [key]: value };
      setConfigJson(JSON.stringify(next, null, 2));
      setConfigErr('');
      return { ...p, config: next };
    });
  }

  async function save() {
    if (!editing) return;
    if (configErr) {
      alert('Corrige el JSON de la configuración antes de guardar.');
      return;
    }
    setPending(true);
    const isNew = !editing.id;
    const body = {
      slot: editing.slot,
      type: editing.type,
      title: editing.title,
      config: editing.config,
      active: !!editing.active,
    };
    const r = isNew
      ? await api('/api/admin/modules', { method: 'POST', body })
      : await api(`/api/admin/modules/${editing.id}`, { method: 'PATCH', body });
    setPending(false);
    if (r.ok) { close(); load(); }
    else alert(r.data?.details?.join(', ') || r.data?.message || r.data?.error || 'Error');
  }

  async function move(m, dir) {
    const r = await api(`/api/admin/modules/${m.id}/move-${dir}`, { method: 'POST' });
    if (r.ok) load();
  }

  async function remove(m) {
    if (!confirm(`¿Eliminar el módulo "${m.title || m.type}"?`)) return;
    const r = await api(`/api/admin/modules/${m.id}`, { method: 'DELETE' });
    if (r.ok) load();
  }

  async function toggleActive(m) {
    const r = await api(`/api/admin/modules/${m.id}`, { method: 'PATCH', body: { active: !m.active } });
    if (r.ok) load();
  }

  if (items === null) return <div style={{ padding: 40, color: 'var(--gray-500)' }}>Cargando…</div>;

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      {uploading && <div className="placeholder-card" style={{ marginBottom: 16 }}>Subiendo imagen...</div>}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1>Página</h1>
          <p className="sub">Módulos de la home. {items.length} en total.</p>
        </div>
        {canEdit && <button className="btn" onClick={openNew}>+ Nuevo módulo</button>}
      </div>

      {err && <div className="placeholder-card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', marginBottom: 16 }}>{err}</div>}

      <div className="modules-list">
        {items.map((m, idx) => (
          <div key={m.id} className={`module-card ${m.active ? '' : 'inactive'}`}>
            {canEdit && (
              <div className="module-order">
                <button className="row-btn" onClick={() => move(m, 'up')} disabled={idx === 0} aria-label="Subir">↑</button>
                <button className="row-btn" onClick={() => move(m, 'down')} disabled={idx === items.length - 1} aria-label="Bajar" style={{ marginTop: 4 }}>↓</button>
              </div>
            )}
            <div className="module-info">
              <div className="module-header">
                <span className={`badge type-module type-${m.type}`}>{MODULE_TYPES.find(t => t.value === m.type)?.label || m.type}</span>
                <span className="module-title">{m.title || '(sin título)'}</span>
                {!m.active && <span className="badge off">Oculto</span>}
              </div>
              <div className="module-preview">
                <ModulePreview type={m.type} config={m.config} />
              </div>
            </div>
            {canEdit && (
            <div className="module-actions">
              <button className="row-btn" onClick={() => openEdit(m)}>Editar</button>
              <button className="row-btn" onClick={() => toggleActive(m)}>
                {m.active ? 'Ocultar' : 'Mostrar'}
              </button>
              <button className="row-btn danger" onClick={() => remove(m)}>Eliminar</button>
            </div>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <div className="placeholder-card">
            <h2>Sin módulos</h2>
            <p>Agrega el primer módulo para empezar a armar la página de inicio.</p>
          </div>
        )}
      </div>

      <Modal
        open={!!editing}
        onClose={close}
        title={editing?.id ? `Editar módulo: ${editing.title || editing.type}` : 'Nuevo módulo'}
        size="lg"
        footer={
          canEdit ? (
            <>
              <button className="btn secondary" onClick={close} disabled={pending}>Cancelar</button>
              <button className="btn" onClick={save} disabled={pending || !!configErr}>
                {pending ? 'Guardando…' : (editing?.id ? 'Guardar cambios' : 'Crear módulo')}
              </button>
            </>
          ) : (
            <button className="btn secondary" onClick={close}>Cerrar</button>
          )
        }
      >
        {editing && (
          <div className="form">
            <div className="form-row-grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
              <div>
                <label>Tipo</label>
                <select
                  value={editing.type}
                  onChange={(e) => onTypeChange(e.target.value)}
                  disabled={!!editing.id}
                >
                  {MODULE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                {editing.id && <div className="form-hint">No se puede cambiar el tipo de un módulo existente.</div>}
              </div>
              <div>
                <label>Título interno</label>
                <input
                  value={editing.title || ''}
                  onChange={(e) => setEditing((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Ej: Hero principal"
                />
                <div className="form-hint">Solo para identificarlo en el panel.</div>
              </div>
            </div>

            <div className="form-row">
              <label>Colores</label>
              <ColorRow label="Texto" value={editing.config?.text_color} onChange={(v) => updateConfigField('text_color', v)} />
              <div style={{ height: 6 }} />
              <ColorRow label="Fondo" value={editing.config?.bg_color} onChange={(v) => updateConfigField('bg_color', v)} />
            </div>

            {/* Campos específicos por tipo (los más comunes) */}
            {(editing.type === 'hero' || editing.type === 'carousel' || editing.type === 'collections') && (
              <div className="form-row">
                <label>Título del módulo</label>
                <input
                  value={editing.config?.title || ''}
                  onChange={(e) => updateConfigField('title', e.target.value)}
                />
              </div>
            )}

            {['header', 'hero', 'carousel', 'collections'].includes(editing.type) && (
              <div className="form-row">
                <label>Estilo visual</label>
                <select value={editing.config?.variant || 'classic'} onChange={(e) => updateConfigField('variant', e.target.value)}>
                  <option value="classic">Clásico — Mockup original</option>
                  <option value="editorial">Editorial — Mockup 2</option>
                </select>
                <div className="form-hint">La vista previa se actualiza según la opción elegida.</div>
              </div>
            )}

            {editing.type === 'hero' && (
              <>
                <div className="form-row">
                  <label>Eyebrow (texto pequeño arriba del título)</label>
                  <input
                    value={editing.config?.eyebrow || ''}
                    onChange={(e) => updateConfigField('eyebrow', e.target.value)}
                  />
                </div>
                <div className="form-row">
                  <label>CTA label</label>
                  <input
                    value={editing.config?.cta_label || ''}
                    onChange={(e) => updateConfigField('cta_label', e.target.value)}
                  />
                </div>
                <div className="form-row">
                  <label>Imagen del hero</label>
                  {editing.config?.image_url ? (
                    <div className="hero-image-editor">
                      <FocalPointPicker
                        src={editing.config.image_url}
                        focal={editing.config.image_focal || null}
                        onChange={(f) => updateConfigField('image_focal', f)}
                      />
                      <div className="form-row-inline" style={{ marginTop: 8 }}>
                        <button type="button" className="btn" onClick={() => triggerUpload('hero')}>
                          Reemplazar imagen
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={() => {
                          updateConfigField('image_url', null);
                          updateConfigField('image_focal', null);
                        }}>
                          Quitar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <button type="button" className="btn" onClick={() => triggerUpload('hero')}>
                        Subir imagen
                      </button>
                      <div className="form-hint">JPG, PNG, WebP o AVIF. Máximo 20MB.</div>
                    </div>
                  )}
                </div>
              </>
            )}

            {editing.type === 'carousel' && (
              <>
                <div className="form-row-grid">
                  <div>
                    <label>Source</label>
                    <select
                      value={editing.config?.source || 'featured'}
                      onChange={(e) => updateConfigField('source', e.target.value)}
                    >
                      <option value="featured">Destacados (featured=true)</option>
                      <option value="all">Todos los productos activos</option>
                    </select>
                  </div>
                  <div>
                    <label>Máx items</label>
                    <input
                      type="number" min="1" max="50"
                      value={editing.config?.max_items ?? 6}
                      onChange={(e) => updateConfigField('max_items', Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label>Tiempo entre slides (ms)</label>
                    <input
                      type="number" min="0" step="100"
                      value={editing.config?.autoplay_ms ?? 5500}
                      onChange={(e) => updateConfigField('autoplay_ms', Math.max(0, Number(e.target.value) || 0))}
                    />
                    <div className="form-hint">0 = manual. Ejemplo: 1000 = 1 segundo.</div>
                  </div>
                </div>
              </>
            )}

            {editing.type === 'text' && (
              <>
                <div className="form-row">
                  <label>Contenido (markdown básico)</label>
                  <textarea
                    rows={5}
                    value={editing.config?.body || ''}
                    onChange={(e) => updateConfigField('body', e.target.value)}
                    placeholder="Texto del módulo..."
                  />
                </div>
                <div className="form-row">
                  <label>Alineación</label>
                  <select
                    value={editing.config?.align || 'center'}
                    onChange={(e) => updateConfigField('align', e.target.value)}
                  >
                    <option value="left">Izquierda</option>
                    <option value="center">Centro</option>
                    <option value="right">Derecha</option>
                  </select>
                </div>
              </>
            )}

            {editing.type === 'header' && (
              <div className="form-row-grid">
                <div>
                  <label>Orden del header</label>
                  <select value={editing.config?.layout || 'logo-nav-wa'} onChange={(e) => updateConfigField('layout', e.target.value)}>
                    <option value="logo-nav-wa">Logo · Opciones · WhatsApp</option>
                    <option value="logo-wa-nav">Logo · WhatsApp · Opciones</option>
                    <option value="nav-logo-wa">Opciones · Logo · WhatsApp</option>
                    <option value="nav-wa-logo">Opciones · WhatsApp · Logo</option>
                    <option value="wa-logo-nav">WhatsApp · Logo · Opciones</option>
                    <option value="wa-nav-logo">WhatsApp · Opciones · Logo</option>
                  </select>
                  <div className="form-hint">El carrito queda integrado junto a las opciones de navegación.</div>
                </div>
                <label style={{ alignSelf: 'center' }}>
                  <input type="checkbox" checked={!!editing.config?.show_wa_button} onChange={(e) => updateConfigField('show_wa_button', e.target.checked)} style={{ width: 'auto', marginRight: 6 }} />
                  Mostrar botón de WhatsApp
                </label>
              </div>
            )}

            <div className="form-row">
              <label>Configuración completa (JSON)</label>
              <textarea
                rows={6}
                value={configJson}
                onChange={(e) => onConfigJsonChange(e.target.value)}
                style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
              />
              {configErr && <div className="form-hint" style={{ color: 'var(--danger)' }}>{configErr}</div>}
              <div className="form-hint">Edita los campos de arriba o el JSON directamente. Se sincronizan.</div>
            </div>

            <div className="form-row-inline">
              <label>
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(e) => setEditing((p) => ({ ...p, active: e.target.checked }))}
                  style={{ width: 'auto', marginRight: 6 }}
                />
                Activo
              </label>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
