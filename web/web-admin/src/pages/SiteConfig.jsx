// Configuración del sitio. Tabla key/value editable + upload de logo.
//
// Backend:
//   GET    /api/admin/site-config          → { config: { key: value, ... } }
//   PATCH  /api/admin/site-config          body: { [key]: value, ... }
//   POST   /api/admin/site-config/logo     multipart: file
//   DELETE /api/admin/site-config/logo

import React, { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import Empty from '../components/Empty.jsx';

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
  { key: 'admin_login_bg',     label: 'Color de fondo del login (hex)', type: 'text', placeholder: '#0F2A47' },
];

export default function SiteConfig() {
  const toast = useToast();
  const fileRef = useRef(null);
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

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
    if (!file.type.startsWith('image/')) {
      toast.error('Solo se permiten imágenes');
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

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>;

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

      {/* Logo */}
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius)',
        padding: 20,
        marginBottom: 16,
      }}>
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
            {config.logo_url
              ? <img src={config.logo_url} alt="logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              : <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>Sin logo</span>
            }
          </div>
          <div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
            <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={uploadingLogo}>
              {uploadingLogo ? <span className="spinner" /> : (config.logo_url ? 'Cambiar logo' : 'Subir logo')}
            </button>
            {config.logo_url && (
              <button className="btn btn-danger" style={{ marginLeft: 8 }} onClick={handleLogoDelete}>
                Quitar
              </button>
            )}
            <div className="help" style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 8 }}>
              PNG, JPG o SVG. Máximo 3 MB. Recomendado: 400×120 o similar.
            </div>
          </div>
        </div>
      </div>

      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius)',
        padding: 20,
      }}>
        {KNOWN_KEYS.map((field) => (
          <div className="form-group" key={field.key}>
            <label>{field.label}</label>
            <input
              className="input"
              type={field.type}
              placeholder={field.placeholder}
              value={config[field.key] ?? ''}
              onChange={(e) => setKey(field.key, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
