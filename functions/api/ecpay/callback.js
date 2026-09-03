import { route } from '../../lib/wxt/http.mjs';
import { getEcpayConfig, verifyCheckMacValue } from '../../lib/wxt/ecpay.mjs';
import {
  getOrderByTradeNo,
  recordPaymentEvent,
  markOrderPaid,
  grantCreditsForOrder,
  hasDb
} from '../../lib/wxt/store.mjs';
import { getProduct } from '../../lib/wxt/products.mjs';
import { sha256Hex } from '../../lib/security/token.mjs';

export const onRequest = route(async ({ request, env }) => {
  if (!hasDb(env)) return new Response('0|NO_DB', { status: 503 });

  const formData = await request.formData();
  const params = Object.fromEntries(formData.entries());
  const config = getEcpayConfig(env);

  const valid = await verifyCheckMacValue(params, config.hashKey, config.hashIV);
  if (!valid) return new Response('0|CheckMacValue Error', { status: 400 });

  const tradeNo = String(params.MerchantTradeNo || '');
  const rtnCode = String(params.RtnCode || '');
  const eventId = `${tradeNo}:${rtnCode}:${String(params.TradeNo || params.PaymentDate || '')}`;

  const order = await getOrderByTradeNo(env, tradeNo);
  if (!order) return new Response('0|ORDER_NOT_FOUND', { status: 404 });

  const payloadHash = await sha256Hex(JSON.stringify(params));
  const isNew = await recordPaymentEvent(env, {
    provider: 'ecpay',
    eventId,
    orderId: order.id,
    payloadHash
  });

  if (!isNew) return new Response('1|OK', { status: 200 });

  if (rtnCode !== '1') return new Response('0|Payment Failed', { status: 200 });

  const paid = await markOrderPaid(env, tradeNo);
  if (!paid) return new Response('1|OK', { status: 200 });

  const product = getProduct(order.product_id);
  const themes = JSON.parse(order.themes_json || '[]');
  if (product && themes.length) {
    await grantCreditsForOrder(env, {
      userId: order.user_id,
      orderId: order.id,
      themes,
      creditsPerTheme: product.creditsPerTheme,
      idempotencyPrefix: `purchase:${order.id}`
    });
  }

  return new Response('1|OK', { status: 200 });
}, { methods: ['POST'] });
