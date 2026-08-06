// Precio de venta con promo vigente: original tachado + precio final.
// El precio final viene calculado del server (promo.final_price): la tienda
// refleja precios, nunca los decide.

import { money, productTypes } from './format.js';

export default function PriceLabel({ product: p }) {
  const t = productTypes(p);
  const parts = [];
  if (t.includes('venta')) {
    parts.push(
      p.promo ? (
        <span key="venta" className="price-promo">
          <s>{money(p.price)}</s> <strong>{money(p.promo.final_price)}</strong>
        </span>
      ) : (
        <span key="venta">{money(p.price)}</span>
      ),
    );
  }
  if (t.includes('alquiler'))       parts.push(<span key="alq">Alquiler · {money(p.rental_price)}</span>);
  if (t.includes('alquiler_nuevo')) parts.push(<span key="alqn">Como nuevo · {money(p.rental_new_price)}</span>);
  if (!parts.length) return <>—</>;
  return (
    <>
      {parts.map((el, i) => (
        <span key={el.key}>
          {i > 0 && ' · '}
          {el}
        </span>
      ))}
    </>
  );
}
