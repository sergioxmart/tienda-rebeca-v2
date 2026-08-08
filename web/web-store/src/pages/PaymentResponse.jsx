import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';

const COPY = {
  approved: {
    title: 'Pago recibido',
    message: 'Mercado Pago reportó el pago. Estamos confirmándolo en el servidor.',
  },
  pending: {
    title: 'Pago pendiente',
    message: 'Mercado Pago dejó la operación pendiente. Te informaremos cuando cambie el estado.',
  },
  failure: {
    title: 'Pago no aprobado',
    message: 'La operación no fue aprobada. El pedido conserva su estado pendiente y puedes intentarlo nuevamente.',
  },
};

export default function PaymentResponse() {
  const [params] = useSearchParams();
  const rawStatus = params.get('status') || params.get('collection_status') || 'pending';
  const status = rawStatus === 'approved' ? 'approved' : ['rejected', 'cancelled', 'failure'].includes(rawStatus) ? 'failure' : 'pending';
  const copy = COPY[status];
  const orderNumber = params.get('external_reference');

  return (
    <div className="center" style={{ maxWidth: 520, margin: '0 auto' }}>
      <h1>{copy.title}</h1>
      {orderNumber && <p>Pedido <strong>{orderNumber}</strong></p>}
      <p>{copy.message}</p>
      <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>
        Esta página de retorno no modifica el pedido. La confirmación definitiva
        se realiza mediante una notificación segura de Mercado Pago.
      </p>
      <Link to="/" className="btn btn-primary">Volver a la tienda</Link>
    </div>
  );
}

