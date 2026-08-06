// Helpers de sessionStorage para el carrito.

const KEY = 'techstore.cart.v1';

export function loadCart() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCart(items) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* ignore quota */
  }
}

export function clearCart() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
