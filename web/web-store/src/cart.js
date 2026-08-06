// Estado del carrito (en memoria + sessionStorage).

const STORAGE_KEY = 'rebeca.cart';

function load() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(items) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
}

const listeners = new Set();
let items = load();

export function getCart() { return items.slice(); }

export function addToCart(product, { sizeId = null, sizeLabel = null, colorId = null, colorLabel = null, qty = 1 } = {}) {
  // La key incluye color: si el cliente quiere el mismo producto en 2 colores
  // distintos, son 2 lineas separadas en el carrito.
  const colorKey = colorId == null ? 'no-color' : String(colorId);
  const key = `sale:${product.id}:${colorKey}:${sizeId || 'none'}`;
  const existing = items.find((i) => i.key === key);
  if (existing) {
    existing.qty += qty;
  } else {
    items.push({
      key,
      id: product.id,
      name: product.name,
      collection_name: product.collection_name,
      // Con promo vigente, el precio efectivo (final_price viene del server).
      price: product.promo ? Number(product.promo.final_price) : Number(product.price) || 0,
      type: 'venta',
      size_id: sizeId,
      size_label: sizeLabel,
      color_id: colorId,
      color_label: colorLabel,
      qty,
    });
  }
  save(items);
  notify();
}

export function addRentalToCart({ product, reservation, startDate, endDate, pickupDate, colorId = null, colorLabel = null }) {
  const key = `rental:${reservation.id}`;
  if (items.some((item) => item.key === key)) return;
  items.push({
    key,
    id: product.id,
    reservation_id: reservation.id,
    name: product.name,
    collection_name: product.collection_name,
    price: Number(reservation.price) || 0,
    type: reservation.requested_type,
    size_label: reservation.size_label || null,
    color_id: colorId,
    color_label: colorLabel,
    start_date: startDate,
    end_date: endDate,
    pickup_date: pickupDate,
    qty: 1,
  });
  save(items);
  notify();
}

export function removeFromCart(key) {
  items = items.filter((i) => i.key !== key);
  save(items);
  notify();
}

export function clearCart() {
  items = [];
  save(items);
  notify();
}

export function cartTotal() {
  return items.reduce((s, i) => s + i.price * i.qty, 0);
}

export function cartCount() {
  return items.reduce((s, i) => s + i.qty, 0);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn();
}
