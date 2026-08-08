// Reserva, libera y consolida inventario asociado a pedidos.
// Todas las funciones reciben el client de una transacción abierta.

export class InsufficientReservationError extends Error {
  constructor(items) {
    super('insufficient_stock_reservation');
    this.name = 'InsufficientReservationError';
    this.items = items;
  }
}

export async function reserveOrderStock(client, { orderId, orderNumber, items }) {
  const variantItems = items
    .filter((item) => item.variantId)
    .sort((a, b) => Number(a.variantId) - Number(b.variantId));
  const insufficient = [];

  for (const item of variantItems) {
    const { rows } = await client.query(
      `SELECT id, stock
         FROM product_variants
        WHERE id = $1
        FOR UPDATE`,
      [item.variantId],
    );
    const variant = rows[0];
    if (!variant || Number(variant.stock) < item.quantity) {
      insufficient.push({
        variant_id: Number(item.variantId),
        stock: Number(variant?.stock || 0),
        requested: item.quantity,
      });
      continue;
    }

    const before = Number(variant.stock);
    const after = before - item.quantity;
    await client.query(
      `UPDATE product_variants SET stock = $1, updated_at = NOW() WHERE id = $2`,
      [after, item.variantId],
    );
    await client.query(
      `INSERT INTO order_stock_reservations (order_id, variant_id, quantity)
       VALUES ($1, $2, $3)`,
      [orderId, item.variantId, item.quantity],
    );
    await client.query(
      `INSERT INTO inventory_movements
         (variant_id, movement_type, quantity, stock_before, stock_after, reason)
       VALUES ($1, 'out', $2, $3, $4, $5)`,
      [item.variantId, item.quantity, before, after, `Reserva temporal del pedido ${orderNumber}`],
    );
  }

  if (insufficient.length > 0) throw new InsufficientReservationError(insufficient);
}

export async function releaseOrderStock(client, orderId, orderNumber) {
  const { rows: reservations } = await client.query(
    `SELECT id, variant_id, quantity
       FROM order_stock_reservations
      WHERE order_id = $1 AND status = 'reserved'
      ORDER BY variant_id, id
      FOR UPDATE`,
    [orderId],
  );

  for (const reservation of reservations) {
    const { rows: variants } = await client.query(
      `SELECT stock FROM product_variants WHERE id = $1 FOR UPDATE`,
      [reservation.variant_id],
    );
    // Si una variante fue eliminada después de una operación administrativa,
    // la reserva se marca como liberada sin inventar stock para un registro que
    // ya no existe.
    if (variants[0]) {
      const before = Number(variants[0].stock);
      const after = before + Number(reservation.quantity);
      await client.query(
        `UPDATE product_variants SET stock = $1, updated_at = NOW() WHERE id = $2`,
        [after, reservation.variant_id],
      );
      await client.query(
        `INSERT INTO inventory_movements
           (variant_id, movement_type, quantity, stock_before, stock_after, reason)
         VALUES ($1, 'in', $2, $3, $4, $5)`,
        [reservation.variant_id, reservation.quantity, before, after, `Liberación de reserva del pedido ${orderNumber}`],
      );
    }
    await client.query(
      `UPDATE order_stock_reservations
          SET status = 'released', resolved_at = NOW()
        WHERE id = $1 AND status = 'reserved'`,
      [reservation.id],
    );
  }
  return reservations.length;
}

export async function commitOrderStock(client, orderId) {
  const { rows } = await client.query(
    `UPDATE order_stock_reservations
        SET status = 'committed', resolved_at = NOW()
      WHERE order_id = $1 AND status = 'reserved'
      RETURNING id`,
    [orderId],
  );
  return rows.length;
}
