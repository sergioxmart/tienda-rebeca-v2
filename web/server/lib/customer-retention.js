// Políticas de retención del portal de clientes.
//
// Hay dos procesos separados:
// 1. anti-spam: elimina cuentas creadas durante checkout que nunca lograron
//    un pago exitoso y que ya no tienen pedidos en curso;
// 2. purga: anonimiza pedidos históricos, elimina fallidos y borra cuentas
//    desactivadas cuyo plazo de 30 días terminó.

import { tx } from './db.js';
import { env } from './env.js';
import { log } from './logger.js';
import { releaseOrderStock } from './order-stock.js';

const SUCCESSFUL_ORDER_STATUSES = ['paid', 'processing', 'shipped', 'delivered', 'refunded'];
const IN_PROGRESS_ORDER_STATUSES = ['pending', 'paid', 'processing', 'shipped'];

function placeholders(values, start = 1) {
  return values.map((_, index) => `$${start + index}`).join(', ');
}

export async function cleanupGhostAccounts() {
  return tx(async (client) => {
    const successfulStatuses = placeholders(SUCCESSFUL_ORDER_STATUSES);
    const inProgressStatuses = placeholders(IN_PROGRESS_ORDER_STATUSES, SUCCESSFUL_ORDER_STATUSES.length + 1);
    const { rows: accounts } = await client.query(
      `SELECT c.id
         FROM customer_accounts c
        WHERE c.deleted_at IS NULL
          AND c.created_at <= NOW() - INTERVAL '12 hours'
          AND NOT EXISTS (
            SELECT 1 FROM orders o
             WHERE o.client_id = c.id
               AND (
                 o.status IN (${successfulStatuses})
                 OR EXISTS (
                   SELECT 1 FROM payments p
                    WHERE p.order_id = o.id AND p.status = 'approved'
                 )
               )
          )
          AND NOT EXISTS (
            SELECT 1 FROM orders o
             WHERE o.client_id = c.id
               AND o.status IN (${inProgressStatuses})
               AND NOT EXISTS (
                 SELECT 1 FROM payments p
                  WHERE p.order_id = o.id AND p.status IN ('declined', 'error', 'voided')
               )
          )
        ORDER BY c.id
        FOR UPDATE OF c SKIP LOCKED
        LIMIT 100`,
      [...SUCCESSFUL_ORDER_STATUSES, ...IN_PROGRESS_ORDER_STATUSES],
    );

    let deletedAccounts = 0;
    let deletedOrders = 0;
    for (const account of accounts) {
      // Los pedidos expirados/cancelados y los pagos fallidos son basura de
      // checkout. Los pedidos exitosos nunca entran en este worker.
      const { rows: failedOrders } = await client.query(
        `SELECT o.id, o.order_number
           FROM orders o
          WHERE o.client_id = $1
            AND (
              o.status IN ('expired', 'cancelled')
              OR EXISTS (
                SELECT 1 FROM payments p
                 WHERE p.order_id = o.id AND p.status IN ('declined', 'error', 'voided')
              )
            )
            AND NOT EXISTS (
              SELECT 1 FROM payments p
               WHERE p.order_id = o.id AND p.status = 'approved'
            )
          FOR UPDATE OF o`,
        [account.id],
      );
      for (const order of failedOrders) {
        await releaseOrderStock(client, order.id, order.order_number);
        await client.query('DELETE FROM orders WHERE id = $1', [order.id]);
      }
      deletedOrders += failedOrders.length;
      const removed = await client.query(
        'DELETE FROM customer_accounts WHERE id = $1 AND deleted_at IS NULL',
        [account.id],
      );
      deletedAccounts += removed.rowCount;
    }
    return { deletedAccounts, deletedOrders };
  });
}

export async function purgeDeletedAccounts() {
  return tx(async (client) => {
    const { rows: accounts } = await client.query(
      `SELECT id
         FROM customer_accounts
        WHERE deleted_at IS NOT NULL
          AND deletion_expires_at <= NOW()
        ORDER BY id
        FOR UPDATE SKIP LOCKED
        LIMIT 100`,
    );

    let purgedAccounts = 0;
    let deletedFailedOrders = 0;
    let anonymizedOrders = 0;
    for (const account of accounts) {
      const { rows: failedOrders } = await client.query(
        `SELECT o.id, o.order_number
           FROM orders o
          WHERE o.client_id = $1
            AND (
              o.status IN ('expired', 'cancelled')
              OR EXISTS (
                SELECT 1 FROM payments p
                 WHERE p.order_id = o.id AND p.status IN ('declined', 'error', 'voided')
              )
            )
            AND NOT EXISTS (
              SELECT 1 FROM payments p
               WHERE p.order_id = o.id AND p.status = 'approved'
            )
          FOR UPDATE OF o`,
        [account.id],
      );
      for (const order of failedOrders) {
        await releaseOrderStock(client, order.id, order.order_number);
        await client.query('DELETE FROM orders WHERE id = $1', [order.id]);
      }
      deletedFailedOrders += failedOrders.length;

      // El pedido histórico se conserva para estadísticas, inventario y
      // contabilidad, pero ya no conserva datos personales ni user_id.
      const anonymized = await client.query(
        `UPDATE orders
            SET client_id = NULL,
                customer_email = 'deleted-' || id || '@anon.techstore.invalid',
                customer_name = 'Cliente eliminado',
                customer_phone = '',
                shipping_address = '{}'::jsonb,
                notes = '',
                updated_at = NOW()
          WHERE client_id = $1
         RETURNING id`,
        [account.id],
      );
      anonymizedOrders += anonymized.rowCount;

      const removed = await client.query('DELETE FROM customer_accounts WHERE id = $1', [account.id]);
      purgedAccounts += removed.rowCount;
    }
    return { purgedAccounts, deletedFailedOrders, anonymizedOrders };
  });
}

export function startCustomerRetentionWorker() {
  const ghostSeconds = Math.max(60, Number(env.CUSTOMER_GHOST_SWEEP_SECONDS) || 3600);
  const purgeSeconds = Math.max(3600, Number(env.CUSTOMER_PURGE_SWEEP_SECONDS) || 86400);
  let ghostRunning = false;
  let purgeRunning = false;

  const sweepGhosts = async () => {
    if (ghostRunning) return;
    ghostRunning = true;
    try {
      const result = await cleanupGhostAccounts();
      if (result.deletedAccounts > 0) log.info('customer anti-spam cleanup', result);
    } catch (error) {
      log.error('customer anti-spam cleanup failed', error.message);
    } finally {
      ghostRunning = false;
    }
  };

  const sweepPurged = async () => {
    if (purgeRunning) return;
    purgeRunning = true;
    try {
      const result = await purgeDeletedAccounts();
      if (result.purgedAccounts > 0) log.info('customer retention purge', result);
    } catch (error) {
      log.error('customer retention purge failed', error.message);
    } finally {
      purgeRunning = false;
    }
  };

  sweepGhosts();
  sweepPurged();
  const ghostTimer = setInterval(sweepGhosts, ghostSeconds * 1000);
  const purgeTimer = setInterval(sweepPurged, purgeSeconds * 1000);
  ghostTimer.unref?.();
  purgeTimer.unref?.();
  return { ghostTimer, purgeTimer };
}
