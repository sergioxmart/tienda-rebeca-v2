// Constantes compartidas de Gestión General.

// Los 4 medios de pago. Se declaran UNA vez acá (los usan Ventas y Caja) y el
// CHECK de SQL (008/009) es quien los valida en el backend.
export const PAYMENT_METHODS = [
  { value: 'efectivo',    label: 'Efectivo' },
  { value: 'nequi',       label: 'Nequi' },
  { value: 'daviplata',   label: 'Daviplata' },
  { value: 'bancolombia', label: 'Bancolombia' },
];

export const PAYMENT_LABELS = Object.fromEntries(
  PAYMENT_METHODS.map((m) => [m.value, m.label]),
);
