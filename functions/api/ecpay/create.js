import {
  getEcpayConfig,
  generateTradeNo,
  formatTaiwanDateTime,
  calculateCheckMacValue
} from './_utils.js';

// 方案合法價格與規定題目數檢驗 (防止前端竄改金額)
const VALID_PLANS = {
  single: { label: '單項供養方案', price: 199, count: 1, points: 3 },
  triple: { label: '三項供養方案', price: 499, count: 3, points: 3 },
  all: { label: '六項全包圓滿方案', price: 999, count: 6, points: 3 }
};

const THEME_NAMES = {
  love: '感情篇',
  work: '工作篇',
  career: '事業篇',
  wealth: '財運篇',
  family: '家庭篇',
  children: '小孩篇'
};

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    let body = {};
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      body = await request.json();
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries());
      if (typeof body.themes === 'string') {
        body.themes = body.themes.split(',').filter(Boolean);
      }
    }

    const { planId, themes } = body;
    const plan = VALID_PLANS[planId];
    if (!plan) {
      return new Response(JSON.stringify({ error: '無效的購買方案' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    const chosenThemes = Array.isArray(themes) ? themes : [];
    if (chosenThemes.length !== plan.count) {
      return new Response(
        JSON.stringify({ error: `所選主題數量不符（需選 ${plan.count} 項）` }),
        { status: 400, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }

    // 取得當前網址來源 (Origin)
    const config = getEcpayConfig(env);
    const origin = env.SITE_URL || (config.isProduction ? 'https://wen-xian-tan.taoyuanyangxintuina.shop' : requestUrl.origin);
    const tradeNo = generateTradeNo();
    const tradeDate = formatTaiwanDateTime();

    const selectedThemeTitles = chosenThemes
      .map((id) => THEME_NAMES[id] || id)
      .join('、');
    
    // 商品名稱限 200 字內，多項以 # 區隔
    const itemName = `問仙壇-${plan.label}#包含：${selectedThemeTitles}`;

    // 組織綠界送出參數
    const ecpayParams = {
      MerchantID: config.merchantId,
      MerchantTradeNo: tradeNo,
      MerchantTradeDate: tradeDate,
      PaymentType: 'aio',
      TotalAmount: String(plan.price),
      TradeDesc: '問仙壇命理文化測算與掌心解碼',
      ItemName: itemName,
      ReturnURL: `${origin}/api/ecpay/callback`,
      OrderResultURL: `${origin}/api/ecpay/client-return`,
      ClientBackURL: `${origin}/#view-member`,
      ChoosePayment: 'ALL',
      EncryptType: '1',
      CustomField1: planId,
      CustomField2: chosenThemes.join(',')
    };

    // 計算 CheckMacValue
    ecpayParams.CheckMacValue = await calculateCheckMacValue(
      ecpayParams,
      config.hashKey,
      config.hashIV
    );

    // 若前端要求 JSON，回傳所有欄位與目標 URL
    if (request.headers.get('accept')?.includes('application/json')) {
      return new Response(
        JSON.stringify({
          success: true,
          actionUrl: config.actionUrl,
          tradeNo,
          params: ecpayParams
        }),
        {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }

    // 否則輸出自動送出之 HTML Form
    const inputFields = Object.entries(ecpayParams)
      .map(
        ([key, val]) =>
          `<input type="hidden" name="${key}" value="${String(val).replace(/"/g, '&quot;')}" />`
      )
      .join('\n');

    const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <title>問仙壇 · 轉導至綠界安全支付...</title>
  <style>
    body { background: #0A0908; color: #F5E6C8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .loader { border: 3px solid rgba(212, 168, 83, 0.2); border-top: 3px solid #D4A853; border-radius: 50%; width: 44px; height: 44px; animation: spin 1s linear infinite; margin-bottom: 20px; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    h2 { font-weight: 500; font-size: 1.2rem; margin: 0 0 8px 0; color: #F5E6C8; }
    p { font-size: 0.85rem; color: #A0988A; margin: 0; }
  </style>
</head>
<body>
  <div class="loader"></div>
  <h2>正在為您前往綠界安全收銀台...</h2>
  <p>請稍候，系統將自動導向綠界科技加密付款頁面</p>
  <form id="ecpayForm" method="POST" action="${config.actionUrl}">
    ${inputFields}
  </form>
  <script>
    document.getElementById('ecpayForm').submit();
  </script>
</body>
</html>`;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
}

// 支援 OPTIONS 預檢請求
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept'
    }
  });
}
