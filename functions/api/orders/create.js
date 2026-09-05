import { postOnly, json, readJson, requireSiteUrl } from '../../lib/wxt/http.mjs';
import { readUserSession } from '../../lib/wxt/auth.mjs';
import { createOrder, findUserById, hasDb } from '../../lib/wxt/store.mjs';
import { validateOrderInput, THEME_LABELS } from '../../lib/wxt/products.mjs';
import { generateTradeNo, getEcpayConfig, formatTaiwanDateTime, calculateCheckMacValue } from '../../lib/wxt/ecpay.mjs';
import { createPortalyCheckoutSession } from '../../lib/wxt/portaly.mjs';

/** 收款總開關：若未明確開啟，不允許任何建單請求 */
function paymentsEnabled(env) {
  return String((env && env.PAYMENTS_ENABLED) || '') === 'true';
}

export const onRequest = postOnly(async ({ request, env }) => {
  if (!paymentsEnabled(env)) {
    return json({ error: 'PAYMENTS_DISABLED', message: '線上收款整備中，暫時無法建立訂單' }, 503);
  }
  if (!hasDb(env)) {
    return json({ error: 'SERVICE_UNAVAILABLE', message: '資料庫維護中' }, 503);
  }

  const session = await readUserSession(env, request);
  if (!session.ok) {
    return json({ error: 'UNAUTHENTICATED', message: '請先登入會員再進行結帳' }, 401);
  }

  const body = await readJson(request);
  const validated = validateOrderInput(body.productId, body.themeKeys);
  if (!validated.ok) {
    return json({ error: validated.error }, 400);
  }

  const { product, themes } = validated;
  const siteUrl = requireSiteUrl(env);
  const tradeNo = generateTradeNo();
  const provider = String(env?.PAYMENT_PROVIDER || 'portaly').toLowerCase();

  // ---------- 綠界金流處理 (ECPay) ----------
  if (provider === 'ecpay') {
    const config = getEcpayConfig(env);
    const orderId = await createOrder(env, {
      userId: session.uid,
      productId: product.id,
      amount: product.amount,
      themes,
      merchantTradeNo: tradeNo,
      termsVersion: String(body.termsVersion || ''),
      provider: 'ecpay'
    });

    const themeTitles = themes.map((id) => THEME_LABELS[id] || id).join('、');
    const ecpayParams = {
      MerchantID: config.merchantId,
      MerchantTradeNo: tradeNo,
      MerchantTradeDate: formatTaiwanDateTime(),
      PaymentType: 'aio',
      TotalAmount: String(product.amount),
      TradeDesc: '問仙壇測算方案',
      ItemName: `問仙壇-${product.label}#${themeTitles}`,
      ReturnURL: `${siteUrl}/api/ecpay/callback`,
      OrderResultURL: `${siteUrl}/api/ecpay/client-return`,
      ClientBackURL: `${siteUrl}/`,
      ChoosePayment: 'ALL',
      EncryptType: '1',
      CustomField1: orderId,
      CustomField2: product.id
    };
    ecpayParams.CheckMacValue = await calculateCheckMacValue(ecpayParams, config.hashKey, config.hashIV);

    return json({
      ok: true,
      orderId,
      tradeNo,
      action: config.actionUrl,
      actionUrl: config.actionUrl,
      fields: ecpayParams,
      params: ecpayParams
    });
  }

  // ---------- Portaly Payment 處理（預設） ----------
  const orderId = await createOrder(env, {
    userId: session.uid,
    productId: product.id,
    amount: product.amount,
    themes,
    merchantTradeNo: tradeNo,
    termsVersion: String(body.termsVersion || ''),
    provider: 'portaly'
  });

  const userRecord = await findUserById(env, session.uid);
  const sessionResult = await createPortalyCheckoutSession({
    env,
    orderId,
    tradeNo,
    product,
    themes,
    user: {
      uid: session.uid,
      email: userRecord?.email || session.email || '',
      displayName: userRecord?.display_name || session.displayName || '問仙壇信眾'
    },
    siteUrl
  });

  if (sessionResult.ok && sessionResult.checkoutUrl) {
    return json({
      ok: true,
      orderId,
      tradeNo,
      checkoutUrl: sessionResult.checkoutUrl,
      url: sessionResult.checkoutUrl
    });
  }

  return json({
    ok: false,
    error: sessionResult.error || 'PORTALY_SESSION_FAILED',
    message: sessionResult.message || '無法建立 Portaly 結帳連線，請稍後重試'
  }, 500);
});
