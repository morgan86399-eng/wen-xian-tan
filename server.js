const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const querystring = require('querystring');

const PORT = 3333;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// 自動讀取同目錄下的 .env 檔案
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  });
}

// 綠界金流環境設定（自動優先採用 .env）
const ECPAY_CONFIG = {
  isProduction: process.env.ECPAY_IS_PRODUCTION === 'true',
  merchantId: process.env.ECPAY_MERCHANT_ID || '3002607',
  hashKey: process.env.ECPAY_HASH_KEY || 'pwFHCqoQZGmho4w6',
  hashIV: process.env.ECPAY_HASH_IV || 'EkRm7iFT261dpevs',
  actionUrl: process.env.ECPAY_IS_PRODUCTION === 'true'
    ? 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5'
    : 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5'
};

const VALID_PLANS = {
  single: { label: '單項供養方案', price: 199, count: 1 },
  triple: { label: '三項供養方案', price: 499, count: 3 },
  all: { label: '六項全包圓滿方案', price: 999, count: 6 }
};

const THEME_NAMES = {
  love: '感情篇',
  work: '工作篇',
  career: '事業篇',
  wealth: '財運篇',
  family: '家庭篇',
  children: '小孩篇'
};

function ecpayUrlEncode(str) {
  return encodeURIComponent(str)
    .replace(/%20/g, '+')
    .replace(/%2d/gi, '-')
    .replace(/%5f/gi, '_')
    .replace(/%2e/gi, '.')
    .replace(/%21/gi, '!')
    .replace(/%2a/gi, '*')
    .replace(/%28/gi, '(')
    .replace(/%29/gi, ')');
}

function calculateCheckMacValue(params, hashKey, hashIV) {
  const sortedKeys = Object.keys(params)
    .filter((k) => k !== 'CheckMacValue')
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  const rawPairs = sortedKeys.map((k) => `${k}=${params[k]}`);
  const combined = `HashKey=${hashKey}&${rawPairs.join('&')}&HashIV=${hashIV}`;
  const encoded = ecpayUrlEncode(combined);
  const lower = encoded.toLowerCase();
  return crypto.createHash('sha256').update(lower).digest('hex').toUpperCase();
}

function formatTaiwanDateTime(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const twTime = new Date(date.getTime() + (8 * 60 + date.getTimezoneOffset()) * 60000);
  const yyyy = twTime.getFullYear();
  const MM = pad(twTime.getMonth() + 1);
  const dd = pad(twTime.getDate());
  const HH = pad(twTime.getHours());
  const mm = pad(twTime.getMinutes());
  const ss = pad(twTime.getSeconds());
  return `${yyyy}/${MM}/${dd} ${HH}:${mm}:${ss}`;
}

function generateTradeNo() {
  const now = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const twTime = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
  const yy = String(twTime.getFullYear()).slice(-2);
  const mm = pad(twTime.getMonth() + 1);
  const dd = pad(twTime.getDate());
  const hh = pad(twTime.getHours());
  const mi = pad(twTime.getMinutes());
  const ss = pad(twTime.getSeconds());
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `WXT${yy}${mm}${dd}${hh}${mi}${ss}${rand}`;
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        try {
          resolve(JSON.parse(body || '{}'));
        } catch (e) {
          reject(e);
        }
      } else {
        resolve(querystring.parse(body || ''));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost:3333'}`);
  const pathname = reqUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // --- API 1: /api/ecpay/create ---
  if (pathname === '/api/ecpay/create' && req.method === 'POST') {
    try {
      const body = await parseRequestBody(req);
      const { planId, themes } = body;
      const plan = VALID_PLANS[planId];
      if (!plan) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: '無效的購買方案' }));
        return;
      }

      const chosenThemes = Array.isArray(themes)
        ? themes
        : (typeof themes === 'string' ? themes.split(',').filter(Boolean) : []);

      if (chosenThemes.length !== plan.count) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: `所選主題數量不符（需選 ${plan.count} 項）` }));
        return;
      }

      const origin = process.env.SITE_URL || (ECPAY_CONFIG.isProduction ? 'https://wen-xian-tan.taoyuanyangxintuina.shop' : `http://${req.headers.host || `localhost:${PORT}`}`);
      const tradeNo = generateTradeNo();
      const tradeDate = formatTaiwanDateTime();
      const selectedThemeTitles = chosenThemes.map((id) => THEME_NAMES[id] || id).join('、');
      const itemName = `問仙壇-${plan.label}#包含：${selectedThemeTitles}`;

      const ecpayParams = {
        MerchantID: ECPAY_CONFIG.merchantId,
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

      ecpayParams.CheckMacValue = calculateCheckMacValue(
        ecpayParams,
        ECPAY_CONFIG.hashKey,
        ECPAY_CONFIG.hashIV
      );

      if ((req.headers['accept'] || '').includes('application/json')) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          actionUrl: ECPAY_CONFIG.actionUrl,
          tradeNo,
          params: ecpayParams
        }));
        return;
      }

      const inputFields = Object.entries(ecpayParams)
        .map(([k, v]) => `<input type="hidden" name="${k}" value="${String(v).replace(/"/g, '&quot;')}" />`)
        .join('\n');

      const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <title>問仙壇 · 前往綠界安全收銀台...</title>
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
  <h2>正在前往綠界科技安全支付...</h2>
  <p>系統即將導向綠界加密金流頁面，請稍候</p>
  <form id="ecpayForm" method="POST" action="${ECPAY_CONFIG.actionUrl}">
    ${inputFields}
  </form>
  <script>document.getElementById('ecpayForm').submit();</script>
</body>
</html>`;

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: e.message }));
      return;
    }
  }

  // --- API 2: /api/ecpay/callback (ReturnURL Webhook) ---
  if (pathname === '/api/ecpay/callback' && req.method === 'POST') {
    try {
      const params = await parseRequestBody(req);
      const computed = calculateCheckMacValue(params, ECPAY_CONFIG.hashKey, ECPAY_CONFIG.hashIV);
      if (computed !== params.CheckMacValue) {
        console.error('[ECPay Callback Error] CheckMacValue 不符');
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('0|CheckMacValue Error');
        return;
      }

      const { RtnCode, RtnMsg, MerchantTradeNo, TradeAmt } = params;
      if (RtnCode === '1') {
        console.log(`[ECPay Callback Success] 訂單 ${MerchantTradeNo} 交易成功，金額 NT$ ${TradeAmt}`);
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('1|OK');
      } else {
        console.warn(`[ECPay Callback Fail] 訂單未完成: ${RtnMsg}`);
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`0|${RtnMsg}`);
      }
      return;
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`0|${e.message}`);
      return;
    }
  }

  // --- API 3: /api/ecpay/client-return (OrderResultURL Browser Redirect) ---
  if (pathname === '/api/ecpay/client-return' && req.method === 'POST') {
    try {
      const params = await parseRequestBody(req);
      const computed = calculateCheckMacValue(params, ECPAY_CONFIG.hashKey, ECPAY_CONFIG.hashIV);
      const isValid = computed === params.CheckMacValue;
      const { RtnCode, RtnMsg, MerchantTradeNo, TradeAmt, CustomField1, CustomField2 } = params;

      if (isValid && RtnCode === '1') {
        res.writeHead(302, {
          Location: `/?payment=success&tradeNo=${encodeURIComponent(MerchantTradeNo || '')}&plan=${encodeURIComponent(CustomField1 || '')}&themes=${encodeURIComponent(CustomField2 || '')}&amount=${encodeURIComponent(TradeAmt || '')}`
        });
        res.end();
      } else {
        const failMsg = !isValid ? '簽章驗證失敗' : (RtnMsg || '付款未完成');
        res.writeHead(302, {
          Location: `/?payment=failed&msg=${encodeURIComponent(failMsg)}`
        });
        res.end();
      }
      return;
    } catch (e) {
      res.writeHead(302, {
        Location: `/?payment=error&msg=${encodeURIComponent(e.message)}`
      });
      res.end();
      return;
    }
  }

  // 靜態檔案處理
  let reqPath = pathname;
  if (reqPath === '/') reqPath = '/index.html';

  const filePath = path.join(ROOT, reqPath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`問仙壇 Server running at http://localhost:${PORT}/ (ECPay Mode: ${ECPAY_CONFIG.isProduction ? '正式營運 (Production - 特店代號: ' + ECPAY_CONFIG.merchantId + ')' : '測試模擬 (Stage)'})`);
});
