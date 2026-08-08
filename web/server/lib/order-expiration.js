// Expiración centralizada de pedidos pendientes.
//
import { tx } from './db.js';
import { env } from './env.js';
import { log } from './logger.js';
import { releaseOrderStock } from './order-stock.js';

export const ORDER_PENDING_TTL_MINUTES = Math.max(
  1,
  Number(env.ORDER_PENDING_TTL_MINUTES) || 15,
);

export async function expirePendingOrders() {
  return tx(async (client) => {
    const { rows: expiredOrders } = await client.query(
      `UPDATE orders
          SET status = 'expired', updated_at = NOW()
        WHERE status = 'pending'
          AND expires_at IS NOT NULL
          AND expires_at <= NOW()
        RETURNING id, order_number`,
    );
    let releasedReservations = 0;
    let voidedPayments = 0;
    for (const order of expiredOrders) {
      releasedReservations += await releaseOrderStock(client, order.id, order.order_number);
      const { rowCount } = await client.query(
        `UPDATE payments
            SET status = 'voided', updated_at = NOW()
          WHERE order_id = $1 AND status = 'pending'`,
        [order.id],
      );
      voidedPayments += rowCount;
    }
    return { expiredOrders: expiredOrders.length, releasedReservations, voidedPayments };
  });
}

export function startOrderExpirationWorker() {
  const sweepSeconds = Math.max(30, Number(env.ORDER_EXPIRATION_SWEEP_SECONDS) || 60);
  let running = false;

  const sweep = async () => {
    if (running) return;
    running = true;
    try {
      const result = await expirePendingOrders();
      if (result.expiredOrders > 0) log.info('expired pending orders', result);
    } catch (error) {
      log.error('order expiration sweep failed', error.message);
    } finally {
      running = false;
    }
  };

  // Corrige pedidos antiguos aunque el proceso haya estado apagado.
  sweep();
  const timer = setInterval(sweep, sweepSeconds * 1000);
  timer.unref?.();
  return timer;
}
