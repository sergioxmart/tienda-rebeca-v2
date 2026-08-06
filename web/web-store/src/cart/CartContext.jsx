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

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadCart, saveCart } from './cartStorage.js';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => loadCart());

  useEffect(() => { saveCart(items); }, [items]);

  const addItem = useCallback((newItem) => {
    setItems((cur) => {
      const existing = cur.find((i) => i.variant_id === newItem.variant_id);
      if (existing) {
        return cur.map((i) =>
          i.variant_id === newItem.variant_id ? { ...i, qty: i.qty + (newItem.qty || 1) } : i
        );
      }
      return [...cur, { ...newItem, qty: newItem.qty || 1 }];
    });
  }, []);

  const updateQty = useCallback((variantId, qty) => {
    setItems((cur) => {
      if (qty <= 0) return cur.filter((i) => i.variant_id !== variantId);
      return cur.map((i) => i.variant_id === variantId ? { ...i, qty: Number(qty) || 1 } : i);
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

  const value = { items, addItem, updateQty, removeItem, clear, ...totals };
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart debe usarse dentro de CartProvider');
  return ctx;
}
