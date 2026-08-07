// Form de producto (crear/editar). Tres secciones:
//   1. Datos básicos
//   2. Atributos aplicables (M2M)
//   3. Variantes (con su propio editor inline)
//
// Al crear: solo guardamos el producto. Después, en el mismo form, ya con
// id, editamos atributos y variantes. Esto evita el problema de "crear
// variantes sin product_id" y mantiene el flujo simple.

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import Confirm from '../components/Confirm.jsx';
import Modal from '../components/Modal.jsx';
import VariantEditor from '../components/VariantEditor.jsx';
import MoneyInput from '../components/MoneyInput.jsx';

const EMPTY = {
  name: '', slug: '', sku: '', description: '', brand: '',
  category_id: '', base_price: '', compare_at: '',
  featured: false, active: true,
};

function integerPrice(value) {
  if (value === null || value === undefined || value === '') return '';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(Math.round(parsed)) : '';
}

function ChevronIcon({ direction }) {
  return <svg className="icon-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d={direction === 'up' ? 'm6 14 6-6 6 6' : 'm6 10 6 6 6-6'} /></svg>;
}

function slugify(s) {
  return s.toString().toLowerCase().trim()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export default function ProductForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState(EMPTY);
  const [productId, setProductId] = useState(id ? Number(id) : null);
  const [categories, setCategories] = useState([]);
  const [allAttributes, setAllAttributes] = useState([]);
  const [productAttributes, setProductAttributes] = useState([]);
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selectedAttributeId, setSelectedAttributeId] = useState(null);
  const [movingAttribute, setMovingAttribute] = useState(false);

  // Cargar catálogos
  useEffect(() => {
    (async () => {
      try {
        setLoadError('');
        const [c, a] = await Promise.all([
          api.get('/api/admin/categories'),
          api.get('/api/admin/attributes'),
        ]);
        setCategories(c.categories || []);
        setAllAttributes(a.attributes || []);
      } catch (err) {
        toast.error('No se pudieron cargar categorías/atributos', err.message);
      }
    })();
  }, [toast]);

  // Cargar producto si es edit
  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const [{ product }, vs] = await Promise.all([
          api.get(`/api/admin/products/${id}`),
          api.get(`/api/admin/products/${id}/variants`),
        ]);
        setForm({
          name: product.name,
          slug: product.slug,
          sku: product.sku || '',
          description: product.description || '',
          brand: product.brand || '',
          category_id: product.category_id,
          base_price: integerPrice(product.base_price),
          compare_at: integerPrice(product.compare_at),
          featured: product.featured,
          active: product.active,
        });
        setProductAttributes((product.attributes || []).sort((a, b) => a.display_order - b.display_order || a.attribute_name.localeCompare(b.attribute_name)));
        setVariants(vs.variants || []);
      } catch (err) {
        setLoadError(err.message || 'Error desconocido');
        toast.error('No se pudo cargar el producto', err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isEdit, navigate, toast]);

  const setField = (key, value) => setForm((cur) => ({ ...cur, [key]: value }));

  const handleSave = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      const body = {
        name: form.name,
        slug: form.slug || slugify(form.name),
        sku: form.sku || null,
        description: form.description,
        brand: form.brand,
        category_id: Number(form.category_id),
        base_price: Number(form.base_price),
        compare_at: form.compare_at === '' ? null : Number(form.compare_at),
        featured: !!form.featured,
        active: !!form.active,
      };
      if (productId) {
        await api.patch(`/api/admin/products/${productId}`, body);
        toast.success('Producto actualizado');
      } else {
        const { product } = await api.post('/api/admin/products', body);
        setProductId(product.id);
        toast.success('Producto creado', 'Ahora puedes agregar atributos y variantes.');
        // Limpia form a estado "recién creado" (cambia la URL al edit)
        navigate(`/products/${product.id}`, { replace: true });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'product_already_exists') toast.error('Ya existe un producto con ese slug o SKU');
        else toast.error('No se pudo guardar', err.message);
      } else {
        toast.error('No se pudo guardar', err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/api/admin/products/${productId}`);
      toast.success('Producto eliminado');
      navigate('/products', { replace: true });
    } catch (err) {
      toast.error('No se pudo eliminar', err.message);
    }
  };

  // --- Atributos ---------------------------------------------------------
  const productAttributeIds = productAttributes.map((item) => item.attribute_id);
  const orderedProductAttributes = productAttributes
    .map((item) => allAttributes.find((attribute) => attribute.id === item.attribute_id))
    .filter(Boolean);

  const toggleAttribute = async (attrId) => {
    if (!productId) {
      toast.warning('Guarda el producto primero para vincular atributos');
      return;
    }
    const linked = productAttributeIds.includes(attrId);
    try {
      if (linked) {
        await api.delete(`/api/admin/products/${productId}/attributes/${attrId}`);
        setProductAttributes((cur) => cur.filter((item) => item.attribute_id !== attrId));
      } else {
        const { product_attribute } = await api.post(`/api/admin/products/${productId}/attributes`, {
          attribute_id: attrId,
          display_order: productAttributes.length,
        });
        setProductAttributes((cur) => [...cur, product_attribute || {
          attribute_id: attrId,
          display_order: cur.length,
          is_required: true,
        }]);
      }
    } catch (err) {
      toast.error('No se pudo actualizar el atributo', err.message);
    }
  };

  const moveProductAttribute = async (direction) => {
    const selectedIndex = productAttributes.findIndex((item) => item.attribute_id === selectedAttributeId);
    const targetIndex = selectedIndex + direction;
    if (selectedIndex < 0 || targetIndex < 0 || targetIndex >= productAttributes.length) return;

    const next = [...productAttributes];
    [next[selectedIndex], next[targetIndex]] = [next[targetIndex], next[selectedIndex]];
    const normalized = next.map((item, index) => ({ ...item, display_order: index }));
    setProductAttributes(normalized);
    setMovingAttribute(true);
    try {
      await Promise.all(normalized.map((item) => api.patch(
        `/api/admin/products/${productId}/attributes/${item.attribute_id}`,
        { display_order: item.display_order },
      )));
      toast.success('Orden de atributos actualizado');
    } catch (err) {
      toast.error('No se pudo cambiar el orden', err.message);
    } finally { setMovingAttribute(false); }
  };

  // --- Variantes ---------------------------------------------------------
  const reloadVariants = async () => {
    if (!productId) return;
    try {
      const { variants: vs } = await api.get(`/api/admin/products/${productId}/variants`);
      setVariants(vs);
    } catch (err) {
      toast.error('No se pudieron recargar las variantes', err.message);
    }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>;
  }

  if (loadError) {
    return (
      <div className="state-card state-card-error">
        <h1>No se pudo abrir el producto</h1>
        <p>{loadError}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button className="btn" onClick={() => navigate('/products')}>← Volver a productos</button>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Reintentar</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>{isEdit || productId ? 'Editar producto' : 'Nuevo producto'}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => navigate('/products')}>← Volver</button>
          {productId && (
            <button className="btn btn-danger" onClick={() => setDeleting(true)}>Eliminar</button>
          )}
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner" /> : 'Guardar'}
          </button>
        </div>
      </div>

      <section className="editor-card">
        <div className="editor-section-heading">
          <div><span className="eyebrow">Ficha del producto</span><h2>Información principal</h2></div>
          <span className="form-hint">Los campos con datos básicos alimentan el catálogo público.</span>
        </div>
      <form onSubmit={handleSave}>
        <div className="form-group">
          <label>Nombre</label>
          <input className="input" required maxLength={200}
                 value={form.name} onChange={(e) => setField('name', e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Slug <span style={{ color: 'var(--color-muted)' }}>(opcional)</span></label>
            <input className="input" maxLength={80} pattern="[a-z0-9-]+"
                   value={form.slug} onChange={(e) => setField('slug', e.target.value)} />
          </div>
          <div className="form-group">
            <label>SKU <span style={{ color: 'var(--color-muted)' }}>(opcional)</span></label>
            <input className="input" maxLength={80}
                   value={form.sku} onChange={(e) => setField('sku', e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label>Categoría</label>
          <select className="select" required value={form.category_id}
                  onChange={(e) => setField('category_id', e.target.value)}>
            <option value="">— Selecciona —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Precio base (COP)</label>
            <MoneyInput required placeholder="0" value={form.base_price}
                        onChange={(value) => setField('base_price', value)} />
          </div>
          <div className="form-group">
            <label>Precio comparativo <span style={{ color: 'var(--color-muted)' }}>(opcional, tachado)</span></label>
            <MoneyInput placeholder="0" value={form.compare_at}
                        onChange={(value) => setField('compare_at', value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Marca</label>
            <input className="input" maxLength={100}
                   value={form.brand} onChange={(e) => setField('brand', e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label>Descripción</label>
          <textarea className="textarea" maxLength={5000} rows={4}
                    value={form.description} onChange={(e) => setField('description', e.target.value)} />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="checkbox">
              <input type="checkbox" checked={form.featured} onChange={(e) => setField('featured', e.target.checked)} />
              Destacado
            </label>
          </div>
          <div className="form-group">
            <label className="checkbox">
              <input type="checkbox" checked={form.active} onChange={(e) => setField('active', e.target.checked)} />
              Activo
            </label>
          </div>
        </div>
      </form>
      </section>

      {productId && (
        <>
          <section className="editor-card">
          <div className="editor-section-heading">
            <div><span className="eyebrow">Configuración</span><h2>Atributos aplicables</h2></div>
            <p className="form-hint">Marca los atributos que el cliente puede elegir (color, talla, etc.).</p>
          </div>
          {allAttributes.length === 0 ? (
            <div className="empty" style={{ padding: 20 }}>No hay atributos creados. <a href="/attributes">Crear uno</a></div>
          ) : (
            <div>
              {orderedProductAttributes.length > 0 && <>
                <div className="order-toolbar">
                  <span>{selectedAttributeId ? 'Atributo seleccionado' : 'Selecciona un atributo para cambiar su posición'}</span>
                  <div className="order-toolbar-actions">
                    <button type="button" className="btn btn-sm" aria-label="Subir atributo" title="Subir" disabled={!selectedAttributeId || movingAttribute || productAttributes.findIndex((item) => item.attribute_id === selectedAttributeId) <= 0} onClick={() => moveProductAttribute(-1)}><ChevronIcon direction="up" /></button>
                    <button type="button" className="btn btn-sm" aria-label="Bajar atributo" title="Bajar" disabled={!selectedAttributeId || movingAttribute || productAttributes.findIndex((item) => item.attribute_id === selectedAttributeId) === productAttributes.length - 1} onClick={() => moveProductAttribute(1)}><ChevronIcon direction="down" /></button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                  {orderedProductAttributes.map((a) => (
                    <label key={a.id} className={`badge ${selectedAttributeId === a.id ? 'active' : ''}`} style={{ cursor: 'pointer', padding: '6px 12px' }} onClick={() => setSelectedAttributeId(a.id)}>
                      <input type="checkbox" className="checkbox" checked onChange={() => toggleAttribute(a.id)} />
                      {a.name}
                    </label>
                  ))}
                </div>
              </>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {allAttributes.filter((a) => !productAttributeIds.includes(a.id)).map((a) => (
                  <label key={a.id} className="badge" style={{ cursor: 'pointer', padding: '6px 12px' }}>
                    <input type="checkbox" className="checkbox" checked={false} onChange={() => toggleAttribute(a.id)} />
                    {a.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          </section>

          <section className="editor-card">
          <VariantEditor
            productId={productId}
            variants={variants}
            attributes={orderedProductAttributes}
            onChange={reloadVariants}
          />
          </section>
        </>
      )}

      <Confirm
        open={deleting}
        title="¿Eliminar producto?"
        message="Se borrarán también todas las variantes asociadas. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        danger
        onCancel={() => setDeleting(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
