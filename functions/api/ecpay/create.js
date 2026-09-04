import { postOnly, json, readJson } from '../../lib/wxt/http.mjs';
import { readUserSession } from '../../lib/wxt/auth.mjs';
import { createOrder, hasDb } from '../../lib/wxt/store.mjs';
import { validateOrderInput } from '../../lib/wxt/products.mjs';
import { getEcpayConfig, generateTradeNo, formatTaiwanDateTime, calculateCheckMacValue } from '../../lib/wxt/ecpay.mjs';
import { requireSiteUrl } from '../../lib/wxt/http.mjs';
import { THEME_LABELS } from '../../lib/wxt/products.mjs';

/** 收款總開關：沒有明確設成 true 就一律不建單，換金流期間不能有人付得下去 */
function paymentsEnabled(env) {
  return String((env && env.PAYMENTS_ENABLED) || '') === 'true';
}

export const onRequest = postOnly(async ({ request, env }) => {
  if (!paymentsEnabled(env)) {
    return json({ error: 'PAYMENTS_DISABLED', message: '線上收款整備中，暫時無法建立訂單' }, 503);
  }
  if (!hasDb(env)) return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
  const session = await readUserSession(env, request);
  if (!session.ok) return json({ error: 'UNAUTHENTICATED' }, 401);

  const body = await readJson(request);
  const validated = validateOrderInput(body.productId, body.themeKeys);
  if (!validated.ok) return json({ error: validated.error }, 400);

  const { product, themes } = validated;
  const siteUrl = requireSiteUrl(env);
  const config = getEcpayConfig(env);
  const tradeNo = generateTradeNo();

  const orderId = await createOrder(env, {
    userId: session.uid,
    productId: product.id,
    amount: product.amount,
    themes,
    merchantTradeNo: tradeNo,
    termsVersion: String(body.termsVersion || '')
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
});
