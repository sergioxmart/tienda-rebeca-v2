// Configuración del sitio. Tabla key/value editable + upload de logo.
//
// Backend:
//   GET    /api/admin/site-config          → { config: { key: value, ... } }
//   PATCH  /api/admin/site-config          body: { [key]: value, ... }
//   POST   /api/admin/site-config/logo     multipart: file
//   DELETE /api/admin/site-config/logo

import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';

const KNOWN_KEYS = [
  { key: 'site_name',          label: 'Nombre de la tienda',     type: 'text',     placeholder: 'TechStore Colombia' },
  { key: 'contact_email',      label: 'Email de contacto',       type: 'email',    placeholder: '[email protected]' },
  { key: 'contact_phone',      label: 'Teléfono / WhatsApp',     type: 'tel',      placeholder: '+57 300 000 0000' },
  { key: 'contact_address',    label: 'Dirección',               type: 'text',     placeholder: 'Calle 100 #15-20, Bogotá' },
  { key: 'currency',           label: 'Moneda',                  type: 'text',     placeholder: 'COP' },
  { key: 'tax_id',             label: 'NIT / Identificación',    type: 'text',     placeholder: '900.000.000-1' },
  { key: 'contact_instagram',  label: 'Instagram URL',           type: 'url',      placeholder: 'https://instagram.com/...' },
  { key: 'contact_facebook',   label: 'Facebook URL',            type: 'url',      placeholder: 'https://facebook.com/...' },
  { key: 'wompi_public_key',   label: 'Wompi (public key)',      type: 'text',     placeholder: 'pub_test_...' },
  { key: 'epayco_public_key',  label: 'ePayco (public key)',     type: 'text',     placeholder: '...' },
  { key: 'free_shipping_min',  label: 'Envío gratis desde (COP)', type: 'number', placeholder: '150000' },
];

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function pickerColor(value) {
  return HEX_COLOR_RE.test(value || '') ? value : '#0F2A47';
}

function ColorField({ id, label, value, onChange }) {
  return (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      <div className="color-field">
        <input id={id} className="color-picker" type="color" value={pickerColor(value)} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label={`Elegir ${label.toLowerCase()}`} />
        <input className="input color-hex-input" type="text" inputMode="text" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} placeholder="#0F2A47" />
        <span className="color-preview" style={{ background: pickerColor(value) }} aria-hidden="true" />
      </div>
    </div>
  );
}

export default function SiteConfig() {
  const toast = useToast();
  const fileRef = useRef(null);
  const bgFileRef = useRef(null);
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBackground, setUploadingBackground] = useState(false);
  const [logoVersion, setLogoVersion] = useState(() => Date.now());

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get('/api/admin/site-config');
        const cfg = data.config || data;
        setConfig(typeof cfg === 'object' && !Array.isArray(cfg) ? cfg : {});
      } catch (err) {
        toast.error('No se pudo cargar la configuración', err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  const setKey = (k, v) => setConfig((cur) => ({ ...cur, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await api.patch('/api/admin/site-config', config);
      toast.success('Configuración guardada');
    } catch (err) {
      toast.error('No se pudo guardar', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif']);
    if (!allowedTypes.has(file.type)) {
      toast.error('Usa una imagen PNG, JPG, WebP o AVIF');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast.error('La imagen no puede pesar más de 3 MB');
      return;
    }
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const data = await api.upload('/api/admin/site-config/logo', fd);
      setConfig((cur) => ({ ...cur, logo_url: data.logo_url }));
      setLogoVersion(Date.now());
      toast.success('Logo actualizado');
    } catch (err) {
      toast.error('No se pudo subir el logo', err.message);
    } finally {
      setUploadingLogo(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleLogoDelete = async () => {
    if (!confirm('¿Quitar el logo?')) return;
    try {
      await api.delete('/api/admin/site-config/logo');
      setConfig((cur) => ({ ...cur, logo_url: null }));
      toast.success('Logo eliminado');
    } catch (err) {
      toast.error('No se pudo eliminar', err.message);
    }
  };

  const handleBackgroundUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif']);
    if (!allowedTypes.has(file.type)) {
      toast.error('Usa una imagen PNG, JPG, WebP o AVIF');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error('La imagen de fondo no puede pesar más de 8 MB');
      return;
    }
    setUploadingBackground(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const data = await api.upload('/api/admin/site-config/login-background', fd);
      setConfig((cur) => ({ ...cur, admin_login_bg_image_url: data.image_url, admin_login_bg_mode: 'image' }));
      toast.success('Fondo actualizado');
    } catch (err) {
      toast.error('No se pudo subir el fondo', err.message);
    } finally {
      setUploadingBackground(false);
      if (bgFileRef.current) bgFileRef.current.value = '';
    }
  };

  const handleBackgroundDelete = async () => {
    try {
      await api.delete('/api/admin/site-config/login-background');
      setConfig((cur) => ({ ...cur, admin_login_bg_image_url: null, admin_login_bg_mode: 'solid' }));
      toast.success('Imagen de fondo eliminada');
    } catch (err) {
      toast.error('No se pudo eliminar el fondo', err.message);
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>;

  const logoSrc = config.logo_url
    ? `${config.logo_url}${config.logo_url.includes('?') ? '&' : '?'}v=${logoVersion}`
    : null;

  return (
    <div>
      <div className="page-header">
        <h1>Configuración del sitio</h1>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <span className="spinner" /> : 'Guardar cambios'}
        </button>
      </div>

      <p style={{ color: 'var(--color-muted)' }}>
        Datos de contacto, redes sociales, branding y claves públicas de pago. Las claves secretas van en variables de entorno, no acá.
      </p>

      <div className="config-card">
        <div className="config-card-heading"><div><h3>Fondo del login</h3><p>Personaliza la pantalla de acceso con un color, un degradado o una imagen.</p></div><span className="config-card-icon">✦</span></div>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="admin_login_bg_mode">Tipo de fondo</label>
            <select id="admin_login_bg_mode" className="select" value={config.admin_login_bg_mode || 'solid'} onChange={(e) => setKey('admin_login_bg_mode', e.target.value)}>
              <option value="solid">Color sólido</option>
              <option value="gradient">Degradado</option>
              <option value="image">Imagen con capa de color</option>
            </select>
          </div>
          <ColorField id="admin_login_bg" label="Color principal" value={String(config.admin_login_bg || '#0F2A47')} onChange={(value) => setKey('admin_login_bg', value)} />
        </div>
        {config.admin_login_bg_mode === 'gradient' && <ColorField id="admin_login_bg_secondary" label="Color secundario" value={String(config.admin_login_bg_secondary || '#FF6B35')} onChange={(value) => setKey('admin_login_bg_secondary', value)} />}
        <div className="background-upload-row">
          <input ref={bgFileRef} type="file" accept=".png,.jpg,.jpeg,.webp,.avif,image/png,image/jpeg,image/webp,image/avif" style={{ display: 'none' }} onChange={handleBackgroundUpload} />
          <button className="btn" type="button" onClick={() => bgFileRef.current?.click()} disabled={uploadingBackground}>{uploadingBackground ? <span className="spinner" /> : 'Subir imagen de fondo'}</button>
          {config.admin_login_bg_image_url && <button className="btn btn-danger" type="button" onClick={handleBackgroundDelete}>Quitar imagen</button>}
          {config.admin_login_bg_image_url && <span className="help">Imagen cargada. Se usa cuando el tipo es “Imagen con capa de color”.</span>}
        </div>
      </div>

      {/* Logo */}
      <div className="config-card">
        <h3 style={{ marginTop: 0 }}>Logo</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{
            width: 120, height: 80,
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#F3F4F6',
            overflow: 'hidden',
          }}>
            {logoSrc
              ? <img src={logoSrc} alt="Logo de la tienda" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              : <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>Sin logo</span>
            }
          </div>
          <div>
            <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.webp,.avif,image/png,image/jpeg,image/webp,image/avif" style={{ display: 'none' }} onChange={handleLogoUpload} />
            <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={uploadingLogo}>
              {uploadingLogo ? <span className="spinner" /> : (config.logo_url ? 'Cambiar logo' : 'Subir logo')}
            </button>
            {config.logo_url && (
              <button className="btn btn-danger" style={{ marginLeft: 8 }} onClick={handleLogoDelete}>
                Quitar
              </button>
            )}
            <div className="help" style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 8 }}>
              PNG, JPG, WebP o AVIF. Máximo 3 MB. Recomendado: 400×120 o similar.
            </div>
          </div>
        </div>
      </div>

      <div className="config-card">
        {KNOWN_KEYS.map((field) => {
          return (
            <div className="form-group" key={field.key}>
              <label htmlFor={field.key}>{field.label}</label>
              <input
                id={field.key}
                className="input"
                type={field.type}
                placeholder={field.placeholder}
                value={config[field.key] ?? ''}
                onChange={(e) => setKey(field.key, e.target.value)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
