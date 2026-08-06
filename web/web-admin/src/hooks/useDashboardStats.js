// Métricas del negocio para el Dashboard y para el mini dashboard del Home.
// Los dos leen de acá a propósito: si una fórmula cambia, cambia en ambos y no
// se pueden contradecir.

import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

function derive({ products, reservations, media, closures }) {
  const today = new Date().toISOString().slice(0, 10);

  const publishedProducts = products.filter((p) => p.published);
  const featured = products.filter((p) => p.featured && p.published);
  const pending = reservations.filter((r) => r.status === 'pending');
  const confirmed = reservations.filter((r) => r.status === 'confirmed');
  const mediaBytes = media.reduce((acc, m) => acc + (Number(m.size_bytes) || 0), 0);
  const orphans = media.filter((m) => !m.product_id);

  const upcomingClosures = closures
    .filter((c) => String(c.end_date).slice(0, 10) >= today)
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))
    .slice(0, 5);

  const nextConfirmed = confirmed
    .filter((r) => String(r.end_date).slice(0, 10) >= today)
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))
    .slice(0, 5);

  return {
    products, reservations, media, closures,
    publishedProducts, featured, pending, confirmed,
    mediaBytes, orphans, upcomingClosures, nextConfirmed,
  };
}

export function useDashboardStats() {
  const [raw, setRaw] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.all([
      api('/api/admin/products'),
      api('/api/admin/reservations'),
      api('/api/admin/media'),
      api('/api/admin/closures'),
    ]).then(([prods, resv, media, closures]) => {
      if (!alive) return;
      if (!prods.ok || !resv.ok) {
        setErr('No se pudieron cargar las métricas.');
        return;
      }
      setRaw({
        products:     prods.data.data || [],
        reservations: resv.data.data || [],
        media:        media.ok    ? media.data.data    || [] : [],
        closures:     closures.ok ? closures.data.data || [] : [],
      });
    });
    return () => { alive = false; };
  }, []);

  const stats = useMemo(() => (raw ? derive(raw) : null), [raw]);
  return { stats, err, loading: !raw && !err };
}
