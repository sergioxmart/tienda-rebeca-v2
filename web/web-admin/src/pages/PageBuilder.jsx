// Web Builder: gestión del borrador de page_modules (los bloques que se
// renderizan en la home del store al publicar).
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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import Modal from '../components/Modal.jsx';
import Confirm from '../components/Confirm.jsx';
import Empty from '../components/Empty.jsx';
import { STORE_THEME_DEFAULTS, STORE_THEME_FIELDS, STORE_SPACING_FIELDS, normalizeStoreTheme } from '../storeTheme.js';
import { getStorePreviewUrl } from '../previewUrl.js';

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
      { key: 'image_url',label: 'Imagen de fondo', type: 'media', mediaPlacementKey: 'image_placement', placeholder: 'Opcional: pega una URL o elige una imagen de Media' },
      { key: 'visual_mode', label: 'Visual del lado derecho', type: 'select', defaultValue: 'abstract', options: [
        { value: 'none', label: 'Ninguno' },
        { value: 'abstract', label: 'Abstracto Rebeca Andrade' },
        { value: 'product', label: 'Producto real del catálogo' },
        { value: 'image', label: 'Imagen personalizada' },
      ] },
      { key: 'product_slug', label: 'Producto destacado', type: 'product', placeholder: 'Selecciona un producto' },
      { key: 'visual_image_url', label: 'Imagen personalizada', type: 'media', mediaPlacementKey: 'visual_placement', placeholder: 'Se usa cuando eliges Imagen personalizada' },
      { key: 'cta_text', label: 'Texto del botón',type: 'text',  placeholder: 'Ver catálogo' },
      { key: 'cta_link', label: 'Link del botón', type: 'text',  placeholder: '/categoria/accesorios-telefono' },
      { key: 'secondary_cta_text', label: 'Texto del segundo enlace', type: 'text', defaultValue: 'Explorar catálogo' },
      { key: 'secondary_cta_link', label: 'Link del segundo enlace', type: 'text', defaultValue: '/categoria' },
      { key: 'custom_code_enabled', label: 'Código Personalizado', type: 'checkbox', defaultValue: false },
      { key: 'custom_code', label: 'HTML/CSS personalizado', type: 'custom_code', placeholder: 'Pega aquí la estructura HTML y CSS de tu Hero.' },
    ],
  },
  banner: {
    label: 'Banner',
    description: 'Imagen clickeable horizontal.',
    icon: '🖼️',
    settings: [
      { key: 'image_url', label: 'Imagen', type: 'media', mediaPlacementKey: 'image_placement', placeholder: 'Pega una URL o elige una imagen de Media' },
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
  carousel: {
    label: 'Carrusel de productos',
    description: 'Presentación editorial de productos destacados con navegación y autoplay.',
    icon: '◈',
    settings: [
      { key: 'title', label: 'Título de la sección', type: 'text', defaultValue: 'Piezas destacadas' },
      { key: 'source', label: 'Fuente', type: 'select', defaultValue: 'featured', options: [{ value: 'featured', label: 'Productos destacados' }, { value: 'all', label: 'Catálogo completo' }] },
      { key: 'limit', label: 'Cantidad máxima', type: 'number', defaultValue: 6 },
      { key: 'autoplay_ms', label: 'Autoplay (milisegundos)', type: 'number', defaultValue: 5500 },
      { key: 'variant', label: 'Variante', type: 'select', defaultValue: 'classic', options: [{ value: 'classic', label: 'Clásica' }, { value: 'editorial', label: 'Editorial' }] },
    ],
  },
  collections: {
    label: 'Colecciones',
    description: 'Grid visual con las categorías de la tienda.',
    icon: '▦',
    settings: [
      { key: 'title', label: 'Título de la sección', type: 'text', defaultValue: 'Explora nuestras categorías' },
      { key: 'variant', label: 'Variante', type: 'select', defaultValue: 'classic', options: [{ value: 'classic', label: 'Clásica' }, { value: 'editorial', label: 'Editorial' }] },
    ],
  },
  text: {
    label: 'Texto editorial',
    description: 'Bloque de texto para manifiestos, promociones o información de marca.',
    icon: '¶',
    settings: [
      { key: 'body', label: 'Contenido', type: 'textarea', placeholder: 'Escribe el contenido de la sección.' },
      { key: 'align', label: 'Alineación', type: 'select', defaultValue: 'center', options: [{ value: 'left', label: 'Izquierda' }, { value: 'center', label: 'Centro' }, { value: 'right', label: 'Derecha' }] },
    ],
  },
  contact: {
    label: 'Contacto',
    description: 'Bloque editorial con datos de contacto, horarios y redes sociales.',
    icon: '✦',
    settings: [],
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
  footer: {
    label: 'Footer',
    description: 'Pie de página global con información de contacto y categorías.',
    icon: '🧾',
    settings: [
      { key: 'title', label: 'Título del Footer', type: 'text', placeholder: 'Usa el nombre de la tienda si queda vacío' },
      { key: 'description', label: 'Descripción', type: 'textarea', placeholder: 'Mensaje breve de la tienda' },
      { key: 'show_categories', label: 'Mostrar categorías', type: 'checkbox', defaultValue: true },
      { key: 'show_contact', label: 'Mostrar contacto', type: 'checkbox', defaultValue: true },
    ],
  },
};

const CUSTOM_CODE_TEMPLATES = {
  navbar: `<!-- Navbar personalizado de TechStore -->
<style>
  .techstore-custom-navbar { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 18px 6%; color: #fff; background: #0f2a47; }
  .techstore-custom-navbar nav { display: flex; gap: 18px; flex-wrap: wrap; }
  .techstore-custom-navbar a { color: #fff; font-weight: 700; text-decoration: none; }
</style>
<header class="techstore-custom-navbar">
  <strong>Nombre de tu tienda</strong>
  <nav aria-label="Navegación personalizada">
    <a href="/">Inicio</a>
    <a href="/categoria">Tienda</a>
    <a href="/carrito">Carrito</a>
  </nav>
</header>`,
  hero: `<!-- Hero personalizado de TechStore -->
<style>
  .techstore-custom-hero {
    padding: 64px 8%;
    border-radius: 24px;
    color: #fff;
    background: linear-gradient(135deg, #081d34, #174e70);
  }
  .techstore-custom-hero h1 { margin: 0 0 12px; font-size: clamp(36px, 6vw, 72px); }
  .techstore-custom-hero p { max-width: 560px; line-height: 1.6; }
</style>

<section class="techstore-custom-hero">
  <span>Tu etiqueta superior</span>
  <h1>Tu título personalizado</h1>
  <p>Escribe aquí el mensaje principal de tu Hero.</p>
  <a href="/categoria" class="btn btn-accent">Ver catálogo</a>
</section>`,
  banner: `<!-- Banner personalizado de TechStore -->
<style>
  .techstore-custom-banner { display: block; overflow: hidden; border-radius: 24px; background: #eef3f7; }
  .techstore-custom-banner img { display: block; width: 100%; height: auto; }
</style>
<a class="techstore-custom-banner" href="/categoria">
  <img src="/media/tu-banner.jpg" alt="Describe aquí tu banner" />
</a>`,
  categories: `<!-- Chips de categorías personalizados de TechStore -->
<style>
  .techstore-custom-categories { display: flex; flex-wrap: wrap; gap: 10px; padding: 20px 0; }
  .techstore-custom-categories a { padding: 10px 16px; border-radius: 999px; color: #0f2a47; background: #eef3f7; font-weight: 700; text-decoration: none; }
</style>
<section class="techstore-custom-categories" aria-label="Categorías">
  <a href="/categoria">Categoría principal</a>
  <a href="/categoria/ofertas">Ofertas</a>
</section>`,
  categories_grid: `<!-- Grid de categorías personalizado de TechStore -->
<style>
  .techstore-custom-categories-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; }
  .techstore-custom-categories-grid a { padding: 28px 20px; border-radius: 20px; color: #0f2a47; background: #fff; box-shadow: 0 8px 24px rgba(15,42,71,.08); font-weight: 800; text-decoration: none; }
</style>
<section class="techstore-custom-categories-grid" aria-label="Categorías">
  <a href="/categoria">Categoría principal</a>
  <a href="/categoria/ofertas">Ofertas</a>
</section>`,
  featured_products: `<!-- Productos destacados personalizados de TechStore -->
<section class="techstore-custom-products">
  <h2>Productos destacados</h2>
  <p>Este bloque es tu punto de partida para diseñar una sección personalizada.</p>
</section>`,
  recent_products: `<!-- Productos recientes personalizados de TechStore -->
<section class="techstore-custom-products">
  <h2>Lo más nuevo</h2>
  <p>Este bloque es tu punto de partida para diseñar una sección personalizada.</p>
</section>`,
  footer: `<!-- Footer personalizado de TechStore -->
<style>
  .techstore-custom-footer { padding: 40px 6%; color: #fff; background: #0c2036; }
  .techstore-custom-footer a { color: #fff; }
</style>
<footer class="techstore-custom-footer">
  <strong>Nombre de tu tienda</strong>
  <p>Escribe aquí tu información de contacto.</p>
  <a href="/categoria">Ir a la tienda</a>
</footer>`,
};

const CUSTOM_CODE_SETTINGS = [
  { key: 'custom_code_enabled', label: 'Código Personalizado', type: 'checkbox', defaultValue: false },
  { key: 'custom_code', label: 'HTML/CSS personalizado', type: 'custom_code', placeholder: 'Pega aquí el HTML y CSS de este módulo.' },
];

for (const schema of Object.values(MODULE_SCHEMAS)) {
  const existingKeys = new Set(schema.settings.map((field) => field.key));
  schema.settings.push(
    ...CUSTOM_CODE_SETTINGS
      .filter((field) => !existingKeys.has(field.key))
      .map((field) => ({ ...field })),
  );
}

function downloadModuleTemplate(type) {
  const template = CUSTOM_CODE_TEMPLATES[type] || CUSTOM_CODE_TEMPLATES.hero;
  const blob = new Blob([template], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `techstore-${type}-personalizado.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

const EMPTY_NEW = { type: 'hero', settings: {}, active: true };
const NAV_DEFAULTS = {
  navbar_enabled: true,
  navbar_announcement: 'Envíos a toda Colombia · Compra fácil y segura',
  navbar_show_announcement: true,
  navbar_show_search: true,
  navbar_show_cart: true,
  navbar_show_categories: true,
  navbar_links: [],
  navbar_logo_mode: 'image',
  navbar_logo_text: 'Rebeca Andrade',
  navbar_logo_font: 'display',
  navbar_mobile_logo_alignment: 'left',
  navbar_custom_code_enabled: false,
  navbar_custom_code: '',
};

function normalizeNavLinks(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((link) => link && typeof link === 'object')
    .map((link) => ({ label: String(link.label || ''), href: String(link.href || ''), featured: Boolean(link.featured) }))
    .filter((link) => link.label || link.href);
}

function GlobalColorField({ field, value, onChange }) {
  return (
    <div className="builder-global-color-field">
      <div className="builder-global-color-copy">
        <label htmlFor={`builder-${field.key}`}>{field.label}</label>
        <span>{field.description}</span>
      </div>
      <div className="builder-global-color-control">
        <input
          id={`builder-${field.key}`}
          className="builder-global-color-picker"
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          aria-label={`Elegir ${field.label.toLowerCase()}`}
        />
        <code>{value}</code>
      </div>
    </div>
  );
}

function GlobalSpacingField({ field, value, onChange }) {
  const numericValue = Number(value);
  const safeValue = Number.isFinite(numericValue) ? numericValue : field.min;
  return (
    <div className="builder-global-spacing-field">
      <div className="builder-global-color-copy">
        <label htmlFor={`builder-${field.key}`}>{field.label}</label>
        <span>{field.description}</span>
      </div>
      <div className="builder-global-spacing-control">
        <input
          id={`builder-${field.key}`}
          type="range"
          min={field.min}
          max={field.max}
          step={field.step}
          value={safeValue}
          onChange={(event) => onChange(field.key, Number(event.target.value))}
          aria-label={field.label}
        />
        <label className="builder-global-spacing-number">
          <input
            className="input"
            type="number"
            min={field.min}
            max={field.max}
            step={field.step}
            value={safeValue}
            onChange={(event) => onChange(field.key, Number(event.target.value))}
            aria-label={`${field.label} en ${field.unit}`}
          />
          <span>{field.unit}</span>
        </label>
      </div>
    </div>
  );
}

function GlobalStoreStyles({ values, onChange }) {
  const paletteFields = STORE_THEME_FIELDS.slice(0, 4);
  const typographyFields = STORE_THEME_FIELDS.slice(4);
  return (
    <div className="builder-global-styles">
      <div className="builder-global-styles-intro">
        <span className="builder-kicker">Sistema de diseño de 5173</span>
        <p>Personaliza la apariencia general de la tienda. Estos cambios se guardan en el borrador y se publican junto con el resto del Builder.</p>
      </div>
      <section className="builder-global-style-section">
        <div className="builder-global-style-heading"><h3>Paleta de colores</h3><span>Fondos, botones y elementos destacados</span></div>
        <div className="builder-global-color-grid">
          {paletteFields.map((field) => <GlobalColorField key={field.key} field={field} value={values[field.key]} onChange={(value) => onChange(field.key, value)} />)}
        </div>
      </section>
      <section className="builder-global-style-section">
        <div className="builder-global-style-heading"><h3>Tipografía</h3><span>Colores independientes para cada nivel de contenido</span></div>
        <div className="builder-global-color-grid">
          {typographyFields.map((field) => <GlobalColorField key={field.key} field={field} value={values[field.key]} onChange={(value) => onChange(field.key, value)} />)}
        </div>
      </section>
      <section className="builder-global-style-section">
        <div className="builder-global-style-heading"><h3>Espaciado lateral</h3><span>Independiente para escritorio y móvil; no modifica el Hero full-width.</span></div>
        <div className="builder-global-spacing-grid">
          {STORE_SPACING_FIELDS.map((field) => <GlobalSpacingField key={field.key} field={field} value={values[field.key]} onChange={(key, value) => onChange(key, value)} />)}
        </div>
      </section>
      <div className="builder-global-styles-preview" aria-hidden="true">
        <span style={{ background: values.store_accent_color }} />
        <span style={{ background: values.store_primary_color }} />
        <span style={{ background: values.store_surface_color }} />
        <span style={{ background: values.store_background_color }} />
        <strong style={{ color: values.store_heading_color }}>Aa</strong>
        <strong style={{ color: values.store_product_name_color }}>Producto</strong>
        <strong style={{ color: values.store_price_color }}>$ 99.000</strong>
        <small style={{ color: values.store_body_text_color }}>Texto base</small>
      </div>
    </div>
  );
}

function normalizeModules(value) {
  if (!Array.isArray(value)) return [];
  return value.map((module, index) => ({
    ...module,
    id: module.id ?? `draft-${module.type || 'module'}-${index}`,
    settings: module.settings && typeof module.settings === 'object' ? module.settings : {},
    active: module.active !== false,
  }));
}

function defaultSettingsForType(type) {
  const schema = MODULE_SCHEMAS[type];
  if (!schema) return {};
  const out = {};
  for (const f of schema.settings) {
    if (f.defaultValue !== undefined) out[f.key] = f.defaultValue;
    else if (f.type === 'number') out[f.key] = 0;
    else if (f.type === 'checkbox') out[f.key] = false;
    else out[f.key] = '';
  }
  return out;
}

function LiveStorePreview({ modules, navSettings, globalStyles, title = 'Vista previa real de la tienda' }) {
  const frameRef = useRef(null);
  const [previewMode, setPreviewMode] = useState('desktop');
  const payload = useMemo(() => ({
    modules: modules || [],
    site_config_subset: { ...(navSettings || {}), ...(globalStyles || {}) },
  }), [modules, navSettings, globalStyles]);
  const payloadKey = useMemo(() => JSON.stringify(payload), [payload]);

  const sendDraft = () => {
    frameRef.current?.contentWindow?.postMessage({ type: 'techstore-builder-preview', draft: payload }, '*');
  };

  useEffect(() => {
    const handleReady = (event) => {
      if (event.source === frameRef.current?.contentWindow && event.data?.type === 'techstore-builder-preview-ready') sendDraft();
    };
    window.addEventListener('message', handleReady);
    sendDraft();
    return () => window.removeEventListener('message', handleReady);
  }, [payload]);

  return (
    <div className="builder-real-preview">
      <div className="builder-real-preview-heading">
        <div className="builder-real-preview-copy"><strong>{title}</strong><span>Renderiza la misma tienda y los mismos datos del catálogo.</span></div>
        <div className="builder-preview-switch" role="tablist" aria-label="Tamaño de la vista previa">
          <button className={previewMode === 'desktop' ? 'is-active' : ''} type="button" role="tab" aria-selected={previewMode === 'desktop'} onClick={() => setPreviewMode('desktop')}>Escritorio</button>
          <button className={previewMode === 'mobile' ? 'is-active' : ''} type="button" role="tab" aria-selected={previewMode === 'mobile'} onClick={() => setPreviewMode('mobile')}>Móvil</button>
        </div>
      </div>
      <div className={`builder-real-preview-viewport is-${previewMode}`}>
        <div className="builder-real-preview-device">
          <span className="builder-real-preview-device-label">{previewMode === 'mobile' ? 'Móvil · 390 × 844' : 'Escritorio · adaptable'}</span>
          <iframe key={payloadKey} className={`builder-real-preview-frame is-${previewMode}`} ref={frameRef} title={title} src={getStorePreviewUrl()} onLoad={sendDraft} />
        </div>
      </div>
    </div>
  );
}

function BuilderModuleRow({ icon, label, description, active, onMoveUp, onMoveDown, onToggle, onConfigure, onDelete, disableUp, disableDown, disableDelete, details }) {
  return (
    <div className={`builder-module-row ${active ? '' : 'is-inactive'}`}>
      <div className="builder-module-row-main">
        <div className="builder-module-order">
          <button className="btn btn-sm" type="button" onClick={onMoveUp} disabled={disableUp} title="Subir">↑</button>
          <button className="btn btn-sm" type="button" onClick={onMoveDown} disabled={disableDown} title="Bajar">↓</button>
        </div>
        <div className="builder-module-icon" aria-hidden="true">{icon}</div>
        <div className="builder-module-copy"><strong>{label}</strong><span>{description}</span></div>
        <span className={`badge ${active ? 'active' : 'inactive'}`}>{active ? 'Activo' : 'Inactivo'}</span>
        <div className="table-actions builder-module-actions">
          <button className="btn btn-sm" type="button" onClick={onToggle}>{active ? 'Desactivar' : 'Activar'}</button>
          <button className="btn btn-sm" type="button" onClick={onConfigure}>Configurar</button>
          <button className="btn btn-sm btn-danger" type="button" onClick={onDelete} disabled={disableDelete} title={disableDelete ? 'El Navbar es parte estructural de la tienda' : 'Eliminar'}>×</button>
        </div>
      </div>
      {details}
    </div>
  );
}

function CustomCodeEditor({ value, onChange, moduleType, moduleLabel, idPrefix = 'builder-custom-code' }) {
  return <div className="form-group builder-custom-code-editor">
    <label htmlFor={idPrefix}>{`HTML/CSS personalizado de ${moduleLabel || MODULE_SCHEMAS[moduleType]?.label || 'este módulo'}`}</label>
    <textarea id={idPrefix} className="textarea" rows={16}
              value={value || ''}
              placeholder="Pega aquí HTML y CSS. Las etiquetas script no se ejecutan."
              onChange={(e) => onChange(e.target.value)} />
    <div className="builder-custom-code-help">
      <span>El código personalizado reemplaza la configuración estándar de este módulo.</span>
      <button className="btn btn-sm" type="button" onClick={() => downloadModuleTemplate(moduleType)}>Descargar plantilla</button>
    </div>
  </div>;
}

const DEFAULT_MEDIA_PLACEMENT = {
  desktop: { x: 50, y: 50, zoom: 100 },
  mobile: { x: 50, y: 50, zoom: 100 },
};

function clampMediaValue(value, min, max, fallback) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.min(max, Math.max(min, numericValue)) : fallback;
}

function normalizeMediaPlacement(value) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(Object.entries(DEFAULT_MEDIA_PLACEMENT).map(([viewport, defaults]) => {
    const current = source[viewport] && typeof source[viewport] === 'object' ? source[viewport] : {};
    return [viewport, {
      x: clampMediaValue(current.x, 0, 100, defaults.x),
      y: clampMediaValue(current.y, 0, 100, defaults.y),
      zoom: clampMediaValue(current.zoom, 100, 220, defaults.zoom),
    }];
  }));
}

function MediaPickerModal({ open, onClose, items, loading, value, onSelect }) {
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open) setSearch('');
  }, [open]);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredItems = items.filter((item) => {
    if (item.kind && item.kind !== 'image') return false;
    if (!normalizedSearch) return true;
    return [item.alt_text, item.url, item.id]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(normalizedSearch));
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Elegir imagen de Media"
      footer={<button className="btn" type="button" onClick={onClose}>Cerrar</button>}
    >
      <div className="builder-media-picker">
        <div className="builder-media-picker-toolbar">
          <input
            className="input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre o URL"
            aria-label="Buscar imagen en Media"
          />
          <span>{filteredItems.length} imagen{filteredItems.length === 1 ? '' : 'es'}</span>
        </div>
        {loading ? (
          <div className="builder-media-picker-empty"><span className="spinner" /> Cargando biblioteca…</div>
        ) : filteredItems.length === 0 ? (
          <div className="builder-media-picker-empty">No hay imágenes que coincidan con la búsqueda.</div>
        ) : (
          <div className="builder-media-picker-grid">
            {filteredItems.map((item) => {
              const selected = item.url === value;
              return (
                <button
                  className={`builder-media-picker-item${selected ? ' is-selected' : ''}`}
                  type="button"
                  key={item.id || item.url}
                  onClick={() => onSelect(item.url)}
                  title={item.alt_text || `Imagen #${item.id}`}
                >
                  <span className="builder-media-picker-thumb">
                    <img src={item.url} alt={item.alt_text || ''} loading="lazy" />
                    {selected && <span className="builder-media-picker-check" aria-label="Imagen seleccionada">✓</span>}
                  </span>
                  <strong>{item.alt_text || `Imagen #${item.id}`}</strong>
                  <small>{item.url}</small>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

function MediaField({ field, value, placement, onChange, onPlacementChange, onOpenPicker }) {
  const [placementOpen, setPlacementOpen] = useState(false);
  const [viewport, setViewport] = useState('desktop');
  const normalizedPlacement = normalizeMediaPlacement(placement);
  const currentPlacement = normalizedPlacement[viewport];

  const updatePlacement = (key, nextValue) => {
    onPlacementChange({
      ...normalizedPlacement,
      [viewport]: { ...currentPlacement, [key]: Number(nextValue) },
    });
  };

  return (
    <>
      <div className="builder-media-url-row">
        <input
          className="input"
          type="text"
          value={value || ''}
          placeholder={field.placeholder || 'Pega una URL de imagen'}
          onChange={(event) => onChange(event.target.value)}
        />
        <button className="btn" type="button" onClick={onOpenPicker}>Elegir de Media</button>
      </div>
      {value ? (
        <>
        <div className="builder-media-selected">
          <img src={value} alt="Vista previa de la imagen seleccionada" />
          <div>
            <strong>Imagen seleccionada</strong>
            <span>{value}</span>
          </div>
          <div className="builder-media-selected-actions">
            <button
              className={`btn btn-sm builder-media-settings-button${placementOpen ? ' is-active' : ''}`}
              type="button"
              onClick={() => setPlacementOpen((open) => !open)}
              aria-label="Ajustar encuadre de imagen"
              aria-expanded={placementOpen}
              title="Ajustar encuadre"
            >⚙</button>
            <button className="btn btn-sm" type="button" onClick={() => onChange('')}>Quitar</button>
          </div>
        </div>
        {placementOpen && <div className="builder-media-placement">
          <div className="builder-media-placement-heading">
            <div><strong>Ajustar encuadre</strong><span>Configura la posición y el zoom para cada pantalla.</span></div>
            <div className="builder-media-placement-tabs" role="tablist" aria-label="Tamaño de pantalla">
              <button className={viewport === 'desktop' ? 'is-active' : ''} type="button" onClick={() => setViewport('desktop')} role="tab" aria-selected={viewport === 'desktop'}>Escritorio</button>
              <button className={viewport === 'mobile' ? 'is-active' : ''} type="button" onClick={() => setViewport('mobile')} role="tab" aria-selected={viewport === 'mobile'}>Móvil</button>
            </div>
          </div>
          <div className={`builder-media-crop-preview is-${viewport}`}>
            <img
              src={value}
              alt="Vista previa del encuadre"
              style={{
                objectPosition: `${currentPlacement.x}% ${currentPlacement.y}%`,
                transform: `scale(${currentPlacement.zoom / 100})`,
                transformOrigin: `${currentPlacement.x}% ${currentPlacement.y}%`,
              }}
            />
          </div>
          <div className="builder-media-placement-controls">
            {[
              ['x', 'Posición horizontal'],
              ['y', 'Posición vertical'],
              ['zoom', 'Zoom'],
            ].map(([key, label]) => {
              const min = key === 'zoom' ? 100 : 0;
              const max = key === 'zoom' ? 220 : 100;
              return <label key={key}>
                <span>{label}<strong>{currentPlacement[key]}%</strong></span>
                <input type="range" min={min} max={max} step="1" value={currentPlacement[key]} onChange={(event) => updatePlacement(key, event.target.value)} aria-label={`${label} para ${viewport}`} />
              </label>;
            })}
          </div>
        </div>}
        </>
      ) : (
        <div className="help">Puedes pegar una URL externa o seleccionar un archivo existente desde Media.</div>
      )}
    </>
  );
}

function NavbarSettings({ navSettings, setNavValue, updateNavLink, addNavLink, removeNavLink }) {
  const customCodeEnabled = Boolean(navSettings.navbar_custom_code_enabled);
  return (
    <div className="builder-navbar-settings">
      <div className="builder-navbar-settings-heading">
        <div><span className="builder-kicker">Configuración del módulo</span><h3>Nav Bar de la tienda</h3><p>Estos cambios se guardan en el borrador y solo llegan a 5173 al publicar.</p></div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Tipo de logo</label>
          <select className="select" value={navSettings.navbar_logo_mode} onChange={(e) => setNavValue('navbar_logo_mode', e.target.value)}>
            <option value="image">Usar logo cargado</option>
            <option value="text">Usar texto de marca</option>
          </select>
        </div>
        {navSettings.navbar_logo_mode === 'text' && (
          <div className="form-group">
            <label>Texto del logo</label>
            <input className="input" value={navSettings.navbar_logo_text} onChange={(e) => setNavValue('navbar_logo_text', e.target.value)} placeholder="Rebeca Andrade" />
          </div>
        )}
      </div>
      {navSettings.navbar_logo_mode === 'text' && (
        <div className="form-group">
          <label>Fuente del texto</label>
          <select className="select" value={navSettings.navbar_logo_font} onChange={(e) => setNavValue('navbar_logo_font', e.target.value)}>
            <option value="display">Editorial · fuente de la tienda</option>
            <option value="serif">Clásica · serif</option>
            <option value="sans">Limpia · sans serif</option>
            <option value="script">Manuscrita · cursiva</option>
          </select>
        </div>
      )}
      <div className="form-group">
        <label>Ubicación del logo en móvil</label>
        <select className="select" value={navSettings.navbar_mobile_logo_alignment} onChange={(e) => setNavValue('navbar_mobile_logo_alignment', e.target.value)}>
          <option value="left">A la izquierda</option>
          <option value="center">Centrado</option>
        </select>
      </div>
      <label className="builder-checkbox-field builder-navbar-custom-toggle">
        <input type="checkbox" checked={customCodeEnabled} onChange={(e) => setNavValue('navbar_custom_code_enabled', e.target.checked)} />
        <span>Código Personalizado</span>
      </label>
      {customCodeEnabled ? <CustomCodeEditor
        value={navSettings.navbar_custom_code}
        onChange={(value) => setNavValue('navbar_custom_code', value)}
        moduleType="navbar"
        moduleLabel="Nav Bar"
        idPrefix="builder-navbar-custom-code"
      /> : <>
      <div className="form-row">
        <div className="form-group"><label>Mensaje superior</label><input className="input" value={navSettings.navbar_announcement} onChange={(e) => setNavValue('navbar_announcement', e.target.value)} placeholder="Envíos a toda Colombia · Compra fácil y segura" /></div>
        <div className="form-group"><label>Mostrar categorías automáticas</label><select className="select" value={String(navSettings.navbar_show_categories)} onChange={(e) => setNavValue('navbar_show_categories', e.target.value === 'true')}><option value="true">Sí, usar categorías del catálogo</option><option value="false">No</option></select></div>
      </div>
      <div className="builder-toggle-row">
        <label><input type="checkbox" checked={navSettings.navbar_enabled !== false} onChange={(e) => setNavValue('navbar_enabled', e.target.checked)} /> Navbar activo</label>
        <label><input type="checkbox" checked={navSettings.navbar_show_announcement} onChange={(e) => setNavValue('navbar_show_announcement', e.target.checked)} /> Mostrar mensaje superior</label>
        <label><input type="checkbox" checked={navSettings.navbar_show_search} onChange={(e) => setNavValue('navbar_show_search', e.target.checked)} /> Mostrar buscador</label>
        <label><input type="checkbox" checked={navSettings.navbar_show_cart} onChange={(e) => setNavValue('navbar_show_cart', e.target.checked)} /> Mostrar carrito</label>
      </div>
      <div className="builder-links-heading"><div><h3>Enlaces personalizados</h3><p>Usa rutas como <code>/categoria</code> o URLs externas.</p></div><button className="btn btn-sm" type="button" onClick={addNavLink}>+ Agregar enlace</button></div>
      {navSettings.navbar_links.length > 0 && <div className="builder-links-list">
        {navSettings.navbar_links.map((link, index) => <div className="builder-link-row" key={`${index}-${link.label}`}>
          <input className="input" value={link.label} placeholder="Texto del enlace" onChange={(e) => updateNavLink(index, 'label', e.target.value)} />
          <input className="input" value={link.href} placeholder="/categoria/ofertas o https://..." onChange={(e) => updateNavLink(index, 'href', e.target.value)} />
          <label className="builder-featured-toggle"><input type="checkbox" checked={link.featured} onChange={(e) => updateNavLink(index, 'featured', e.target.checked)} /> Destacado</label>
          <button className="btn btn-sm btn-danger" type="button" onClick={() => removeNavLink(index)} aria-label={`Eliminar enlace ${link.label || index + 1}`}>×</button>
        </div>)}
      </div>}
      </>}
    </div>
  );
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
  const [draftSaving, setDraftSaving] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [modalTab, setModalTab] = useState('edit');
  const [navbarOpen, setNavbarOpen] = useState(false);
  const [savedNavSettings, setSavedNavSettings] = useState(NAV_DEFAULTS);
  const [globalStylesOpen, setGlobalStylesOpen] = useState(false);
  const [globalStyles, setGlobalStyles] = useState(STORE_THEME_DEFAULTS);
  const [savedGlobalStyles, setSavedGlobalStyles] = useState(STORE_THEME_DEFAULTS);
  const [globalStylesSaving, setGlobalStylesSaving] = useState(false);
  const [mediaItems, setMediaItems] = useState([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [mediaPickerField, setMediaPickerField] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/admin/builder/draft');
      const draft = data.draft || {};
      setModules(normalizeModules(draft.modules));
      setHasDraft(Boolean(data.has_draft));
      const config = draft.site_config_subset || {};
      const normalizedStyles = normalizeStoreTheme(config);
      setNavSettings((current) => ({ ...current, ...config, navbar_links: normalizeNavLinks(config.navbar_links ?? current.navbar_links) }));
      setSavedNavSettings((current) => ({ ...current, ...config, navbar_links: normalizeNavLinks(config.navbar_links ?? current.navbar_links) }));
      setGlobalStyles(normalizedStyles);
      setSavedGlobalStyles(normalizedStyles);
      setReorderDirty(false);
    } catch (err) {
      toast.error('No se pudieron cargar los módulos', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    api.get('/api/admin/products?active=true').then((data) => setProducts(data.products || [])).catch(() => setProducts([]));
  }, []);

  const loadMedia = async () => {
    if (mediaLoading) return;
    setMediaLoading(true);
    try {
      const data = await api.get('/api/admin/media?kind=image');
      setMediaItems(data.media || data.items || []);
      setMediaLoaded(true);
    } catch (err) {
      toast.error('No se pudo cargar la biblioteca de Media', err.message);
    } finally {
      setMediaLoading(false);
    }
  };

  const openMediaPicker = async (fieldKey) => {
    setMediaPickerField(fieldKey);
    if (!mediaLoaded) await loadMedia();
  };

  const persistDraft = async (nextModules, nextNavSettings) => {
    setDraftSaving(true);
    try {
      const siteConfigSubset = { ...navSettings, ...globalStyles, ...(nextNavSettings || {}) };
      await api.post('/api/admin/builder/draft', { modules: nextModules, site_config_subset: siteConfigSubset });
      setHasDraft(true);
      return true;
    } catch (err) {
      toast.error('No se pudo guardar el borrador', err.message);
      return false;
    } finally { setDraftSaving(false); }
  };

  const move = (idx, dir) => {
    const next = [...modules];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setModules(next);
    setReorderDirty(true);
  };

  const saveOrder = async () => {
    if (await persistDraft(modules, navSettings)) {
      toast.success('Orden del borrador guardado');
      setReorderDirty(false);
    }
  };

  const openNew = () => { setModalTab('edit'); setEditing({ mode: 'new', ...EMPTY_NEW, settings: defaultSettingsForType('hero') }); };
  const openEdit = (m) => { setModalTab('edit'); setEditing({ mode: 'edit', id: m.id, type: m.type, settings: { ...m.settings }, active: m.active }); };

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
            else if (f.type === 'checkbox') merged[f.key] = false;
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
      const next = { ...navSettings, navbar_links: navSettings.navbar_links.filter((link) => link.label.trim() && link.href.trim()) };
      setNavSettings(next);
      if (await persistDraft(modules, next)) {
        setSavedNavSettings(next);
        setNavbarOpen(false);
        toast.success('Navbar guardado en el borrador');
      }
    } catch (err) {
      toast.error('No se pudo guardar el navbar', err.message);
    } finally {
      setNavSaving(false);
    }
  };

  const closeGlobalStyles = () => {
    if (globalStylesSaving) return;
    setGlobalStyles(savedGlobalStyles);
    setGlobalStylesOpen(false);
  };

  const saveGlobalStyles = async () => {
    const nextStyles = normalizeStoreTheme(globalStyles);
    setGlobalStyles(nextStyles);
    setGlobalStylesSaving(true);
    try {
      if (await persistDraft(modules, nextStyles)) {
        setSavedGlobalStyles(nextStyles);
        setGlobalStylesOpen(false);
        toast.success('Estilos globales guardados', 'Quedaron en el borrador de la tienda.');
      }
    } catch (err) {
      toast.error('No se pudieron guardar los estilos', err.message);
    } finally {
      setGlobalStylesSaving(false);
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
        settingsOut[f.key] = f.type === 'number' ? Number(raw) : f.type === 'checkbox' ? Boolean(raw) : raw;
        if (f.type === 'media' && f.mediaPlacementKey) {
          settingsOut[f.mediaPlacementKey] = normalizeMediaPlacement(editing.settings[f.mediaPlacementKey]);
        }
      }
      const nextModule = { id: editing.id || `draft-${Date.now()}`, type: editing.type, settings: settingsOut, active: editing.active };
      const nextModules = editing.mode === 'new'
        ? [...modules, nextModule]
        : modules.map((module) => module.id === editing.id ? { ...module, ...nextModule } : module);
      if (!await persistDraft(nextModules, navSettings)) return;
      setModules(nextModules);
      toast.success(editing.mode === 'new' ? 'Módulo agregado al borrador' : 'Módulo actualizado en el borrador');
      setEditing(null);
    } catch (err) {
      toast.error('No se pudo guardar', err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (m) => {
    const nextModules = modules.map((module) => module.id === m.id ? { ...module, active: !module.active } : module);
    if (await persistDraft(nextModules, navSettings)) setModules(nextModules);
  };

  const toggleNavbar = async () => {
    const nextNav = { ...navSettings, navbar_enabled: navSettings.navbar_enabled === false };
    setNavSettings(nextNav);
    if (await persistDraft(modules, nextNav)) setSavedNavSettings(nextNav);
  };

  const configureNavbar = () => {
    setNavSettings(savedNavSettings);
    setNavbarOpen(true);
  };
  const closeNavbar = () => {
    if (navSaving) return;
    setNavSettings(savedNavSettings);
    setNavbarOpen(false);
  };

  const handleDelete = async () => {
    const nextModules = modules.filter((module) => module.id !== deleting.id);
    if (await persistDraft(nextModules, navSettings)) {
      setModules(nextModules);
      toast.success('Módulo eliminado');
      setDeleting(null);
    }
  };

  const discardDraft = async () => {
    try {
      await api.delete('/api/admin/builder/draft');
      toast.success('Borrador descartado', 'La tienda publicada no cambió.');
      await load();
    } catch (err) { toast.error('No se pudo descartar el borrador', err.message); }
  };

  const publishDraft = async () => {
    try {
      await api.post('/api/admin/builder/publish', {});
      toast.success('Cambios publicados', 'La tienda pública ya puede recibir la nueva versión.');
      await load();
    } catch (err) { toast.error('No se pudo publicar', err.message); }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>;

  const schema = editing ? MODULE_SCHEMAS[editing.type] : null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Web Builder</h1>
          <p style={{ color: 'var(--color-muted)', margin: 0, fontSize: 13 }}>
            Configura el borrador de la tienda, revísalo y publícalo cuando estés conforme.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {reorderDirty && (
            <button className="btn btn-primary" onClick={saveOrder}>Guardar orden</button>
          )}
          <button className="btn" onClick={() => setPreviewOpen(true)}>Vista previa</button>
          <button className="btn builder-global-settings-button" type="button" onClick={() => setGlobalStylesOpen(true)} title="Configurar estilos globales" aria-label="Configurar estilos globales">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /><path d="M9 4v4M15 10v4M7 16v4" /></svg><span>Estilos</span>
          </button>
          {hasDraft && <button className="btn btn-danger" onClick={discardDraft} disabled={draftSaving}>Descartar borrador</button>}
          {hasDraft && <button className="btn btn-primary" onClick={publishDraft} disabled={draftSaving}>Publicar</button>}
          <button className="btn btn-accent" onClick={openNew}>+ Nuevo módulo</button>
        </div>
      </div>

      <div className="builder-module-list">
        <BuilderModuleRow
          icon="🧭"
          label="Nav Bar"
          description="Barra principal de navegación, búsqueda y carrito."
          active={navSettings.navbar_enabled !== false}
          onMoveUp={() => {}}
          onMoveDown={() => {}}
          onToggle={toggleNavbar}
          onConfigure={configureNavbar}
          onDelete={() => {}}
          disableUp
          disableDown
          disableDelete
        />
        {modules.map((m, idx) => {
          const sch = MODULE_SCHEMAS[m.type];
          const label = sch?.label || m.type;
          const icon = sch?.icon || '📦';
          return <BuilderModuleRow
            key={m.id}
            icon={icon}
            label={label}
            description={sch?.description || `Tipo: ${m.type}`}
            active={m.active !== false}
            onMoveUp={() => move(idx, -1)}
            onMoveDown={() => move(idx, 1)}
            onToggle={() => toggleActive(m)}
            onConfigure={() => openEdit(m)}
            onDelete={() => setDeleting(m)}
            disableUp={idx === 0}
            disableDown={idx === modules.length - 1}
          />;
        })}
        {modules.length === 0 && <Empty title="Sin módulos" description="La home no muestra nada. Crea el primero." action={<button className="btn btn-primary" onClick={openNew}>+ Nuevo módulo</button>} />}
      </div>

      <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 16 }}>
        Tip: el store público lee los módulos activos en orden desde <code>/api/public/page-modules</code>.
        Cambios se ven al refrescar el browser (cache de 60s).
      </p>

      <Modal
        open={globalStylesOpen}
        onClose={closeGlobalStyles}
        size="lg"
        title="Estilos globales de la tienda"
        footer={
          <>
            <button className="btn" type="button" onClick={() => setGlobalStyles(STORE_THEME_DEFAULTS)} disabled={globalStylesSaving}>Restaurar valores</button>
            <button className="btn" type="button" onClick={closeGlobalStyles} disabled={globalStylesSaving}>Cancelar</button>
            <button className="btn btn-primary" type="button" onClick={saveGlobalStyles} disabled={globalStylesSaving}>{globalStylesSaving ? <span className="spinner" /> : 'Guardar en borrador'}</button>
          </>
        }
      >
        <GlobalStoreStyles values={globalStyles} onChange={(key, value) => setGlobalStyles((current) => ({ ...current, [key]: value }))} />
      </Modal>

      <Modal
        open={navbarOpen}
        onClose={closeNavbar}
        size="lg"
        title="Configurar Nav Bar"
        footer={
          <>
            <button className="btn" type="button" onClick={closeNavbar} disabled={navSaving}>Cancelar</button>
            <button className="btn btn-primary" type="button" onClick={saveNavSettings} disabled={navSaving}>
              {navSaving ? <span className="spinner" /> : 'Guardar Nav Bar'}
            </button>
          </>
        }
      >
        <NavbarSettings
          navSettings={navSettings}
          setNavValue={setNavValue}
          updateNavLink={updateNavLink}
          addNavLink={addNavLink}
          removeNavLink={removeNavLink}
        />
      </Modal>

      <Modal
        open={!!editing}
        onClose={() => !saving && setEditing(null)}
        size="lg"
        layerClassName={editing?.type === 'hero' ? 'hero-modal-layer' : undefined}
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
          <>
            <div className="builder-modal-tabs" role="tablist" aria-label="Modo del editor">
              <button className={`builder-modal-tab ${modalTab === 'edit' ? 'is-active' : ''}`} type="button" onClick={() => setModalTab('edit')}>Editar</button>
              <button className={`builder-modal-tab ${modalTab === 'preview' ? 'is-active' : ''}`} type="button" onClick={() => setModalTab('preview')}>Vista previa</button>
            </div>
            {modalTab === 'edit' ? <form onSubmit={handleSave}>
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
            {schema.settings.map((f) => {
              const customCodeEnabled = Boolean(editing.settings.custom_code_enabled);
              if (customCodeEnabled && !['custom_code_enabled', 'custom_code'].includes(f.key)) return null;
              if (f.type === 'custom_code' && !customCodeEnabled) return null;
              if (f.type === 'checkbox') {
                return <label className="builder-checkbox-field" key={f.key}>
                  <input type="checkbox" checked={Boolean(editing.settings[f.key] ?? f.defaultValue)} onChange={(e) => setSetting(f.key, e.target.checked)} />
                  <span>{f.label}</span>
                </label>;
              }
              if (f.type === 'custom_code') return <CustomCodeEditor
                key={f.key}
                value={editing.settings[f.key]}
                onChange={(value) => setSetting(f.key, value)}
                moduleType={editing.type}
                idPrefix={`builder-${editing.type}-custom-code`}
              />;
              return <div className="form-group" key={f.key}>
                <label>{f.label}</label>
                {f.type === 'media' ? (
                  <MediaField
                    field={f}
                    value={editing.settings[f.key] ?? ''}
                    placement={f.mediaPlacementKey ? editing.settings[f.mediaPlacementKey] : undefined}
                    onChange={(value) => setSetting(f.key, value)}
                    onPlacementChange={(value) => f.mediaPlacementKey && setSetting(f.mediaPlacementKey, value)}
                    onOpenPicker={() => openMediaPicker(f.key)}
                  />
                ) : f.type === 'textarea' ? (
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
              </div>;
            })}
          </form> : <LiveStorePreview modules={[editing]} navSettings={navSettings} globalStyles={globalStyles} title="Vista previa real del módulo" />}
          </>
        )}
      </Modal>

      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        size="lg"
        layerClassName="modal-backdrop builder-preview-modal-layer"
        title="Vista previa del borrador"
        footer={<button className="btn" onClick={() => setPreviewOpen(false)}>Cerrar</button>}
      >
        <LiveStorePreview modules={modules} navSettings={navSettings} globalStyles={globalStyles} />
      </Modal>

      <MediaPickerModal
        open={Boolean(mediaPickerField && editing)}
        onClose={() => setMediaPickerField(null)}
        items={mediaItems}
        loading={mediaLoading}
        value={mediaPickerField ? editing?.settings?.[mediaPickerField] : ''}
        onSelect={(url) => {
          if (mediaPickerField) setSetting(mediaPickerField, url);
          setMediaPickerField(null);
        }}
      />

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
