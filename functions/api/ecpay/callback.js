import { getEcpayConfig, verifyCheckMacValue } from './_utils.js';

/**
 * 綠界金流伺服器非同步回傳 (ReturnURL)
 * 收到後必須驗證 CheckMacValue，成功需回覆 "1|OK"
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const formData = await request.formData();
    const params = Object.fromEntries(formData.entries());

    const config = getEcpayConfig(env);

    // 1. 驗證 CheckMacValue
    const isValid = await verifyCheckMacValue(params, config.hashKey, config.hashIV);
    if (!isValid) {
      console.error('[ECPay Callback] CheckMacValue 驗證失敗:', params);
      return new Response('0|CheckMacValue Error', {
        status: 400,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    // 2. 檢驗交易狀態碼 (RtnCode === '1' 代表交易成功)
    const { RtnCode, RtnMsg, MerchantTradeNo, TradeAmt, PaymentDate, CustomField1, CustomField2 } = params;

    if (RtnCode === '1') {
      console.log(`[ECPay Callback] 交易成功！訂單號: ${MerchantTradeNo}, 金額: ${TradeAmt}, 方案: ${CustomField1}, 主題: ${CustomField2}, 付款時間: ${PaymentDate}`);
      
      // 成功回應 1|OK 給綠界
      return new Response('1|OK', {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    } else {
      console.warn(`[ECPay Callback] 付款失敗或未完成: ${RtnCode} (${RtnMsg})`);
      return new Response(`0|Payment Failed: ${RtnMsg}`, {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  } catch (err) {
    console.error('[ECPay Callback Error]', err);
    return new Response(`0|${err.message}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}
