// Notificaciones transaccionales por correo usando Resend.
// La API key nunca se expone al frontend ni se incluye en el pedido.

import { Resend } from 'resend';
import { env } from './env.js';

let client = null;

function getClient() {
  if (!env.RESEND_ENABLED || !env.RESEND_API_KEY) return null;
  client ||= new Resend(env.RESEND_API_KEY);
  return client;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatCOP(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Math.round(Number(value) || 0));
}

function itemRows(items) {
  return items.map((item) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#172536;">
        <strong>${escapeHtml(item.productName)}</strong>
        ${item.sku ? `<br><small style="color:#6d7a88;">SKU: ${escapeHtml(item.sku)}</small>` : ''}
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:center;color:#172536;">${item.quantity}</td>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right;color:#172536;">${formatCOP(item.unitPrice * item.quantity)}</td>
    </tr>`).join('');
}

function confirmationHtml({ order, items, shippingAddress }) {
  const name = escapeHtml(order.customer_name || 'cliente');
  const orderNumber = escapeHtml(order.order_number);
  const address = escapeHtml([shippingAddress.address, shippingAddress.city].filter(Boolean).join(' · '));
  const notes = escapeHtml(order.notes || shippingAddress.notes || '');
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background:#f7f8fa;font-family:Arial,sans-serif;color:#172536;">
    <div style="max-width:620px;margin:0 auto;padding:28px;border:1px solid #e2e8ef;border-radius:18px;background:#ffffff;">
      <p style="margin:0 0 8px;color:#ff6b35;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">TechStore</p>
      <h1 style="margin:0 0 12px;color:#0f2a47;font-size:26px;">¡Gracias por tu pedido!</h1>
      <p style="margin:0 0 20px;line-height:1.6;">Hola ${name}, recibimos tu pedido <strong>${orderNumber}</strong>. Quedó registrado como pendiente mientras completas o se confirma el pago.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead><tr>
          <th style="padding:8px 0;border-bottom:2px solid #0f2a47;text-align:left;color:#0f2a47;">Producto</th>
          <th style="padding:8px 0;border-bottom:2px solid #0f2a47;text-align:center;color:#0f2a47;">Cantidad</th>
          <th style="padding:8px 0;border-bottom:2px solid #0f2a47;text-align:right;color:#0f2a47;">Total</th>
        </tr></thead>
        <tbody>${itemRows(items)}</tbody>
      </table>
      <div style="margin-top:18px;padding-top:14px;border-top:1px solid #e5e7eb;text-align:right;">
        <strong style="color:#0f2a47;font-size:18px;">Total: ${formatCOP(order.total)}</strong>
      </div>
      <div style="margin-top:20px;padding:14px;border-radius:12px;background:#f7f9fb;font-size:13px;line-height:1.6;">
        <strong>Datos de entrega</strong><br>
        ${address || 'Dirección pendiente'}
        ${notes ? `<br><span style="color:#6d7a88;">Notas: ${notes}</span>` : ''}
      </div>
      <p style="margin:22px 0 0;color:#6d7a88;font-size:12px;line-height:1.5;">Conserva este correo como comprobante de recepción. Te informaremos cuando el pago sea confirmado.</p>
    </div>
  </body>
</html>`;
}

export async function sendOrderConfirmationEmail({ order, items, shippingAddress = {} }) {
  const resend = getClient();
  if (!resend) return { sent: false, skipped: true };

  const { data, error } = await resend.emails.send({
    from: `${env.RESEND_FROM_NAME} <${env.RESEND_FROM_EMAIL}>`,
    to: [order.customer_email],
    subject: `Confirmación de pedido ${order.order_number}`,
    html: confirmationHtml({ order, items, shippingAddress }),
  });
  if (error) {
    throw new Error(error.message || 'Resend no pudo enviar el correo.');
  }
  return { sent: true, id: data?.id || null };
}

export async function sendCustomerOtpEmail({ email, code }) {
  const resend = getClient();
  if (!resend) return { sent: false, skipped: true };

  const { data, error } = await resend.emails.send({
    from: `${env.RESEND_FROM_NAME} <${env.RESEND_FROM_EMAIL}>`,
    to: [email],
    subject: 'Tu código de acceso a TechStore',
    html: `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background:#f7f8fa;font-family:Arial,sans-serif;color:#172536;">
    <div style="max-width:520px;margin:0 auto;padding:28px;border:1px solid #e2e8ef;border-radius:18px;background:#fff;text-align:center;">
      <p style="margin:0 0 8px;color:#ff6b35;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">TechStore</p>
      <h1 style="margin:0 0 12px;color:#0f2a47;font-size:26px;">Tu código de acceso</h1>
      <p style="line-height:1.6;">Usa este PIN para ingresar a tu cuenta. Es válido durante 5 minutos.</p>
      <div style="margin:24px 0;padding:18px;border-radius:14px;color:#0f2a47;background:#edf6ff;font-size:34px;font-weight:800;letter-spacing:.22em;">${code}</div>
      <p style="margin:0;color:#6d7a88;font-size:12px;line-height:1.5;">Si no solicitaste este código, puedes ignorar este mensaje.</p>
    </div>
  </body>
</html>`,
  });
  if (error) throw new Error(error.message || 'Resend no pudo enviar el código.');
  return { sent: true, id: data?.id || null };
}
