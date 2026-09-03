import { route, requireSiteUrl } from '../../lib/wxt/http.mjs';
import { getEcpayConfig, verifyCheckMacValue } from '../../lib/wxt/ecpay.mjs';

/** 綠界 OrderResultURL：只驗簽後 302，不要求登入 cookie */
export const onRequest = route(async ({ request, env }) => {
  const siteUrl = requireSiteUrl(env);
  const formData = await request.formData();
  const params = Object.fromEntries(formData.entries());
  const config = getEcpayConfig(env);
  const valid = await verifyCheckMacValue(params, config.hashKey, config.hashIV);
  const tradeNo = encodeURIComponent(String(params.MerchantTradeNo || ''));

  if (valid && String(params.RtnCode || '') === '1') {
    return Response.redirect(`${siteUrl}/?order=${tradeNo}`, 302);
  }
  const msg = encodeURIComponent(valid ? (params.RtnMsg || '付款未完成') : '簽章驗證失敗');
  return Response.redirect(`${siteUrl}/?payment=failed&msg=${msg}`, 302);
}, { methods: ['POST'] });
