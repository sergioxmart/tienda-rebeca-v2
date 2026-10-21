// Catálogo: lista de productos con filtros.
//
// Query string maneja todo el estado de los filtros (deep-link friendly).
// Soporta:
//   - q (texto)
//   - category (slug)
//   - attribute=slug:value  (uno por atributo)
//   - price_min, price_max
//   - sort (newest, oldest, price_asc, price_desc)
//   - page

import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useSite } from '../site/SiteContext.jsx';
import ProductCard from '../components/ProductCard.jsx';
import Empty from '../components/Empty.jsx';
import { formatCOP } from '../components/Price.jsx';
import ServiceLanding from './ServiceLanding.jsx';
import { MODULE_RENDERERS } from '../modules/registry.js';
import { usePageModules } from '../modules/PageModulesContext.jsx';

function parseAttributeParams(searchParams) {
  // Devuelve { [attr_slug]: [value1, value2, ...] }
  const result = {};
  for (const [k, v] of searchParams.entries()) {
    if (k === 'attribute') {
      const [slug, ...rest] = v.split(':');
      const value = rest.join(':');
      if (!result[slug]) result[slug] = [];
      result[slug].push(value);
    }
  }
  return result;
}

function buildQueryString(params, attributes) {
  const q = new URLSearchParams();
  if (params.q) q.set('q', params.q);
  if (params.category) q.set('category', params.category);
  if (params.price_min) q.set('price_min', params.price_min);
  if (params.price_max) q.set('price_max', params.price_max);
  if (params.sort) q.set('sort', params.sort);
  if (params.page) q.set('page', params.page);
  for (const [slug, values] of Object.entries(attributes)) {
    for (const v of values) {
      q.append('attribute', `${slug}:${v}`);
    }
  }
  return q.toString();
}

function paginationItems(page, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, 'end-ellipsis', totalPages];
  if (page >= totalPages - 3) {
    return [1, 'start-ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, 'start-ellipsis', page - 1, page, page + 1, 'end-ellipsis', totalPages];
}

export default function Catalog() {
  const { category: categorySlug } = useParams();
  const { site, categories } = useSite();
  const { modules: pageModules } = usePageModules();
  const [searchParams, setSearchParams] = useSearchParams();

  // Cargar atributos (para el filter bar)
  const [attributes, setAttributes] = useState([]);
  useEffect(() => {
    api.attributes().then(setAttributes).catch(() => {});
  }, []);

  // Filtros actuales (state local + URL)
  const filters = useMemo(() => ({
    q: searchParams.get('q') || '',
    category: searchParams.get('category') || categorySlug || '',
    price_min: searchParams.get('price_min') || '',
    price_max: searchParams.get('price_max') || '',
    sort: searchParams.get('sort') || 'newest',
    page: searchParams.get('page') || '1',
  }), [searchParams, categorySlug]);

  const activeAttributes = useMemo(() => parseAttributeParams(searchParams), [searchParams]);
  const categoryObj = categories.find((c) => c.slug === filters.category);
  const productCategories = categories.filter((category) => !category.is_service);

  // Productos
  const [data, setData] = useState({ products: [], pagination: { total: 0, page: 1, limit: 12, total_pages: 0 } });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (categoryObj?.is_service) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const qs = buildQueryString(filters, activeAttributes);
    api.products(qs)
      .then((d) => setData(d))
      .catch(() => setData({ products: [], pagination: { total: 0, page: 1, limit: 12, total_pages: 0 } }))
      .finally(() => setLoading(false));
  }, [filters, activeAttributes, categoryObj]);

  // Helpers para mutar URL
  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value === '' || value === null || value === undefined) next.delete(key);
    else next.set(key, value);
    if (key !== 'page') next.delete('page');
    setSearchParams(next);
  };

  const toggleAttribute = (attrSlug, value) => {
    const next = new URLSearchParams(searchParams);
    const all = next.getAll('attribute');
    next.delete('attribute');
    const found = all.find((a) => a === `${attrSlug}:${value}`);
    if (!found) all.push(`${attrSlug}:${value}`);
    for (const a of all) next.append('attribute', a);
    next.delete('page');
    setSearchParams(next);
  };

  const clearFilters = () => setSearchParams(new URLSearchParams());
  const goToPage = (page) => {
    setParam('page', String(page));
    window.setTimeout(() => document.getElementById('catalog-products')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  const totalProducts = Number(data.pagination.total) || 0;
  const pageSize = Number(data.pagination.limit) || 12;
  const totalPages = Math.max(0, Number(data.pagination.total_pages ?? data.pagination.pages) || 0);
  const currentPage = Math.min(totalPages || 1, Math.max(1, Number(data.pagination.page) || 1));
  const firstProduct = totalProducts ? (currentPage - 1) * pageSize + 1 : 0;
  const lastProduct = Math.min(totalProducts, currentPage * pageSize);

  if (categoryObj?.is_service) return <ServiceLanding />;

  return (
    <div>
      {categoryObj?.is_custom_page && (pageModules || []).map((module) => {
        if (module.type === 'footer' || module.active === false) return null;
        const Renderer = MODULE_RENDERERS[module.type];
        if (!Renderer) return null;
        return <Renderer key={module.id} settings={module.settings || {}} />;
      })}
      <div className="catalog-heading">
        <div><span className="section-kicker">Catálogo {site?.site_name || 'Rebeca Andrade'}</span><h1>{categoryObj ? categoryObj.name : 'Todos los productos'}</h1></div>
        <span className="catalog-heading-note">Encuentra piezas pensadas para acompañarte</span>
      </div>

      <div className="filter-bar">
        <div className="row" style={{ marginBottom: 12 }}>
          <input className="search" placeholder="Buscar productos…"
                 value={filters.q} onChange={(e) => setParam('q', e.target.value)} />
          <select value={filters.sort} onChange={(e) => setParam('sort', e.target.value)}>
            <option value="newest">Más recientes</option>
            <option value="oldest">Más antiguos</option>
            <option value="price_asc">Menor precio</option>
            <option value="price_desc">Mayor precio</option>
          </select>
          <input type="number" placeholder="Precio mín" min={0} step={1} style={{ width: 110 }}
                 value={filters.price_min} onChange={(e) => setParam('price_min', e.target.value)} />
          <input type="number" placeholder="Precio máx" min={0} step={1} style={{ width: 110 }}
                 value={filters.price_max} onChange={(e) => setParam('price_max', e.target.value)} />
        </div>

        {/* Chips de categorías */}
        {productCategories.length > 0 && (
          <div className="row" style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>Categoría:</span>
            <Link to="/categoria" className={`chip ${!filters.category ? 'active' : ''}`}>Todas</Link>
            {productCategories.map((c) => (
              <Link key={c.id} to={`/categoria/${c.slug}`}
                    className={`chip ${filters.category === c.slug ? 'active' : ''}`}>
                {c.name}
              </Link>
            ))}
          </div>
        )}

        {/* Chips de atributos (los que el usuario aplicó) */}
        {Object.entries(activeAttributes).length > 0 && (
          <div className="row" style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>Filtros:</span>
            {Object.entries(activeAttributes).flatMap(([slug, values]) =>
              values.map((v) => (
                <button key={`${slug}-${v}`} className="chip active" onClick={() => toggleAttribute(slug, v)}>
                  {slug}: {v} ✕
                </button>
              ))
            )}
            <button className="chip" onClick={clearFilters}>Limpiar todo</button>
          </div>
        )}

        {/* Atributos disponibles */}
        {attributes.length > 0 && (
          <details>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--color-muted)', marginBottom: 8 }}>
              Filtrar por atributos ({attributes.length})
            </summary>
            {attributes.map((attr) => (
              <div key={attr.id} className="row" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--color-muted)', minWidth: 100 }}>{attr.name}:</span>
                {(attr.values || []).map((val) => {
                  const isActive = (activeAttributes[attr.slug] || []).includes(val.value);
                  return (
                    <button key={val.id} type="button"
                            className={`chip ${isActive ? 'active' : ''}`}
                            onClick={() => toggleAttribute(attr.slug, val.value)}>
                      {val.value}
                    </button>
                  );
                })}
              </div>
            ))}
          </details>
        )}
      </div>

      {loading ? (
        <div className="center"><span className="spinner" /></div>
      ) : data.products.length === 0 ? (
        <Empty title="Sin resultados" description="Prueba quitar algunos filtros." />
      ) : (
        <>
          <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>
            {totalProducts > 0
              ? `Mostrando ${firstProduct}–${lastProduct} de ${totalProducts} producto${totalProducts !== 1 ? 's' : ''}`
              : '0 productos'}
          </p>
          <div className="product-grid" id="catalog-products">
            {data.products.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
          {totalPages > 1 && (
            <nav className="catalog-pagination-wrap" aria-label="Paginación del catálogo">
              <p className="catalog-pagination-summary">Página {currentPage} de {totalPages}</p>
              <div className="catalog-pagination">
                <button className="btn" type="button" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Página anterior">
                  Anterior
                </button>
                {paginationItems(currentPage, totalPages).map((item, index) => (
                  typeof item === 'number' ? (
                    <button
                      key={item}
                      className={`btn${item === currentPage ? ' btn-primary' : ''}`}
                      type="button"
                      onClick={() => goToPage(item)}
                      aria-label={`Página ${item}`}
                      aria-current={item === currentPage ? 'page' : undefined}
                      disabled={item === currentPage}
                    >
                      {item}
                    </button>
                  ) : (
                    <span key={`${item}-${index}`} className="catalog-pagination-ellipsis" aria-hidden="true">…</span>
                  )
                ))}
                <button className="btn" type="button" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages} aria-label="Página siguiente">
                  Siguiente
                </button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
