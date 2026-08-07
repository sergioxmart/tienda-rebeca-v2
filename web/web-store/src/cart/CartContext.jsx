// CartContext: maneja el carrito en sessionStorage.
//
// Shape de un item:
//   {
//     variant_id:       number,
//     product_id:       number,
//     product_slug:     string,
//     product_name:     string,
//     sku:              string|null,
//     attribute_summary: string,    // "Color: Rojo · Talla: M"
//     unit_price:       number,    // COP, ya con override si lo tiene la variant
//     image_url:        string|null,
//     qty:              number,
//   }
//
// Acciones:
//   addItem(item)          -> si ya existe (mismo variant_id), suma qty
//   updateQty(variant_id, qty)  -> setea qty; si qty<=0, remueve
//   removeItem(variant_id)
//   clear()

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { loadCart, saveCart } from './cartStorage.js';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const location = useLocation();
  const [items, setItems] = useState(() => loadCart());
  const itemsRef = useRef(items);
  const validationRun = useRef(0);

  useEffect(() => { itemsRef.current = items; }, [items]);

  useEffect(() => { saveCart(items); }, [items]);

  const revalidate = useCallback(async () => {
    const current = itemsRef.current;
    if (current.length === 0) return { removed: 0, updated: 0 };
    const run = ++validationRun.current;
    try {
      const result = await api.validateCart(current.map((item) => ({
        variant_id: item.variant_id,
        product_id: item.product_id,
      })));
      if (run !== validationRun.current) return { removed: 0, updated: 0 };
      const latestById = new Map(result.items.map((item) => [Number(item.variant_id), item]));
      let removed = 0;
      let updated = 0;
      const next = current.flatMap((item) => {
        const latest = latestById.get(Number(item.variant_id));
        const stock = Number(latest?.stock);
        if (!latest || !Number.isFinite(stock) || stock <= 0) {
          removed += 1;
          return [];
        }
        const qty = Math.min(Math.max(1, Number(item.qty) || 1), stock);
        const refreshed = { ...item, ...latest, qty };
        if (JSON.stringify(refreshed) !== JSON.stringify(item)) updated += 1;
        return [refreshed];
      });
      setItems(next);
      return { removed, updated };
    } catch {
      // Un error temporal de red no destruye el carrito local.
      return { removed: 0, updated: 0 };
    }
  }, []);

  // Revalidar al montar (incluye F5) y cada vez que cambia la entrada de
  // navegación. Así se detectan cambios hechos desde el admin mientras el
  // cliente estaba recorriendo la tienda.
  useEffect(() => { revalidate(); }, [location.key, revalidate]);

  const addItem = useCallback((newItem) => {
    setItems((cur) => {
      const existing = cur.find((i) => i.variant_id === newItem.variant_id);
      const requested = Math.max(1, Number(newItem.qty) || 1);
      const stock = Number(newItem.stock);
      const hasStockLimit = Number.isFinite(stock) && stock >= 0;
      if (existing) {
        const nextQty = hasStockLimit
          ? Math.min(stock, existing.qty + requested)
          : existing.qty + requested;
        if (nextQty <= existing.qty) return cur;
        return cur.map((i) =>
          i.variant_id === newItem.variant_id ? { ...i, ...newItem, qty: nextQty } : i
        );
      }
      if (hasStockLimit && stock < requested) {
        if (stock <= 0) return cur;
        return [...cur, { ...newItem, qty: stock }];
      }
      return [...cur, { ...newItem, qty: requested }];
    });
  }, []);

  const updateQty = useCallback((variantId, qty) => {
    setItems((cur) => {
      if (qty <= 0) return cur.filter((i) => i.variant_id !== variantId);
      return cur.map((i) => {
        if (i.variant_id !== variantId) return i;
        const requested = Number(qty) || 1;
        const stock = Number(i.stock);
        const safeQty = Number.isFinite(stock) && stock >= 0 ? Math.min(requested, stock) : requested;
        return safeQty <= 0 ? null : { ...i, qty: safeQty };
      }).filter(Boolean);
    });
  }, []);

  const removeItem = useCallback((variantId) => {
    setItems((cur) => cur.filter((i) => i.variant_id !== variantId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const totals = useMemo(() => {
    const subtotal = items.reduce((acc, i) => acc + i.unit_price * i.qty, 0);
    const count = items.reduce((acc, i) => acc + i.qty, 0);
    return { subtotal, count };
  }, [items]);

  const value = { items, addItem, updateQty, removeItem, clear, revalidate, ...totals };
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart debe usarse dentro de CartProvider');
  return ctx;
}
