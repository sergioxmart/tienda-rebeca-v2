// Selector de variante por atributos.
//
// Props:
//   attributes: [{ id, name, slug, values: [{id, value, hex?}] }]
//   variants:   array de variants con attribute_values: [{attribute_id, attribute_value_id}]
//   selected:   { [attribute_id]: attribute_value_id }
//   onChange:   (newSelected) => void
//
// Comportamiento: para cada atributo muestra todos los valores. Marca como
// disabled los valores que NO están disponibles en ninguna variant (cuando
// combinados con los ya seleccionados). Si una combinación exacta coincide
// con una variant, esa variant queda "seleccionada" (parent la detecta).

import React, { useMemo } from 'react';

export default function VariantSelector({ attributes, variants, selected, onChange }) {
  const inStockVariants = useMemo(
    () => variants.filter((variant) => Number(variant.stock) > 0),
    [variants],
  );

  // Calcular disponibilidad: para cada (attr_id, attr_value_id), ¿hay al menos
  // una variant que matchee la selección actual si fijamos ese valor?
  const availability = useMemo(() => {
    const map = {};  // { [attr_id]: { [value_id]: bool } }
    for (const attr of attributes) {
      map[attr.id] = {};
      for (const val of attr.values) {
        // ¿alguna variant tiene este valor en este atributo Y matchea los
        // otros atributos ya seleccionados?
        const matches = inStockVariants.some((v) => {
          const hasThis = (v.attribute_values || []).some(
            (x) => x.attribute_id === attr.id && x.attribute_value_id === val.id
          );
          if (!hasThis) return false;
          // Para cada otro atributo ya seleccionado, esta variant debe tener
          // un valor correspondiente
          for (const otherAttr of attributes) {
            if (otherAttr.id === attr.id) continue;
            const selVal = selected[otherAttr.id];
            if (!selVal) continue;  // ese atributo aún no elegido, no restringe
            const hasOther = (v.attribute_values || []).some(
              (x) => x.attribute_id === otherAttr.id && x.attribute_value_id === selVal
            );
            if (!hasOther) return false;
          }
          return true;
        });
        map[attr.id][val.id] = matches;
      }
    }
    return map;
  }, [attributes, inStockVariants, selected]);

  const setValue = (attrId, valueId) => {
    onChange({ ...selected, [attrId]: valueId });
  };

  return (
    <div>
      {attributes.map((attr) => (
        <div className="attribute-group" key={`attribute-${attr.id}`}>
          <span className="label">{attr.name}</span>
          {attr.values.map((v) => {
            const isSelected = selected[attr.id] === v.id;
            const isAvailable = availability[attr.id]?.[v.id] ?? true;
            return (
              <button
                key={`value-${attr.id}-${v.id}`}
                type="button"
                className={`swatch ${isSelected ? 'selected' : ''} ${!isAvailable ? 'disabled' : ''}`}
                onClick={() => isAvailable && setValue(attr.id, v.id)}
                disabled={!isAvailable}
              >
                {attr.type === 'color' && v.hex && (
                  <span style={{
                    display: 'inline-block', width: 14, height: 14,
                    background: v.hex, borderRadius: '50%', border: '1px solid #ccc',
                  }} />
                )}
                {v.value}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
