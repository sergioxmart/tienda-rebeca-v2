import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import Empty from '../components/Empty.jsx';
import './NewArrivalsOrder.css';

function ChevronIcon({ direction }) {
  return <svg className="icon-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d={direction === 'up' ? 'm6 14 6-6 6 6' : 'm6 10 6 6 6-6'} /></svg>;
}

function moveItem(items, index, direction) {
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

function byIds(items, ids) {
  const itemById = new Map(items.map((item) => [Number(item.id), item]));
  return [...ids.map((id) => itemById.get(Number(id))).filter(Boolean), ...items.filter((item) => !ids.some((id) => Number(id) === Number(item.id)))];
}

function formatCOP(value) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(value || 0));
}

export default function NewArrivalsOrder() {
  const { user } = useAuth();
  const toast = useToast();
  const canEdit = user?.role === 'admin';
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get('/api/admin/new-arrivals-order')
      .then((data) => {
        if (!cancelled) setState({ config: data.config, products: data.products || [], categories: data.categories || [], configured: data.configured });
      })
      .catch((error) => toast.error('No se pudo cargar el orden de “Lo más nuevo”', error.message))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const flatProducts = useMemo(() => state ? byIds(state.products, state.config.flat_product_ids || []) : [], [state]);
  const orderedCategories = useMemo(() => state ? byIds(state.categories, state.config.category_ids || []) : [], [state]);
  const productsByCategory = useMemo(() => {
    if (!state) return new Map();
    const groups = new Map();
    for (const product of state.products) {
      const key = product.category_id == null ? 'uncategorized' : String(product.category_id);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(product);
    }
    return groups;
  }, [state]);

  const persist = async (config) => {
    if (!canEdit || saving) return;
    setSaving(true);
    try {
      const result = await api.put('/api/admin/new-arrivals-order', { config });
      setState((current) => ({ ...current, config: result.config, configured: true }));
      toast.success('Orden guardado');
    } catch (error) {
      toast.error('No se pudo guardar el orden', error.message);
    } finally {
      setSaving(false);
    }
  };

  const moveFlatProduct = (index, direction) => {
    const ordered = moveItem(flatProducts, index, direction).map((product) => Number(product.id));
    persist({ ...state.config, flat_product_ids: ordered });
  };

  const moveCategory = (index, direction) => {
    const ordered = moveItem(orderedCategories, index, direction).map((category) => Number(category.id));
    persist({ ...state.config, category_ids: ordered });
  };

  const moveCategoryProduct = (categoryKey, orderedProducts, index, direction) => {
    const order = { ...state.config.category_product_ids };
    order[categoryKey] = moveItem(orderedProducts, index, direction).map((product) => Number(product.id));
    persist({ ...state.config, category_product_ids: order });
  };

  if (loading) return <div className="center new-arrivals-loading"><span className="spinner" /></div>;
  if (!state) return <Empty title="No se pudo cargar la organización" description="Intenta refrescar esta página." />;

  const renderProduct = (product, index, list, onMove) => (
    <article className="new-arrivals-product" key={product.id}>
      <span className="new-arrivals-position">{index + 1}</span>
      {product.image_url
        ? <img className="new-arrivals-product-image" src={product.image_url} alt="" />
        : <span className="new-arrivals-product-image is-empty" aria-hidden="true">—</span>}
      <div className="new-arrivals-product-info">
        <strong>{product.name}</strong>
        <span>{formatCOP(product.base_price)}{product.sku ? ` · ${product.sku}` : ''}</span>
      </div>
      <div className="new-arrivals-actions">
        <button type="button" className="btn btn-sm" title="Subir" aria-label={`Subir ${product.name}`} disabled={!canEdit || saving || index === 0} onClick={() => onMove(index, -1)}><ChevronIcon direction="up" /></button>
        <button type="button" className="btn btn-sm" title="Bajar" aria-label={`Bajar ${product.name}`} disabled={!canEdit || saving || index === list.length - 1} onClick={() => onMove(index, 1)}><ChevronIcon direction="down" /></button>
      </div>
    </article>
  );

  return (
    <main className="new-arrivals-page">
      <div className="page-header">
        <div><h1>Orden de Mas Nuevo</h1><p>Define el orden de los productos que aparecen en “Lo más nuevo”.</p></div>
        {saving && <span className="new-arrivals-saving">Guardando…</span>}
      </div>

      <section className="new-arrivals-mode editor-card">
        <div><strong>Agrupar por categorías</strong><p>Al activarlo, se muestran primero todos los productos de cada categoría según el orden que elijas.</p></div>
        <div className="new-arrivals-switch-wrap">
          <button type="button" className={`admin-switch ${state.config.group_by_category ? 'is-on' : ''}`} role="switch" aria-checked={state.config.group_by_category} aria-label="Agrupar por categorías" disabled={!canEdit || saving} onClick={() => persist({ ...state.config, group_by_category: !state.config.group_by_category })}><span /></button>
          <span>{state.config.group_by_category ? 'Activado' : 'Desactivado'}</span>
        </div>
      </section>

      {!canEdit && <div className="alert alert-info">Tienes acceso de solo lectura. Solo un administrador puede cambiar este orden.</div>}
      {!state.configured && <div className="alert alert-info">Aún no hay una configuración guardada. La tienda conserva su orden actual hasta que guardes un cambio.</div>}

      {!state.config.group_by_category ? (
        <section className="editor-card new-arrivals-list-section">
          <div className="new-arrivals-section-heading"><div><h2>Lista de productos</h2><p>Usa las flechas para mover cada producto. Los productos nuevos se agregan al final.</p></div><span className="badge">{flatProducts.length} productos</span></div>
          {flatProducts.length ? <div className="new-arrivals-product-list">{flatProducts.map((product, index) => renderProduct(product, index, flatProducts, moveFlatProduct))}</div>
            : <Empty title="Sin productos activos" description="Cuando haya productos activos, podrás ordenarlos aquí." />}
        </section>
      ) : (
        <section className="editor-card new-arrivals-list-section">
          <div className="new-arrivals-section-heading"><div><h2>Orden de categorías</h2><p>El orden de estas categorías define el orden de los grupos en la tienda.</p></div><span className="badge">{orderedCategories.length + (productsByCategory.has('uncategorized') ? 1 : 0)} grupos</span></div>
          {orderedCategories.map((category, categoryIndex) => {
            const key = String(category.id);
            const products = byIds(productsByCategory.get(key) || [], state.config.category_product_ids?.[key] || []);
            return <section className="new-arrivals-category" key={category.id}>
              <header className="new-arrivals-category-heading">
                <div><span className="new-arrivals-position">{categoryIndex + 1}</span><strong>{category.name}</strong>{!category.active && <span className="badge inactive">Inactiva</span>}</div>
                <div className="new-arrivals-actions">
                  <button type="button" className="btn btn-sm" title="Subir categoría" aria-label={`Subir categoría ${category.name}`} disabled={!canEdit || saving || categoryIndex === 0} onClick={() => moveCategory(categoryIndex, -1)}><ChevronIcon direction="up" /></button>
                  <button type="button" className="btn btn-sm" title="Bajar categoría" aria-label={`Bajar categoría ${category.name}`} disabled={!canEdit || saving || categoryIndex === orderedCategories.length - 1} onClick={() => moveCategory(categoryIndex, 1)}><ChevronIcon direction="down" /></button>
                </div>
              </header>
              {products.length ? <div className="new-arrivals-product-list nested">{products.map((product, index) => renderProduct(product, index, products, (i, direction) => moveCategoryProduct(key, products, i, direction)))}</div>
                : <p className="new-arrivals-empty-group">No hay productos activos en esta categoría.</p>}
            </section>;
          })}
          {productsByCategory.has('uncategorized') && (() => {
            const key = 'uncategorized';
            const products = byIds(productsByCategory.get(key), state.config.category_product_ids?.[key] || []);
            const index = orderedCategories.length;
            return <section className="new-arrivals-category" key={key}>
              <header className="new-arrivals-category-heading"><div><span className="new-arrivals-position">{index + 1}</span><strong>Sin categoría</strong></div></header>
              <div className="new-arrivals-product-list nested">{products.map((product, productIndex) => renderProduct(product, productIndex, products, (i, direction) => moveCategoryProduct(key, products, i, direction)))}</div>
            </section>;
          })()}
          {!orderedCategories.length && !productsByCategory.has('uncategorized') && <Empty title="Sin productos activos" description="Cuando haya productos activos, podrás organizarlos aquí." />}
        </section>
      )}
    </main>
  );
}
