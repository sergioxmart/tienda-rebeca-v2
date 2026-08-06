// Configuración del sitio. Tabla key/value editable.
//
// Backend:
//   GET   /api/admin/site-config   → { config: { key: value, ... } }  (o array)
//   PATCH /api/admin/site-config   body: { [key]: value, ... }        (merge)

import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import Empty from '../components/Empty.jsx';

const KNOWN_KEYS = [
  { key: 'store_name',           label: 'Nombre de la tienda',   type: 'text',     placeholder: 'TechStore Colombia' },
  { key: 'store_email',          label: 'Email de contacto',     type: 'email',    placeholder: '[email protected]' },
  { key: 'store_phone',          label: 'Teléfono / WhatsApp',   type: 'tel',      placeholder: '+57 300 000 0000' },
  { key: 'store_address',        label: 'Dirección',             type: 'text',     placeholder: 'Calle 100 #15-20, Bogotá' },
  { key: 'currency',             label: 'Moneda',                type: 'text',     placeholder: 'COP' },
  { key: 'tax_id',               label: 'NIT / Identificación',  type: 'text',     placeholder: '900.000.000-1' },
  { key: 'instagram',            label: 'Instagram URL',         type: 'url',      placeholder: 'https://instagram.com/...' },
  { key: 'facebook',             label: 'Facebook URL',          type: 'url',      placeholder: 'https://facebook.com/...' },
  { key: 'wompi_public_key',     label: 'Wompi (public key)',    type: 'text',     placeholder: 'pub_test_...' },
  { key: 'epayco_public_key',    label: 'ePayco (public key)',   type: 'text',     placeholder: '...' },
  { key: 'free_shipping_min',    label: 'Envío gratis desde (COP)', type: 'number', placeholder: '150000' },
];

export default function SiteConfig() {
  const toast = useToast();
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get('/api/admin/site-config');
        // Aceptar tanto { config: { key: value } } como { [key]: value }
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
        Datos de contacto, redes sociales y claves públicas de pago. Las claves secretas van en variables de entorno, no acá.
      </p>

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
