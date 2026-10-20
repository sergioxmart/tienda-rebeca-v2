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

const HERO_POSITION_DEFAULTS = {
  desktop: { x: 50, y: 50 },
  mobile: { x: 50, y: 50 },
};

const HERO_FONT_FAMILIES = {
  display: 'var(--font-display)',
  serif: 'Georgia, "Times New Roman", serif',
  sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  script: '"Brush Script MT", "Segoe Script", cursive',
};

const HERO_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const GLOBAL_STYLE_DEFAULTS = Object.freeze({
  ...STORE_THEME_DEFAULTS,
  store_splash_enabled: true,
  store_splash_duration: 2.5,
  store_splash_image_url: '',
  store_splash_image_border_radius: 100,
  store_splash_background_color: '#FAF7F2',
});

function normalizeGlobalStyles(config = {}) {
  const duration = Number(config.store_splash_duration);
  const imageBorderRadius = Number(config.store_splash_image_border_radius);
  return {
    ...normalizeStoreTheme(config),
    store_splash_enabled: config.store_splash_enabled !== false,
    store_splash_duration: Number.isFinite(duration) ? Math.min(10, Math.max(1, duration)) : GLOBAL_STYLE_DEFAULTS.store_splash_duration,
    store_splash_image_url: typeof config.store_splash_image_url === 'string' ? config.store_splash_image_url : '',
    store_splash_image_border_radius: Number.isFinite(imageBorderRadius) ? Math.min(100, Math.max(0, Math.round(imageBorderRadius))) : GLOBAL_STYLE_DEFAULTS.store_splash_image_border_radius,
    store_splash_background_color: HERO_COLOR_RE.test(String(config.store_splash_background_color || '')) ? String(config.store_splash_background_color).toUpperCase() : GLOBAL_STYLE_DEFAULTS.store_splash_background_color,
  };
}

function pickerColor(value, fallback = '#FFFFFF') {
  return HERO_COLOR_RE.test(String(value || '')) ? value : fallback;
}

function colorToRgba(value, alpha) {
  const hex = pickerColor(value, '#000000').slice(1);
  const channels = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  return `rgba(${channels.join(',')},${alpha})`;
}

function normalizeHeroShadow(settings = {}) {
  const intensity = Number(settings.shadow_intensity);
  return {
    enabled: settings.shadow_enabled === true,
    intensity: Number.isFinite(intensity) ? Math.min(100, Math.max(0, intensity)) : 45,
    color: pickerColor(settings.shadow_color, '#000000'),
  };
}

function normalizeHeroPosition(value) {
  return Object.fromEntries(Object.entries(HERO_POSITION_DEFAULTS).map(([viewport, defaults]) => {
    const source = value?.[viewport] || {};
    const x = Number(source.x);
    const y = Number(source.y);
    return [viewport, {
      x: Number.isFinite(x) ? Math.min(100, Math.max(0, x)) : defaults.x,
      y: Number.isFinite(y) ? Math.min(100, Math.max(0, y)) : defaults.y,
    }];
  }));
}

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
      { key: 'hero_style', label: 'Estilo del Hero', type: 'select', defaultValue: 'classic-overlay', options: [
        { value: 'classic-overlay', label: 'Clásico · texto sobre imagen' },
        { value: 'side-panel', label: 'Panel lateral · texto separado' },
      ] },
      { key: 'content_align', label: 'Alineación del contenido', type: 'select', defaultValue: 'center', options: [
        { value: 'left', label: 'Izquierda' },
        { value: 'center', label: 'Centro' },
        { value: 'right', label: 'Derecha' },
      ] },
      { key: 'overlay_enabled', label: 'Aplicar color sobre la imagen de fondo', type: 'checkbox', defaultValue: true },
      { key: 'text_color', label: 'Color de los textos', type: 'color', defaultValue: '#FFFFFF' },
      { key: 'content_background_color', label: 'Color de fondo del contenido', type: 'color', defaultValue: '#FFFAF3' },
      { key: 'text_font', label: 'Fuente de los textos', type: 'select', defaultValue: 'default', options: [
        { value: 'default', label: 'Predeterminada de la tienda' },
        { value: 'display', label: 'Editorial' },
        { value: 'serif', label: 'Clásica · serif' },
        { value: 'sans', label: 'Limpia · sans serif' },
        { value: 'script', label: 'Manuscrita · cursiva' },
      ] },
      { key: 'text_scale_target', label: 'Texto a ajustar', type: 'select', defaultValue: '', options: [
        { value: '', label: 'Selecciona un texto' },
        { value: 'title', label: 'Título' },
        { value: 'subtitle', label: 'Subtítulo' },
        { value: 'eyebrow', label: 'Etiqueta superior' },
        { value: 'button', label: 'Texto del botón' },
        { value: 'secondary_cta', label: 'Segundo enlace' },
      ] },
      { key: 'title_text_scale', label: 'Tamaño del título', type: 'range', defaultValue: 100, min: 10, max: 120, step: 5, unit: '%' },
      { key: 'subtitle_text_scale', label: 'Tamaño del subtítulo', type: 'range', defaultValue: 100, min: 10, max: 120, step: 5, unit: '%' },
      { key: 'eyebrow_text_scale', label: 'Tamaño de la etiqueta superior', type: 'range', defaultValue: 100, min: 10, max: 120, step: 5, unit: '%' },
      { key: 'button_text_scale', label: 'Tamaño del texto del botón', type: 'range', defaultValue: 100, min: 10, max: 120, step: 5, unit: '%' },
      { key: 'secondary_cta_text_scale', label: 'Tamaño del segundo enlace', type: 'range', defaultValue: 100, min: 10, max: 120, step: 5, unit: '%' },
      { key: 'button_background_color', label: 'Color de fondo del botón', type: 'color', defaultValue: '#FFFFFF' },
      { key: 'button_text_color', label: 'Color del texto del botón', type: 'color', defaultValue: '#0F2A47' },
      { key: 'button_font', label: 'Fuente del botón', type: 'select', defaultValue: 'default', options: [
        { value: 'default', label: 'Predeterminada de la tienda' },
        { value: 'display', label: 'Editorial' },
        { value: 'serif', label: 'Clásica · serif' },
        { value: 'sans', label: 'Limpia · sans serif' },
        { value: 'script', label: 'Manuscrita · cursiva' },
      ] },
      { key: 'shadow_enabled', label: 'Añadir sombreado a los elementos', type: 'checkbox', defaultValue: false },
      { key: 'shadow_intensity', label: 'Intensidad del sombreado', type: 'range', defaultValue: 45, min: 0, max: 100, step: 1 },
      { key: 'shadow_color', label: 'Color del sombreado', type: 'color', defaultValue: '#000000' },
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

const HERO_SETTING_GROUPS = [
  {
    key: 'content',
    label: 'Contenido',
    description: 'Texto principal y ubicación del contenido.',
    fields: ['eyebrow', 'title', 'subtitle', 'hero_style', 'content_align'],
  },
  {
    key: 'appearance',
    label: 'Apariencia',
    description: 'Colores, tipografías y sombreado.',
    fields: ['overlay_enabled', 'text_color', 'content_background_color', 'text_font', 'text_scale_target', 'title_text_scale', 'subtitle_text_scale', 'eyebrow_text_scale', 'button_text_scale', 'secondary_cta_text_scale', 'shadow_enabled', 'shadow_intensity', 'shadow_color'],
  },
  {
    key: 'background',
    label: 'Imagen de fondo',
    description: 'Imagen y encuadre del fondo del Hero.',
    fields: ['image_url'],
  },
  {
    key: 'visual',
    label: 'Visual lateral',
    description: 'El elemento que aparece al lado derecho.',
    fields: ['visual_mode', 'product_slug', 'visual_image_url'],
  },
  {
    key: 'buttons',
    label: 'Botones y enlaces',
    description: 'Acciones y estilos de los botones.',
    fields: ['button_background_color', 'button_text_color', 'button_font', 'cta_text', 'cta_link', 'secondary_cta_text', 'secondary_cta_link'],
  },
  {
    key: 'advanced',
    label: 'Avanzado',
    description: 'Reemplaza el diseño estándar con código personalizado.',
    fields: ['custom_code_enabled', 'custom_code'],
  },
];

const HERO_VISUAL_LABELS = {
  none: 'Ninguno',
  abstract: 'Abstracto Rebeca Andrade',
  product: 'Producto destacado',
  image: 'Imagen personalizada',
};

const HERO_STYLE_LABELS = {
  'classic-overlay': 'Clásico',
  'side-panel': 'Panel lateral',
};

const HERO_TEXT_SCALE_LABELS = {
  title: 'Título',
  subtitle: 'Subtítulo',
  eyebrow: 'Etiqueta',
  button: 'Botón',
  secondary_cta: 'Segundo enlace',
};

function heroGroupSummary(groupKey, settings = {}) {
  if (groupKey === 'content') {
    const style = HERO_STYLE_LABELS[settings.hero_style] || HERO_STYLE_LABELS['classic-overlay'];
    return `${settings.title ? 'Título configurado' : 'Sin título'} · ${style}`;
  }
  if (groupKey === 'appearance') {
    const target = HERO_TEXT_SCALE_LABELS[settings.text_scale_target];
    const scale = Number(settings[`${settings.text_scale_target}_text_scale`]);
    const textLabel = target && Number.isFinite(scale) ? `${target} ${scale}%` : 'Sin ajuste de tamaño';
    return [settings.overlay_enabled !== false ? 'Overlay activo' : 'Overlay desactivado', textLabel, settings.shadow_enabled ? 'Sombra activa' : 'Sin sombra'].join(' · ');
  }
  if (groupKey === 'background') return settings.image_url ? 'Imagen seleccionada' : 'Sin imagen';
  if (groupKey === 'visual') {
    const mode = settings.visual_mode || 'abstract';
    if (mode === 'product' && settings.product_slug) return 'Producto seleccionado';
    if (mode === 'image' && settings.visual_image_url) return 'Imagen seleccionada';
    return HERO_VISUAL_LABELS[mode] || HERO_VISUAL_LABELS.abstract;
  }
  if (groupKey === 'buttons') {
    const ctaText = String(settings.cta_text || '').trim();
    if (!ctaText) return 'Sin botón principal';
    return `CTA: ${ctaText.length > 28 ? `${ctaText.slice(0, 28)}…` : ctaText}`;
  }
  return settings.custom_code_enabled ? 'Código personalizado activo' : 'Configuración estándar';
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
  navbar_show_store: true,
  navbar_show_categories: true,
  navbar_links: [],
  navbar_logo_mode: 'image',
  navbar_custom_logo_url: '',
  navbar_logo_border_radius: 0,
  navbar_logo_vertical_padding: 15,
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

function GlobalStoreStyles({ values, onChange, onOpenSplashPicker, onUploadSplashImage, uploadingSplashImage }) {
  const paletteFields = STORE_THEME_FIELDS.slice(0, 4);
  const typographyFields = STORE_THEME_FIELDS.slice(4);
  const splashImageBorderRadius = Math.min(100, Math.max(0, Number(values.store_splash_image_border_radius) || 0));
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
      <section className="builder-global-style-section builder-splash-settings">
        <div className="builder-global-style-heading"><h3>Pantalla de bienvenida</h3><span>Se muestra al abrir la página principal de la tienda.</span></div>
        <label className="builder-splash-toggle"><input type="checkbox" checked={values.store_splash_enabled} onChange={(event) => onChange('store_splash_enabled', event.target.checked)} /> Activar pantalla de bienvenida</label>
        <div className="builder-splash-controls">
          <label className="form-group"><span>Duración</span><span className="builder-splash-duration"><input className="input" type="number" min="1" max="10" step="0.5" value={values.store_splash_duration} onChange={(event) => onChange('store_splash_duration', event.target.value)} disabled={!values.store_splash_enabled} /><span>segundos</span></span></label>
          <div className="form-group">
            <label htmlFor="builder-splash-image-url">Imagen o GIF</label>
            <input id="builder-splash-image-url" className="input" type="url" value={values.store_splash_image_url} onChange={(event) => onChange('store_splash_image_url', event.target.value)} placeholder="Pega una URL o elige desde Media" disabled={!values.store_splash_enabled} />
            <div className="builder-splash-upload-row">
              <button className="btn" type="button" onClick={onOpenSplashPicker} disabled={!values.store_splash_enabled || uploadingSplashImage}>Elegir de Media</button>
              <input id="builder-splash-image-file" type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" hidden disabled={!values.store_splash_enabled || uploadingSplashImage} onChange={onUploadSplashImage} />
              <label className={`btn${!values.store_splash_enabled || uploadingSplashImage ? ' is-disabled' : ''}`} htmlFor="builder-splash-image-file" aria-disabled={!values.store_splash_enabled || uploadingSplashImage}>
                {uploadingSplashImage ? <><span className="spinner" /> Subiendo…</> : 'Subir imagen o GIF'}
              </label>
              {values.store_splash_image_url && <button className="btn" type="button" onClick={() => onChange('store_splash_image_url', '')} disabled={!values.store_splash_enabled || uploadingSplashImage}>Quitar</button>}
            </div>
            <span className="help">Formatos: JPG, PNG, WebP, AVIF o GIF. Si no eliges una imagen, se muestra el nombre de la tienda.</span>
          </div>
        </div>
        {values.store_splash_image_url && <div className="builder-splash-preview"><img className={splashImageBorderRadius === 100 ? 'is-circular' : ''} src={values.store_splash_image_url} alt="Vista previa de la pantalla de bienvenida" style={splashImageBorderRadius === 100 ? undefined : { borderRadius: `${splashImageBorderRadius / 2}%` }} /><span>Vista previa</span></div>}
        <div className="builder-splash-appearance">
          <div className="form-group builder-splash-radius-field">
            <label htmlFor="builder-splash-image-border-radius">Redondez de la imagen: <strong>{splashImageBorderRadius}%</strong></label>
            <input id="builder-splash-image-border-radius" type="range" min="0" max="100" step="1" value={splashImageBorderRadius} onChange={(event) => onChange('store_splash_image_border_radius', Number(event.target.value))} aria-label="Redondez de la imagen del splash" disabled={!values.store_splash_enabled || !values.store_splash_image_url} />
            <span className="help">0% conserva las esquinas rectas; 100% redondea completamente la imagen.</span>
          </div>
          <GlobalColorField
            field={{ key: 'store_splash_background_color', label: 'Fondo del splash', description: 'Color que cubre la pantalla mientras aparece la imagen.' }}
            value={values.store_splash_background_color}
            onChange={(value) => onChange('store_splash_background_color', value)}
          />
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
    page_key: module.page_key || 'store',
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
  if (type === 'hero') out.content_position = normalizeHeroPosition();
  return out;
}

function LiveStorePreview({ modules, navSettings, globalStyles, pageKey = 'store', title = 'Vista previa real de la tienda' }) {
  const frameRef = useRef(null);
  const viewportRef = useRef(null);
  const [previewMode, setPreviewMode] = useState('desktop');
  const [desktopScale, setDesktopScale] = useState(1);
  const [previewZoom, setPreviewZoom] = useState(100);
  const desktopPreviewWidth = 1280;
  const desktopPreviewHeight = 720;
  const payload = useMemo(() => ({
    modules: modules || [],
    site_config_subset: { ...(navSettings || {}), ...(globalStyles || {}) },
  }), [modules, navSettings, globalStyles]);
  const payloadKey = useMemo(() => JSON.stringify({ payload, pageKey }), [payload, pageKey]);
  const previewSrc = useMemo(() => {
    const url = new URL(getStorePreviewUrl());
    url.searchParams.set('builder_preview_version', 'text-scale-v2');
    url.searchParams.set('builder_preview_page_key', pageKey);
    return url.toString();
  }, [pageKey]);

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

  useEffect(() => {
    if (previewMode !== 'desktop') {
      setDesktopScale(1);
      return undefined;
    }

    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    const updateScale = () => {
      const availableWidth = Math.max(viewport.clientWidth - 28, 280);
      setDesktopScale(Math.min(1, availableWidth / desktopPreviewWidth));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [previewMode]);

  const effectiveDesktopScale = desktopScale * (previewZoom / 100);
  const scaledDesktopFrameStyle = previewMode === 'desktop'
    ? {
        width: `${desktopPreviewWidth * effectiveDesktopScale}px`,
        height: `${desktopPreviewHeight * effectiveDesktopScale}px`,
      }
    : undefined;

  return (
    <div className="builder-real-preview">
      <div className="builder-real-preview-heading">
        <div className="builder-real-preview-copy"><strong>{title}</strong><span>Renderiza la misma tienda y los mismos datos del catálogo.</span></div>
        <div className="builder-preview-tools">
          {previewMode === 'desktop' && (
            <div className="builder-preview-zoom" role="group" aria-label="Zoom de la vista previa de escritorio">
              <button type="button" aria-label="Reducir zoom" disabled={previewZoom <= 60} onClick={() => setPreviewZoom((value) => Math.max(60, value - 10))}>−</button>
              <button type="button" className="builder-preview-zoom-value" aria-label="Restablecer zoom al 100 por ciento" onClick={() => setPreviewZoom(100)}>{previewZoom}%</button>
              <button type="button" aria-label="Aumentar zoom" disabled={previewZoom >= 100} onClick={() => setPreviewZoom((value) => Math.min(100, value + 10))}>+</button>
            </div>
          )}
          <div className="builder-preview-switch" role="tablist" aria-label="Tamaño de la vista previa">
            <button className={previewMode === 'desktop' ? 'is-active' : ''} type="button" role="tab" aria-selected={previewMode === 'desktop'} onClick={() => setPreviewMode('desktop')}>Escritorio</button>
            <button className={previewMode === 'mobile' ? 'is-active' : ''} type="button" role="tab" aria-selected={previewMode === 'mobile'} onClick={() => setPreviewMode('mobile')}>Móvil</button>
          </div>
        </div>
      </div>
      <div className={`builder-real-preview-viewport is-${previewMode}`}>
        <div className="builder-real-preview-device">
          <span className="builder-real-preview-device-label">{previewMode === 'mobile' ? 'Móvil · 390 × 844' : 'Escritorio · 1280 × 720'}</span>
          {previewMode === 'desktop' ? (
            <div className="builder-real-preview-frame-shell is-desktop" style={scaledDesktopFrameStyle}>
              <iframe
                key={payloadKey}
                className="builder-real-preview-frame is-desktop"
                ref={frameRef}
                title={title}
                src={previewSrc}
                onLoad={sendDraft}
                style={{
                  width: `${desktopPreviewWidth}px`,
                  height: `${desktopPreviewHeight}px`,
                  transform: `scale(${effectiveDesktopScale})`,
                }}
              />
            </div>
          ) : (
            <iframe key={payloadKey} className="builder-real-preview-frame is-mobile" ref={frameRef} title={title} src={previewSrc} onLoad={sendDraft} />
          )}
        </div>
      </div>
    </div>
  );
}

function HeroVisualEditor({ settings, onChange }) {
  const [viewport, setViewport] = useState('desktop');
  const [dragState, setDragState] = useState(null);
  const position = normalizeHeroPosition(settings.content_position);
  const currentPosition = position[viewport];
  const align = ['left', 'center', 'right'].includes(settings.content_align) ? settings.content_align : 'center';
  const heroStyle = settings.hero_style === 'side-panel' ? 'side-panel' : 'classic-overlay';
  const imageUrl = settings.image_url;
  const shadow = normalizeHeroShadow(settings);
  const textFont = HERO_FONT_FAMILIES[settings.text_font];
  const buttonFont = HERO_FONT_FAMILIES[settings.button_font];
  const scaleFor = (key) => {
    const value = Number(settings[key]);
    return Number.isFinite(value) ? Math.min(1.2, Math.max(0.1, value / 100)) : 1;
  };
  const textScales = {
    title: scaleFor('title_text_scale'),
    subtitle: scaleFor('subtitle_text_scale'),
    eyebrow: scaleFor('eyebrow_text_scale'),
    button: scaleFor('button_text_scale'),
    secondary: scaleFor('secondary_cta_text_scale'),
  };
  const shadowBlur = Math.max(1, Math.round(shadow.intensity / 8));
  const shadowAlpha = (0.12 + (shadow.intensity / 100) * 0.5).toFixed(2);
  const shadowColor = colorToRgba(shadow.color, shadowAlpha);
  const contentBackgroundColor = pickerColor(settings.content_background_color, '#FFFAF3');
  const canvasStyle = imageUrl
    ? heroStyle === 'side-panel'
      ? { '--builder-hero-image': `url(${imageUrl})`, backgroundImage: 'none' }
      : { backgroundImage: settings.overlay_enabled === false
        ? `url(${imageUrl})`
        : `linear-gradient(rgba(15,42,71,.55), rgba(15,42,71,.7)), url(${imageUrl})` }
    : undefined;

  const updatePosition = (nextPosition) => onChange({ ...position, [viewport]: nextPosition });
  const beginDrag = (event) => {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragState({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPosition: currentPosition,
      width: rect.width,
      height: rect.height,
    });
  };
  const moveDrag = (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    updatePosition({
      x: Math.min(100, Math.max(0, dragState.startPosition.x + ((event.clientX - dragState.startX) / dragState.width) * 100)),
      y: Math.min(100, Math.max(0, dragState.startPosition.y + ((event.clientY - dragState.startY) / dragState.height) * 100)),
    });
  };
  const endDrag = () => setDragState(null);

  return <div className="builder-hero-editor">
    <div className="builder-hero-editor-heading">
      <div><strong>Editor visual</strong><span>Arrastra el bloque para ubicar la etiqueta, título, subtítulo y botones como en un editor visual.</span></div>
      <div className="builder-media-placement-tabs" role="tablist" aria-label="Tamaño de pantalla del Hero">
        <button className={viewport === 'desktop' ? 'is-active' : ''} type="button" onClick={() => setViewport('desktop')} role="tab" aria-selected={viewport === 'desktop'}>Escritorio</button>
        <button className={viewport === 'mobile' ? 'is-active' : ''} type="button" onClick={() => setViewport('mobile')} role="tab" aria-selected={viewport === 'mobile'}>Móvil</button>
      </div>
    </div>
    <div
      className={`builder-hero-editor-canvas is-${viewport}${heroStyle === 'side-panel' ? ' is-side-panel' : ''}`}
      style={canvasStyle}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {!imageUrl && <div className="builder-hero-editor-placeholder">Imagen de fondo del Hero</div>}
      {heroStyle === 'side-panel' && imageUrl && <div className="builder-hero-editor-image" style={{ backgroundImage: `url(${imageUrl})` }} aria-hidden="true" />}
      <div
        className={`builder-hero-editor-content is-${align}${dragState ? ' is-dragging' : ''}`}
        style={{
          left: heroStyle === 'side-panel' ? undefined : `${currentPosition.x}%`,
          top: heroStyle === 'side-panel' ? undefined : `${currentPosition.y}%`,
          '--hero-title-scale': textScales.title,
          '--hero-subtitle-scale': textScales.subtitle,
          '--hero-eyebrow-scale': textScales.eyebrow,
          '--hero-button-scale': textScales.button,
          '--hero-secondary-scale': textScales.secondary,
          '--builder-hero-content-background': contentBackgroundColor,
          transform: heroStyle === 'side-panel' ? undefined : `translate(${currentPosition.x * -1}%, ${currentPosition.y * -1}%)`,
        }}
        onPointerDown={heroStyle === 'side-panel' ? undefined : beginDrag}
        role={heroStyle === 'side-panel' ? undefined : 'button'}
        tabIndex={heroStyle === 'side-panel' ? undefined : 0}
        aria-label={heroStyle === 'side-panel' ? undefined : 'Arrastrar contenido del Hero'}
      >
        {settings.eyebrow && <span className="builder-hero-editor-eyebrow" style={{ color: pickerColor(settings.text_color), fontFamily: textFont, textShadow: shadow.enabled ? `0 1px ${shadowBlur}px ${shadowColor}` : 'none' }}>{settings.eyebrow}</span>}
        <strong style={{ color: pickerColor(settings.text_color), fontFamily: textFont, textShadow: shadow.enabled ? `0 2px ${shadowBlur}px ${shadowColor}` : 'none' }}>{settings.title || 'Título del Hero'}</strong>
        <p style={{ color: pickerColor(settings.text_color), fontFamily: textFont, textShadow: shadow.enabled ? `0 1px ${shadowBlur}px ${shadowColor}` : 'none' }}>{settings.subtitle || 'Subtítulo del Hero'}</p>
        {settings.cta_text && <span className="builder-hero-editor-button" style={{ color: pickerColor(settings.button_text_color, '#0F2A47'), background: pickerColor(settings.button_background_color), fontFamily: buttonFont, textShadow: shadow.enabled ? `0 1px ${shadowBlur}px ${shadowColor}` : 'none', boxShadow: shadow.enabled ? `0 4px ${shadowBlur + 3}px ${shadowColor}` : 'none' }}>{settings.cta_text}</span>}
      </div>
      {heroStyle !== 'side-panel' && <span className="builder-hero-editor-hint">↔ Arrastra para mover</span>}
    </div>
    <div className="builder-hero-editor-controls">
      {heroStyle === 'side-panel'
        ? <span>Composición lateral: <strong>texto separado de la imagen</strong></span>
        : <><span>Posición {viewport === 'desktop' ? 'de escritorio' : 'móvil'}: <strong>{Math.round(currentPosition.x)}% horizontal · {Math.round(currentPosition.y)}% vertical</strong></span><button className="btn btn-sm" type="button" onClick={() => updatePosition({ ...HERO_POSITION_DEFAULTS[viewport] })}>Centrar contenido</button></>}
    </div>
    {settings.overlay_enabled === false && <div className="help">El color sobre la imagen está desactivado; el fondo se muestra sin overlay.</div>}
    {shadow.enabled && <div className="help">Sombreado activo al {shadow.intensity}% de intensidad.</div>}
  </div>;
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

function MediaPickerModal({ open, onClose, items, loading, value, onSelect, title = 'Elegir imagen de Media' }) {
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
      title={title}
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

function NavbarSettings({ navSettings, setNavValue, updateNavLink, addNavLink, removeNavLink, onOpenLogoPicker }) {
  const customCodeEnabled = Boolean(navSettings.navbar_custom_code_enabled);
  const logoBorderRadius = Math.min(100, Math.max(0, Number(navSettings.navbar_logo_border_radius) || 0));
  const logoVerticalPadding = Math.min(32, Math.max(1, Number(navSettings.navbar_logo_vertical_padding) || 15));
  const imageLogoModes = ['image', 'custom', 'image_text', 'custom_text'];
  const textLogoModes = ['text', 'image_text', 'custom_text'];
  const customImageLogoModes = ['custom', 'custom_text'];
  const hasImageLogo = imageLogoModes.includes(navSettings.navbar_logo_mode);
  const hasTextLogo = textLogoModes.includes(navSettings.navbar_logo_mode);
  const hasCustomImageLogo = customImageLogoModes.includes(navSettings.navbar_logo_mode);
  const logoShapeStyle = logoBorderRadius >= 100
    ? { width: '44px', height: '44px', flexBasis: '44px', borderRadius: '50%', objectFit: 'cover' }
    : { borderRadius: `${logoBorderRadius / 2}%` };
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
            <option value="image_text">Usar logo cargado + texto</option>
            <option value="custom">Usar logo personalizado</option>
            <option value="custom_text">Usar logo personalizado + texto</option>
            <option value="text">Usar texto de marca</option>
          </select>
        </div>
        {hasTextLogo && (
          <div className="form-group">
            <label>Texto del logo</label>
            <input className="input" value={navSettings.navbar_logo_text} onChange={(e) => setNavValue('navbar_logo_text', e.target.value)} placeholder="Rebeca Andrade" />
          </div>
        )}
      </div>
      {hasImageLogo && (
        <div className="form-group builder-navbar-radius-field">
          <label htmlFor="builder-navbar-logo-border-radius">Redondez de los bordes del logo: <strong>{logoBorderRadius}%</strong></label>
          <input
            id="builder-navbar-logo-border-radius"
            type="range"
            min="0"
            max="100"
            step="1"
            value={logoBorderRadius}
            onChange={(e) => setNavValue('navbar_logo_border_radius', Number(e.target.value))}
            aria-label="Redondez de los bordes del logo"
          />
          <div className="help">0% deja las esquinas rectas; de 1% a 99% redondea hasta formar un óvalo; 100% fuerza un círculo.</div>
        </div>
      )}
      {hasImageLogo && (
        <div className="form-group builder-navbar-radius-field">
          <label htmlFor="builder-navbar-logo-vertical-padding">Espacio arriba y abajo en el Nav Bar: <strong>{logoVerticalPadding}px</strong></label>
          <input
            id="builder-navbar-logo-vertical-padding"
            type="range"
            min="1"
            max="32"
            step="1"
            value={logoVerticalPadding}
            onChange={(event) => setNavValue('navbar_logo_vertical_padding', Number(event.target.value))}
            aria-label="Espacio superior e inferior del Nav Bar"
          />
          <div className="help">1 px acerca el logo a los bordes superior e inferior; aumenta el valor para dejar más espacio.</div>
        </div>
      )}
      {hasCustomImageLogo && (
        <div className="form-group">
          <label>Imagen del logo personalizado</label>
          {navSettings.navbar_custom_logo_url ? (
            <div className="builder-navbar-logo-selected">
              <img
                src={navSettings.navbar_custom_logo_url}
                alt="Vista previa del logo personalizado"
                style={logoShapeStyle}
              />
              <div>
                <strong>Logo seleccionado</strong>
                <span>{navSettings.navbar_custom_logo_url}</span>
              </div>
              <div className="builder-navbar-logo-actions">
                <button className="btn btn-sm" type="button" onClick={onOpenLogoPicker}>Cambiar</button>
                <button className="btn btn-sm" type="button" onClick={() => setNavValue('navbar_custom_logo_url', '')}>Quitar</button>
              </div>
            </div>
          ) : (
            <button className="btn" type="button" onClick={onOpenLogoPicker}>Elegir imagen de Media</button>
          )}
          <div className="help">Selecciona una imagen existente en la biblioteca de Media para usarla en la barra de navegación.</div>
        </div>
      )}
      {hasTextLogo && (
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
        <label><input type="checkbox" checked={navSettings.navbar_show_store !== false} onChange={(e) => setNavValue('navbar_show_store', e.target.checked)} /> Mostrar Tienda</label>
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
  const [serviceCategories, setServiceCategories] = useState([]);
  const [selectedPageKey, setSelectedPageKey] = useState('store');
  const [navSettings, setNavSettings] = useState(NAV_DEFAULTS);
  const [navSaving, setNavSaving] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [modalTab, setModalTab] = useState('edit');
  const [navbarOpen, setNavbarOpen] = useState(false);
  const [savedNavSettings, setSavedNavSettings] = useState(NAV_DEFAULTS);
  const [globalStylesOpen, setGlobalStylesOpen] = useState(false);
  const [globalStyles, setGlobalStyles] = useState(GLOBAL_STYLE_DEFAULTS);
  const [savedGlobalStyles, setSavedGlobalStyles] = useState(GLOBAL_STYLE_DEFAULTS);
  const [globalStylesSaving, setGlobalStylesSaving] = useState(false);
  const [uploadingSplashImage, setUploadingSplashImage] = useState(false);
  const [mediaItems, setMediaItems] = useState([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [mediaPickerField, setMediaPickerField] = useState(null);
  const [navLogoPickerOpen, setNavLogoPickerOpen] = useState(false);
  const [splashPickerOpen, setSplashPickerOpen] = useState(false);
  const [openHeroSection, setOpenHeroSection] = useState('content');

  const setHeroSectionOpen = (key, isOpen) => {
    setOpenHeroSection(isOpen ? key : null);
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/admin/builder/draft');
      const draft = data.draft || {};
      setModules(normalizeModules(draft.modules));
      setHasDraft(Boolean(data.has_draft));
      const config = draft.site_config_subset || {};
      const normalizedStyles = normalizeGlobalStyles(config);
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
    api.get('/api/admin/categories').then((data) => setServiceCategories((data.categories || []).filter((category) => category.is_service))).catch(() => setServiceCategories([]));
  }, []);

  useEffect(() => {
    if (selectedPageKey !== 'store' && !serviceCategories.some((category) => `service:${category.slug}` === selectedPageKey)) {
      setSelectedPageKey('store');
    }
  }, [selectedPageKey, serviceCategories]);

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

  const openNavLogoPicker = async () => {
    setNavLogoPickerOpen(true);
    if (!mediaLoaded) await loadMedia();
  };

  const openSplashPicker = async () => {
    setSplashPickerOpen(true);
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

  const visibleModules = modules.filter((module) => module.page_key === selectedPageKey);

  const move = (idx, dir) => {
    const next = [...modules];
    const target = idx + dir;
    if (target < 0 || target >= visibleModules.length) return;
    const currentIndex = next.findIndex((module) => module.id === visibleModules[idx].id);
    const targetIndex = next.findIndex((module) => module.id === visibleModules[target].id);
    if (currentIndex < 0 || targetIndex < 0) return;
    [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]];
    setModules(next);
    setReorderDirty(true);
  };

  const saveOrder = async () => {
    if (await persistDraft(modules, navSettings)) {
      toast.success('Orden del borrador guardado');
      setReorderDirty(false);
    }
  };

  const openNew = () => { setModalTab('edit'); setEditing({ mode: 'new', ...EMPTY_NEW, page_key: selectedPageKey, settings: defaultSettingsForType('hero') }); };
  const openEdit = (m) => {
    setModalTab('edit');
    setEditing({
      mode: 'edit',
      id: m.id,
      page_key: m.page_key || 'store',
      type: m.type,
      settings: m.type === 'hero' ? { ...m.settings, content_position: normalizeHeroPosition(m.settings?.content_position) } : { ...m.settings },
      active: m.active,
    });
  };

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
    const nextStyles = normalizeGlobalStyles(globalStyles);
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

  const uploadSplashImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    setUploadingSplashImage(true);
    try {
      const data = await api.upload('/api/admin/site-config/splash-image', form);
      setGlobalStyles((current) => ({ ...current, store_splash_image_url: data.image_url || '' }));
      toast.success('Imagen subida', 'La URL quedó en la configuración del splash. Guarda los estilos para conservarla en el borrador.');
    } catch (err) {
      toast.error('No se pudo subir la imagen', err.message);
    } finally {
      setUploadingSplashImage(false);
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
        settingsOut[f.key] = ['number', 'range'].includes(f.type) ? Number(raw) : f.type === 'checkbox' ? Boolean(raw) : raw;
        if (f.type === 'media' && f.mediaPlacementKey) {
          settingsOut[f.mediaPlacementKey] = normalizeMediaPlacement(editing.settings[f.mediaPlacementKey]);
        }
      }
      if (editing.type === 'hero') settingsOut.content_position = normalizeHeroPosition(editing.settings.content_position);
      const nextModule = { id: editing.id || `draft-${Date.now()}`, page_key: editing.page_key || selectedPageKey, type: editing.type, settings: settingsOut, active: editing.active };
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
  const customCodeEnabled = Boolean(editing?.settings?.custom_code_enabled);
  const heroVisualMode = editing?.type === 'hero' ? editing.settings.visual_mode : null;
  const heroTextScaleTarget = editing?.type === 'hero' ? editing.settings.text_scale_target : '';
  const isSettingVisible = (field) => {
    if (!editing) return false;
    if (customCodeEnabled && !['custom_code_enabled', 'custom_code'].includes(field.key)) return false;
    if (field.type === 'custom_code' && !customCodeEnabled) return false;
    if (field.key === 'shadow_intensity' && !editing.settings.shadow_enabled) return false;
    if (field.key === 'shadow_color' && !editing.settings.shadow_enabled) return false;
    if (field.key === 'overlay_enabled' && editing.type === 'hero' && editing.settings.hero_style === 'side-panel') return false;
    if (field.key === 'content_background_color' && editing.type === 'hero' && editing.settings.hero_style !== 'side-panel') return false;
    if (field.key === 'product_slug' && heroVisualMode !== 'product') return false;
    if (field.key === 'visual_image_url' && heroVisualMode !== 'image') return false;
    if (field.key.endsWith('_text_scale') && field.key !== `${heroTextScaleTarget}_text_scale`) return false;
    return true;
  };
  const renderSettingField = (f) => {
    if (!isSettingVisible(f)) return null;
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
      {f.type === 'color' ? (
        <div className="color-field">
          <input
            className="color-picker"
            type="color"
            value={pickerColor(editing.settings[f.key], f.defaultValue || '#FFFFFF')}
            onChange={(e) => setSetting(f.key, e.target.value.toUpperCase())}
            aria-label={`Elegir ${f.label.toLowerCase()}`}
          />
          <input
            className="input color-hex-input"
            type="text"
            value={editing.settings[f.key] ?? f.defaultValue ?? ''}
            onChange={(e) => setSetting(f.key, e.target.value.toUpperCase())}
            placeholder={f.defaultValue || '#FFFFFF'}
          />
          <span className="color-preview" style={{ background: pickerColor(editing.settings[f.key], f.defaultValue || '#FFFFFF') }} aria-hidden="true" />
        </div>
      ) : f.type === 'range' ? (
        <div className="builder-hero-range-field">
          <input
            type="range"
            min={f.min}
            max={f.max}
            step={f.step || 1}
            value={Number(editing.settings[f.key] ?? f.defaultValue ?? f.min)}
            onChange={(e) => setSetting(f.key, Number(e.target.value))}
            aria-label={f.label}
          />
          <strong>{Number(editing.settings[f.key] ?? f.defaultValue ?? f.min)}{f.unit || '%'}</strong>
        </div>
      ) : f.type === 'media' ? (
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
  };
  const heroFields = new Map((schema?.settings || []).map((field) => [field.key, field]));

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

      <div className="builder-page-switcher">
        <div>
          <strong>Diseño de página</strong>
          <span>{selectedPageKey === 'store' ? 'Tienda principal y catálogo de productos' : 'Landing independiente para un servicio'}</span>
        </div>
        <select className="select" value={selectedPageKey} onChange={(event) => setSelectedPageKey(event.target.value)} aria-label="Seleccionar diseño de página">
          <option value="store">Tienda principal · productos</option>
          {serviceCategories.map((category) => <option key={category.id} value={`service:${category.slug}`}>Servicio · {category.name}</option>)}
        </select>
      </div>
      {selectedPageKey !== 'store' && serviceCategories.length === 0 && (
        <p className="builder-page-switcher-empty">Primero crea una categoría y márcala como servicio para diseñar su landing.</p>
      )}

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
        {visibleModules.map((m, idx) => {
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
            disableDown={idx === visibleModules.length - 1}
          />;
        })}
        {visibleModules.length === 0 && <Empty title="Sin módulos" description={selectedPageKey === 'store' ? 'La tienda no muestra nada. Crea el primer módulo.' : 'Esta landing todavía no tiene módulos. Agrega un bloque HTML personalizado o el diseño que necesites.'} action={<button className="btn btn-primary" onClick={openNew}>+ Nuevo módulo</button>} />}
      </div>

      <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 16 }}>
        Tip: el store público lee los módulos activos de cada diseño desde <code>/api/public/page-modules</code>.
        Cambios se ven al refrescar el browser (cache de 60s).
      </p>

      <Modal
        open={globalStylesOpen}
        onClose={closeGlobalStyles}
        size="lg"
        title="Estilos globales de la tienda"
        footer={
          <>
            <button className="btn" type="button" onClick={() => setGlobalStyles(GLOBAL_STYLE_DEFAULTS)} disabled={globalStylesSaving}>Restaurar valores</button>
            <button className="btn" type="button" onClick={closeGlobalStyles} disabled={globalStylesSaving}>Cancelar</button>
            <button className="btn btn-primary" type="button" onClick={saveGlobalStyles} disabled={globalStylesSaving}>{globalStylesSaving ? <span className="spinner" /> : 'Guardar en borrador'}</button>
          </>
        }
      >
        <GlobalStoreStyles values={globalStyles} onChange={(key, value) => setGlobalStyles((current) => ({ ...current, [key]: value }))} onOpenSplashPicker={openSplashPicker} onUploadSplashImage={uploadSplashImage} uploadingSplashImage={uploadingSplashImage} />
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
          onOpenLogoPicker={openNavLogoPicker}
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
            {editing?.type === 'hero' && <button className={`btn${modalTab === 'visual' ? ' btn-primary' : ''}`} type="button" onClick={() => setModalTab('visual')} disabled={saving}>Editor visual</button>}
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
            {editing.type === 'hero' ? (
              <div className="builder-settings-sections">
                {HERO_SETTING_GROUPS.map((group) => {
                  if (group.key === 'visual' && editing.settings.hero_style === 'side-panel') return null;
                  const fields = group.fields
                    .map((key) => heroFields.get(key))
                    .filter(Boolean)
                    .filter(isSettingVisible);
                  if (fields.length === 0) return null;
                  const isOpen = openHeroSection === group.key;
                  return (
                    <div className={`builder-settings-section${isOpen ? ' is-open' : ''}`} key={group.key}>
                      <button
                        className="builder-settings-section-toggle"
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={`builder-settings-section-${group.key}`}
                        onClick={() => setHeroSectionOpen(group.key, !isOpen)}
                      >
                        <span className="builder-settings-section-heading">
                          <strong>{group.label}</strong>
                          <small>{group.description}</small>
                        </span>
                        <span className="builder-settings-section-summary">{heroGroupSummary(group.key, editing.settings)}</span>
                        <span className="builder-settings-section-icon" aria-hidden="true">{isOpen ? '−' : '+'}</span>
                      </button>
                      {isOpen && <div className="builder-settings-section-body" id={`builder-settings-section-${group.key}`}>{fields.map(renderSettingField)}</div>}
                    </div>
                  );
                })}
              </div>
            ) : schema.settings.map(renderSettingField)}
          </form> : modalTab === 'visual' ? (
            <HeroVisualEditor settings={editing.settings} onChange={(value) => setSetting('content_position', value)} />
          ) : <LiveStorePreview modules={[editing]} pageKey={editing.page_key || selectedPageKey} navSettings={navSettings} globalStyles={globalStyles} title="Vista previa real del módulo" />}
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
        <LiveStorePreview modules={modules} pageKey={selectedPageKey} navSettings={navSettings} globalStyles={globalStyles} />
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

      <MediaPickerModal
        open={navLogoPickerOpen}
        onClose={() => setNavLogoPickerOpen(false)}
        items={mediaItems}
        loading={mediaLoading}
        value={navSettings.navbar_custom_logo_url || ''}
        title="Elegir logo personalizado"
        onSelect={(url) => {
          setNavValue('navbar_custom_logo_url', url);
          setNavLogoPickerOpen(false);
        }}
      />

      <MediaPickerModal
        open={splashPickerOpen}
        onClose={() => setSplashPickerOpen(false)}
        items={mediaItems}
        loading={mediaLoading}
        value={globalStyles.store_splash_image_url || ''}
        title="Elegir imagen o GIF para el splash"
        onSelect={(url) => {
          setGlobalStyles((current) => ({ ...current, store_splash_image_url: url }));
          setSplashPickerOpen(false);
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
