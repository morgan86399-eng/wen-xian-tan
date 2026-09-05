import { route, json } from '../../lib/wxt/http.mjs';
import { getPortalyConfig, verifyPortalyCallback } from '../../lib/wxt/portaly.mjs';
import {
  getOrderByTradeNo,
  getOrderById,
  recordPaymentEvent,
  markOrderPaid,
  grantCreditsForOrder,
  hasDb
} from '../../lib/wxt/store.mjs';
import { getProduct, CREDITS_BY_THEME } from '../../lib/wxt/products.mjs';
import { sha256Hex } from '../../lib/security/token.mjs';

/**
 * Portaly Payment Webhook / Callback 接收端點
 * 路由：POST https://www.zenasker.com/api/portaly/webhook
 */
export const onRequest = route(async ({ request, env }) => {
  if (!hasDb(env)) {
    return json({ ok: false, error: 'NO_DB', message: '資料庫尚未就緒' }, 503);
  }

  const rawBody = await request.text();
  let payload = {};
  try {
    payload = JSON.parse(rawBody);
  } catch (_) {
    return json({ ok: false, error: 'INVALID_JSON', message: '無法解析 JSON 請求主體' }, 400);
  }

  const signature = request.headers.get('x-portaly-signature') || '';
  const timestamp = request.headers.get('x-portaly-timestamp') || '';
  const event = request.headers.get('x-portaly-event') || payload.event || '';
  const config = getPortalyConfig(env);

  // 1. 若環境有設定 Callback Secret，嚴格校驗 WebCrypto HMAC-SHA256 數位簽名
  if (config.callbackSecret) {
    const isValid = await verifyPortalyCallback({
      secret: config.callbackSecret,
      payload,
      timestamp,
      signature
    });

    if (!isValid) {
      console.warn('Portaly Webhook Signature Mismatch:', { timestamp, signature });
      return json({ ok: false, error: 'INVALID_SIGNATURE', message: '簽名驗證失敗' }, 400);
    }
  }

  // 2. 處理退款事件
  if (event === 'digital_product.order.refunded') {
    const eventId = `refund:${payload.orderId || payload.id || Date.now()}`;
    const payloadHash = await sha256Hex(rawBody);
    await recordPaymentEvent(env, {
      provider: 'portaly',
      eventId,
      orderId: payload.orderId || '',
      payloadHash
    });
    return json({ ok: true, status: 'REFUND_RECORDED' }, 200);
  }

  // 3. 提取訂單與金流參照資訊
  const tradeNo = String(
    payload.merchantOrderNumber ||
    payload.merchantTradeNo ||
    payload.metadata?.tradeNo ||
    payload.data?.merchantOrderNumber ||
    ''
  ).trim();

  const orderId = String(
    payload.metadata?.orderId ||
    payload.orderId ||
    payload.data?.orderId ||
    ''
  ).trim();

  let order = null;
  if (tradeNo) {
    order = await getOrderByTradeNo(env, tradeNo);
  }
  if (!order && orderId) {
    order = await getOrderById(env, orderId);
  }

  // 4. 若找到訂單，執行入帳處理（保證冪等性）
  if (order) {
    const eventId = `portaly:${tradeNo || order.id}:${payload.sessionId || payload.id || Date.now()}`;
    const payloadHash = await sha256Hex(rawBody);

    // 若訂單已標記為 PAID，直接回傳成功，避免重複核發點數
    if (order.status === 'PAID') {
      return json({ ok: true, message: 'ALREADY_PAID', orderId: order.id }, 200);
    }

    const product = getProduct(order.product_id);
    const themes = JSON.parse(order.themes_json || '[]');

    // 先標記付款完成，再原子核發點數
    await markOrderPaid(env, order.merchant_trade_no);

    if (product && themes.length) {
      await grantCreditsForOrder(env, {
        userId: order.user_id,
        orderId: order.id,
        themes,
        creditsByTheme: CREDITS_BY_THEME,
        idempotencyPrefix: `purchase:${order.id}`
      });
    }

    await recordPaymentEvent(env, {
      provider: 'portaly',
      eventId,
      orderId: order.id,
      payloadHash
    });

    return json({
      ok: true,
      message: 'PAYMENT_PROCESSED',
      orderId: order.id,
      tradeNo: order.merchant_trade_no
    }, 200);
  }

  // 5. 若找不到系統訂單（例如客戶直接於 Portaly 賣場下單）
  // 記錄該付款事件，供管理員或後續人工審查
  const eventId = `portaly_external:${payload.sessionId || payload.id || Date.now()}`;
  const payloadHash = await sha256Hex(rawBody);
  await recordPaymentEvent(env, {
    provider: 'portaly',
    eventId,
    orderId: 'EXTERNAL_DIRECT',
    payloadHash
  });

  return json({
    ok: true,
    message: 'EVENT_ACKNOWLEDGED_UNMAPPED_ORDER',
    note: 'Webhook 接收成功，未對應到內部預先建立之訂單'
  }, 200);
}, { methods: ['POST', 'OPTIONS'] });
