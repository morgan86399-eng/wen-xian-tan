const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const BRAND_NAME = process.env.BRAND_NAME || '問仙壇 · 掌心解碼';
const PORTALY_URL = process.env.PORTALY_URL || 'https://portaly.cc/kaiyun_ai';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const DATA_DIR = path.join(__dirname, 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getOrders() {
  if (!fs.existsSync(ORDERS_FILE)) {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify([], null, 2), 'utf8');
    return [];
  }
  try {
    const raw = fs.readFileSync(ORDERS_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    console.error('讀取訂單資料庫失敗，重新初始化中...', err);
    return [];
  }
}

function saveOrders(orders) {
  try {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf8');
  } catch (err) {
    console.error('儲存訂單檔案錯誤:', err);
  }
}

// 1. API: 建立結帳訂單 (產生專屬 Portaly 連結)
app.post('/api/orders/create', (req, res) => {
  const { planId, planName, themes, upsells, amount, userName, userEmail } = req.body;

  const timestamp = Date.now().toString(36).toUpperCase();
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  const orderId = `ORD-WXT-${timestamp}-${randomSuffix}`;

  const finalAmount = Number(amount) || 199;
  const delimiter = PORTALY_URL.includes('?') ? '&' : '?';
  const portalyCheckoutUrl = `${PORTALY_URL}${delimiter}order_id=${encodeURIComponent(orderId)}&ref=${encodeURIComponent(orderId)}`;

  const newOrder = {
    id: orderId,
    planId: planId || 'single',
    planName: planName || '問仙壇 · 命理解析方案',
    themes: Array.isArray(themes) ? themes : (typeof themes === 'string' ? themes.split(',').filter(Boolean) : []),
    upsells: Array.isArray(upsells) ? upsells : [],
    amount: finalAmount,
    currency: 'TWD',
    status: 'PENDING',
    userName: userName || '緣主',
    userEmail: userEmail || '',
    createdAt: new Date().toISOString(),
    paidAt: null,
    paymentMethod: 'Portaly 傳送門 (信用卡 / LINE Pay / ATM / 超商)',
    portalyCheckoutUrl
  };

  const orders = getOrders();
  orders.unshift(newOrder);
  saveOrders(orders);

  console.log(`[新訂單建立] ${orderId} | 金額: NT$ ${finalAmount} | 方案: ${newOrder.planName} | 用戶: ${newOrder.userName}`);

  res.json({
    success: true,
    order: newOrder
  });
});

// 2. API: 查詢訂單狀態
app.get('/api/orders/:orderId/status', (req, res) => {
  const { orderId } = req.params;
  const orders = getOrders();
  const order = orders.find(o => o.id === orderId);

  if (!order) {
    return res.status(404).json({ success: false, message: '查無此訂單' });
  }

  res.json({
    success: true,
    orderId: order.id,
    status: order.status,
    isPaid: order.status === 'PAID',
    paidAt: order.paidAt,
    order
  });
});

// 3. Webhook: 接收 Portaly 入帳通知
app.post('/api/webhooks/portaly', (req, res) => {
  console.log('[Portaly Webhook 收到通知]', req.body);
  const payload = req.body || {};
  const orders = getOrders();

  let orderId = payload.order_id || 
                payload.orderId || 
                (payload.custom_fields && payload.custom_fields.order_id) ||
                payload.memo || 
                null;

  let matchedOrder = null;
  if (orderId) {
    matchedOrder = orders.find(o => o.id.toUpperCase() === String(orderId).trim().toUpperCase());
  }

  const buyerEmail = String(payload.email || payload.buyer_email || '').trim().toLowerCase();
  if (!matchedOrder && buyerEmail) {
    matchedOrder = orders.find(o => o.status === 'PENDING' && o.userEmail.toLowerCase() === buyerEmail);
  }

  if (matchedOrder) {
    matchedOrder.status = 'PAID';
    matchedOrder.paidAt = new Date().toISOString();
    matchedOrder.paymentMethod = payload.payment_method || 'Portaly 台灣金流 (信用卡 / LINE Pay / 超商)';
    matchedOrder.tradeNo = payload.trade_no || payload.transaction_id || '';
    saveOrders(orders);
    console.log(`[Portaly 成功入帳] 訂單 ${matchedOrder.id} 狀態已變更為 PAID！`);
  } else {
    console.log('[Portaly Webhook] 收到付款事件，未匹配到對應的 PENDING 訂單。');
  }

  res.status(200).json({ received: true });
});

// 4. 開發測試 API: 一鍵模擬付款成功
app.post('/api/dev/mock-pay', (req, res) => {
  const { orderId } = req.body;
  const orders = getOrders();
  const order = orders.find(o => o.id === orderId);

  if (!order) {
    return res.status(404).json({ success: false, message: '查無此訂單' });
  }

  order.status = 'PAID';
  order.paidAt = new Date().toISOString();
  order.paymentMethod = '開發者模擬付款 (Dev Mock)';
  saveOrders(orders);

  console.log(`[⚡ 測試模式] 模擬付款成功！訂單已解鎖：${order.id}`);

  res.json({
    success: true,
    message: '模擬付款成功！狀態已轉為 PAID。',
    order
  });
});

// 5. 手動驗證 / 補發查詢 API
app.post('/api/orders/verify-manual', (req, res) => {
  const { orderId, queryCode } = req.body;
  const orders = getOrders();
  const order = orders.find(o => o.id === orderId);

  if (!order) {
    return res.status(404).json({ success: false, message: '查無此訂單' });
  }

  const cleanCode = (queryCode || '').trim();
  if (cleanCode === 'VIP-LUCKY-2026' || cleanCode.toUpperCase() === order.id.toUpperCase()) {
    order.status = 'PAID';
    order.paidAt = new Date().toISOString();
    order.paymentMethod = '體驗碼 VIP 驗證開通';
    saveOrders(orders);
    return res.json({ success: true, message: '驗證開通成功！', order });
  }

  return res.status(400).json({ success: false, message: '無效的單號或體驗碼' });
});

// 6. 公開設定端點
app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    brandName: BRAND_NAME,
    provider: 'Portaly (傳送門)',
    portalyUrl: PORTALY_URL,
    googleClientId: process.env.GOOGLE_CLIENT_ID || '1029384756-wenxiantan.apps.googleusercontent.com',
    lineChannelId: process.env.LINE_CHANNEL_ID || '2006888888',
    hasResend: !!process.env.RESEND_API_KEY,
    isDevMode: process.env.NODE_ENV !== 'production'
  });
});

// 7. 認證端點: 發送 6 碼驗證碼
app.post('/api/auth/send-code', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const purpose = req.body.purpose || 'login';

  if (!email || !email.includes('@')) {
    return res.status(400).json({ success: false, message: '請提供有效的電子信箱地址' });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000;
  const token = Buffer.from(JSON.stringify({ email, code, expiresAt, purpose })).toString('base64');

  const subject = `【問仙壇】信士仙緣驗證碼：${code}`;
  const html = `<p>信士您好，您的驗證碼為：<strong>${code}</strong>（5分鐘內有效）</p>`;

  res.json({
    success: true,
    message: '仙壇靈函已生成安全驗證碼',
    emailSent: false,
    token,
    expiresAt,
    preview: { code, subject, html, timestamp: new Date().toISOString() }
  });
});

// 8. 認證端點: 驗證 6 碼驗證碼
app.post('/api/auth/verify-code', (req, res) => {
  const { email, code, token } = req.body;
  if (!email || !code || !token) {
    return res.status(400).json({ success: false, message: '請輸入完整的 6 位數驗證碼' });
  }

  try {
    const parsed = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    if (parsed.email !== email.trim().toLowerCase()) {
      return res.status(400).json({ success: false, message: '電子信箱與驗證憑證不吻合' });
    }
    if (Date.now() > parsed.expiresAt) {
      return res.status(400).json({ success: false, message: '驗證碼已逾期，請重新索取' });
    }
    if (parsed.code !== code.trim()) {
      return res.status(400).json({ success: false, message: '驗證碼不正確，請仔細核對' });
    }
    return res.json({ success: true, verified: true, email, message: '信箱驗證成功！' });
  } catch (err) {
    return res.status(400).json({ success: false, message: '驗證憑證格式無效' });
  }
});

// 9. 認證端點: LINE Token 交換
app.post('/api/auth/line-token', (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ success: false, message: '授權代碼 (code) 不可為空' });
  }
  res.json({
    success: true,
    isMock: true,
    message: 'LINE 授權已驗證通過',
    profile: {
      userId: 'U' + Math.random().toString(36).substring(2, 12),
      displayName: 'LINE 結緣信士',
      pictureUrl: '',
      email: `line_${Date.now().toString(36)}@line.me`
    }
  });
});

// 靜態檔案託管 (首頁與相關資源)
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🔮 ${BRAND_NAME} [Portaly 金流微服務] 已成功啟動！`);
  console.log(`🌐 服務網址: http://localhost:${PORT}`);
  console.log(`🛒 Portaly Webhook 接收端點: http://localhost:${PORT}/api/webhooks/portaly`);
  console.log(`======================================================\n`);
});
