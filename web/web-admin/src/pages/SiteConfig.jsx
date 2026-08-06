import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useMe } from '../hooks/useMe.js';
import { canWrite } from '../lib/permissions.js';

const FIELDS = [
  {
    key: 'site_name', label: 'Nombre del sitio', type: 'text',
    hint: 'Aparece en el header, en la pestaña del browser, en emails.',
  },
  {
    key: 'logo_url', label: 'Logo', type: 'logo',
    hint: 'Sube la imagen directamente desde tu computador, o elige una que ya esté en Media.',
  },
  {
    key: 'admin_login_bg_url', label: 'Fondo del login admin', type: 'logo',
    hint: 'Imagen de fondo del login del panel. Si lo dejas vacío, se usa el fondo crema por defecto.',
  },
  {
    key: 'contact_phone', label: 'WhatsApp (formato API)', type: 'text',
    hint: 'Para el link wa.me. Código de país + número, sin + ni espacios. Ej: 50212345678',
  },
  {
    key: 'contact_phone_display', label: 'WhatsApp (display)', type: 'text',
    hint: 'Lo que ven las clientas. Ej: +502 1234 5678',
  },
  {
    key: 'contact_instagram', label: 'Instagram', type: 'text',
    hint: 'Sin @. Ej: rebeca.andrade',
  },
  {
    key: 'contact_facebook', label: 'Facebook', type: 'text',
    hint: 'Sin URL completa. Ej: rebeca.andrade',
  },
  {
    key: 'contact_address_lines', label: 'Dirección (una línea por renglón)', type: 'lines',
    hint: 'Línea 1: nombre del local. Línea 2: calle. Línea 3: ciudad, etc.',
  },
  {
    key: 'business_hours_weekday', label: 'Horarios (Lun a Sáb)', type: 'text',
    hint: 'Default: "Lunes a Sábado · 9:00 – 19:00"',
  },
  {
    key: 'business_hours_holiday', label: 'Horarios (Domingos y festivos)', type: 'text',
    hint: 'Default: "Domingos y festivos · 10:00 – 17:00"',
  },
  {
    key: 'whatsapp_message_template', label: 'Plantilla mensaje WhatsApp', type: 'text',
    hint: 'Variables: {product_name}, {collection}, {client_name}',
  },
];

export default function SiteConfig() {
  const me = useMe();
  const canEdit = me ? canWrite('site_config', me.role) : true;
  const [values, setValues] = useState(null);
  const [media, setMedia] = useState([]);
  const [err, setErr] = useState('');
  const [savedAt, setSavedAt] = useState(null);
  const [pending, setPending] = useState(false);

  async function load() {
    const [cfg, med] = await Promise.all([
      api('/api/admin/site-config'),
      api('/api/admin/media'),
    ]);
    if (cfg.ok) {
      const map = {};
      for (const row of cfg.data.data) map[row.key] = row.value;
      setValues(map);
    } else setErr(cfg.data?.error || 'Error al cargar');
    if (med.ok) setMedia(med.data.data);
  }
  useEffect(() => { load(); }, []);

  function setField(k, v) {
    setValues((p) => ({ ...p, [k]: v }));
  }

  async function save() {
    setPending(true);
    setErr('');
    const updates = FIELDS.map((f) => ({
      key: f.key,
      value: values[f.key] ?? null,
    }));
    const r = await api('/api/admin/site-config', { method: 'PATCH', body: { updates } });
    setPending(false);
    if (r.ok) {
      setSavedAt(new Date().toLocaleTimeString());
    } else {
      setErr(r.data?.error || 'Error al guardar');
    }
  }

  if (!values) return <div style={{ padding: 40, color: 'var(--gray-500)' }}>Cargando…</div>;

  const logoUrl = values.logo_url;
  const images = media.filter((m) => m.kind === 'image' && !m.url.startsWith('data:'));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1>Configuración del sitio</h1>
          <p className="sub">Logo, contacto, horarios y plantilla de WhatsApp.</p>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {savedAt && <span style={{ fontSize: 13, color: 'var(--success)' }}>✓ Guardado a las {savedAt}</span>}
            <button className="btn" onClick={save} disabled={pending}>
              {pending ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        )}
      </div>

      {err && <div className="placeholder-card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', marginBottom: 16 }}>{err}</div>}

      {!canEdit && (
        <div className="placeholder-card" style={{ marginBottom: 16, background: 'var(--gray-50)', color: 'var(--gray-700)' }}>
          Modo solo lectura — no puedes modificar la configuración del sitio.
        </div>
      )}

      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
      <div className="placeholder-card" style={{ marginBottom: 24 }}>
        <h2>Identidad</h2>
        <p>Cómo se ve el sitio (logo + nombre).</p>
        <div style={{ marginTop: 16 }}>
          {FIELDS.filter((f) => ['site_name', 'logo_url', 'admin_login_bg_url'].includes(f.key)).map((f) => (
            <Field key={f.key} field={f} value={values[f.key]} onChange={(v) => setField(f.key, v)} images={images} />
          ))}
        </div>
      </div>

      <div className="placeholder-card" style={{ marginBottom: 24 }}>
        <h2>Contacto y redes</h2>
        <p>WhatsApp, Instagram, Facebook, dirección.</p>
        <div style={{ marginTop: 16 }}>
          {FIELDS.filter((f) => f.key.startsWith('contact_')).map((f) => (
            <Field key={f.key} field={f} value={values[f.key]} onChange={(v) => setField(f.key, v)} />
          ))}
        </div>
      </div>

      <div className="placeholder-card" style={{ marginBottom: 24 }}>
        <h2>Horarios</h2>
        <p>Por defecto: 9-19 de lunes a sábado, 10-17 festivos. Edita los textos libremente.</p>
        <div style={{ marginTop: 16 }}>
          {FIELDS.filter((f) => f.key.startsWith('business_hours_')).map((f) => (
            <Field key={f.key} field={f} value={values[f.key]} onChange={(v) => setField(f.key, v)} />
          ))}
        </div>
      </div>

      <div className="placeholder-card">
        <h2>Plantilla de WhatsApp</h2>
        <p>El mensaje que se manda cuando una clienta toca el botón de WhatsApp desde un producto.</p>
        <div style={{ marginTop: 16 }}>
          {FIELDS.filter((f) => f.key === 'whatsapp_message_template').map((f) => (
            <Field key={f.key} field={f} value={values[f.key]} onChange={(v) => setField(f.key, v)} />
          ))}
        </div>
        <div style={{ marginTop: 12, padding: 12, background: 'var(--gray-50)', borderRadius: 8, fontSize: 13 }}>
          <strong>Preview:</strong>{' '}
          <span style={{ color: 'var(--gray-700)' }}>
            {(values.whatsapp_message_template || 'Hola, me interesa información sobre {product_name} ({collection}).')
              .replace('{product_name}', 'Vestido Aurora')
              .replace('{collection}', 'Vestidos de Novia')
              .replace('{client_name}', 'María')}
          </span>
        </div>
      </div>
      </fieldset>
    </div>
  );
}

// Campo de imagen: sube un archivo local directamente (se guarda en Media y
// se asigna la URL), o permite elegir una imagen ya subida.
function ImageField({ field, value, onChange, images }) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr('');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('alt_text', field.label);
    const r = await api('/api/admin/media', { method: 'POST', body: fd });
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
    if (r.ok) onChange(r.data.data.url);
    else setErr(r.data?.error || 'Error al subir la imagen');
  }

  return (
    <div className="form-row">
      <label>{field.label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <ImagePreview url={value} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label className="btn secondary" style={{ cursor: 'pointer' }}>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                onChange={onFile}
                disabled={uploading}
                style={{ display: 'none' }}
              />
              {uploading ? 'Subiendo…' : '⬆ Subir desde el computador'}
            </label>
            {value && (
              <button type="button" className="btn secondary" onClick={() => onChange(null)}>
                Quitar
              </button>
            )}
          </div>
          <select
            value={value || ''}
            onChange={(e) => onChange(e.target.value || null)}
          >
            <option value="">— O elegir una imagen ya subida —</option>
            {images.map((m) => (
              <option key={m.id} value={m.url}>{m.alt_text || m.product_name || 'Sin nombre'} — {m.url.split('/').pop()}</option>
            ))}
          </select>
        </div>
      </div>
      {err && <div className="form-hint" style={{ color: 'var(--danger)' }}>{err}</div>}
      <div className="form-hint">{field.hint}</div>
    </div>
  );
}

function ImagePreview({ url }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [url]);
  if (!url || broken) {
    return (
      <div style={{ width: 80, height: 80, borderRadius: 8, border: '1px dashed var(--border-strong)', display: 'grid', placeItems: 'center', fontSize: 10, textAlign: 'center', padding: 4, color: broken ? 'var(--danger)' : 'var(--gray-500)' }}>
        {broken ? 'archivo no encontrado' : 'sin imagen'}
      </div>
    );
  }
  return (
    <div style={{ width: 80, height: 80, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', background: '#fff' }}>
      <img src={url} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={() => setBroken(true)} />
    </div>
  );
}

function Field({ field, value, onChange, images }) {
  if (field.type === 'logo') {
    return <ImageField field={field} value={value} onChange={onChange} images={images} />;
  }
  if (field.type === 'lines') {
    const arr = Array.isArray(value) ? value : [];
    return (
      <div className="form-row">
        <label>{field.label}</label>
        <textarea
          rows={3}
          value={arr.join('\n')}
          onChange={(e) => onChange(e.target.value.split('\n').filter((l) => l.trim()))}
        />
        <div className="form-hint">{field.hint}</div>
      </div>
    );
  }
  return (
    <div className="form-row">
      <label>{field.label}</label>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder={field.hint}
      />
      <div className="form-hint">{field.hint}</div>
    </div>
  );
}
