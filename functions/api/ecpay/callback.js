import { route } from '../../lib/wxt/http.mjs';
import { getEcpayConfig, verifyCheckMacValue } from '../../lib/wxt/ecpay.mjs';
import {
  getOrderByTradeNo,
  recordPaymentEvent,
  markOrderPaid,
  grantCreditsForOrder,
  hasDb
} from '../../lib/wxt/store.mjs';
import { getProduct, CREDITS_BY_THEME } from '../../lib/wxt/products.mjs';
import { sha256Hex } from '../../lib/security/token.mjs';

/** 回呼內容必須與我們自己建立的訂單逐欄相符，簽章正確不代表金額正確 */
function findMismatch(params, order, config) {
  if (String(params.MerchantID || '') !== String(config.merchantId)) return 'MERCHANT_MISMATCH';
  if (Number(params.TradeAmt) !== Number(order.amount)) return 'AMOUNT_MISMATCH';

  const echoedOrderId = String(params.CustomField1 || '');
  if (echoedOrderId && echoedOrderId !== String(order.id)) return 'ORDER_MISMATCH';

  const echoedProductId = String(params.CustomField2 || '');
  if (echoedProductId && echoedProductId !== String(order.product_id)) return 'PRODUCT_MISMATCH';

  return '';
}

export const onRequest = route(async ({ request, env }) => {
  if (!hasDb(env)) return new Response('0|NO_DB', { status: 503 });

  const formData = await request.formData();
  const params = Object.fromEntries(formData.entries());
  const config = getEcpayConfig(env);

  const valid = await verifyCheckMacValue(params, config.hashKey, config.hashIV);
  if (!valid) return new Response('0|CheckMacValue Error', { status: 400 });

  const tradeNo = String(params.MerchantTradeNo || '');
  const order = await getOrderByTradeNo(env, tradeNo);
  if (!order) return new Response('0|ORDER_NOT_FOUND', { status: 404 });

  const mismatch = findMismatch(params, order, config);
  if (mismatch) return new Response(`0|${mismatch}`, { status: 400 });

  const rtnCode = String(params.RtnCode || '');
  const eventId = `${tradeNo}:${rtnCode}:${String(params.TradeNo || params.PaymentDate || '')}`;
  const payloadHash = await sha256Hex(JSON.stringify(params));
  const paymentEvent = { provider: 'ecpay', eventId, orderId: order.id, payloadHash };

  if (rtnCode !== '1') {
    await recordPaymentEvent(env, paymentEvent);
    return new Response('0|Payment Failed', { status: 200 });
  }

  const product = getProduct(order.product_id);
  const themes = JSON.parse(order.themes_json || '[]');
  if (!product || !themes.length) return new Response('0|ORDER_BROKEN', { status: 400 });

  // 先入帳再記事件：核發中途掛掉就不留事件，綠界重送時會把沒發到的篇章補齊
  await markOrderPaid(env, tradeNo);
  await grantCreditsForOrder(env, {
    userId: order.user_id,
    orderId: order.id,
    themes,
    creditsByTheme: CREDITS_BY_THEME,
    idempotencyPrefix: `purchase:${order.id}`
  });
  await recordPaymentEvent(env, paymentEvent);

  return new Response('1|OK', { status: 200 });
}, { methods: ['POST'] });
