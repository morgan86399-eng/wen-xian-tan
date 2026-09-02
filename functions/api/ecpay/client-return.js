import { getEcpayConfig, verifyCheckMacValue } from './_utils.js';

/**
 * 綠界特店回導頁面 (OrderResultURL)
 * 使用者在綠界收銀台付款完成後，綠界會將使用者的瀏覽器以 POST 方式送回此處
 * 此處驗證完後，轉導回問仙壇首頁 index.html 並帶上付款成功標籤與額度參數
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const formData = await request.formData();
    const params = Object.fromEntries(formData.entries());

    const requestUrl = new URL(request.url);
    const config = getEcpayConfig(env);
    const origin = env.SITE_URL || (config.isProduction ? 'https://wen-xian-tan.taoyuanyangxintuina.shop' : requestUrl.origin);

    // 驗證 CheckMacValue
    const isValid = await verifyCheckMacValue(params, config.hashKey, config.hashIV);
    const { RtnCode, RtnMsg, MerchantTradeNo, TradeAmt, CustomField1, CustomField2 } = params;

    if (isValid && RtnCode === '1') {
      // 付款成功：轉導至首頁並帶入結帳參數以供自動加點
      const targetUrl = `${origin}/?payment=success&tradeNo=${encodeURIComponent(MerchantTradeNo)}&plan=${encodeURIComponent(CustomField1 || '')}&themes=${encodeURIComponent(CustomField2 || '')}&amount=${encodeURIComponent(TradeAmt || '')}`;
      return Response.redirect(targetUrl, 302);
    } else {
      // 付款失敗或驗證未通過
      const failMsg = !isValid ? '簽章驗證失敗' : (RtnMsg || '付款未完成');
      const targetUrl = `${origin}/?payment=failed&msg=${encodeURIComponent(failMsg)}`;
      return Response.redirect(targetUrl, 302);
    }
  } catch (err) {
    const requestUrl = new URL(request.url);
    const origin = env.SITE_URL || requestUrl.origin;
    return Response.redirect(`${origin}/?payment=error&msg=${encodeURIComponent(err.message)}`, 302);
  }
}
