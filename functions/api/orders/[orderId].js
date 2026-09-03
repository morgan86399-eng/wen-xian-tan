import { getOnly, json } from '../../lib/wxt/http.mjs';
import { readUserSession } from '../../lib/wxt/auth.mjs';
import { getOrderById, hasDb } from '../../lib/wxt/store.mjs';

export const onRequest = getOnly(async ({ request, env, params }) => {
  if (!hasDb(env)) return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
  const session = await readUserSession(env, request);
  if (!session.ok) return json({ error: 'UNAUTHENTICATED' }, 401);

  const orderId = String((params && params.orderId) || '').trim();
  if (!orderId) return json({ error: 'ORDER_NOT_FOUND' }, 404);

  const order = await getOrderById(env, orderId);
  if (!order || order.user_id !== session.uid) return json({ error: 'ORDER_NOT_FOUND' }, 404);

  return json({
    orderId: order.id,
    status: order.status,
    isPaid: order.status === 'PAID',
    productId: order.product_id,
    amount: order.amount,
    themes: JSON.parse(order.themes_json || '[]'),
    merchantTradeNo: order.merchant_trade_no,
    createdAt: order.created_at,
    paidAt: order.paid_at
  });
});
