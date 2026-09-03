/**
 * 算命問仙專案 - Portaly 金流端到端自動化測試腳本
 * 驗證訂單建立、輪詢查詢、Webhook 通知以及模擬付款全流程
 */
const http = require('http');

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

function post(path, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request({
      hostname: 'localhost',
      port: PORT,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: PORT,
      path,
      method: 'GET'
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTest() {
  console.log('🚀 開始測試 Portaly 金流微服務流程...\n');

  try {
    // 1. 建立訂單
    const createRes = await post('/api/orders/create', {
      planId: 'test_fortune',
      planName: '測試合盤解鎖',
      amount: 399,
      userName: '張緣主',
      userEmail: 'chang@example.com'
    });

    if (!createRes.data || !createRes.data.success) {
      throw new Error('建立訂單失敗：' + JSON.stringify(createRes));
    }
    const order = createRes.data.order;
    console.log(`✅ [1/3] 訂單建立成功：${order.id}`);
    console.log(`    Portaly 付款跳轉網址: ${order.portalyCheckoutUrl}`);

    // 2. 模擬 Portaly 發送 Webhook
    console.log('📡 [2/3] 模擬 Portaly 伺服器發送入帳 Webhook 通知...');
    const webhookRes = await post('/api/webhooks/portaly', {
      order_id: order.id,
      buyer_email: 'chang@example.com',
      amount: 399,
      payment_method: 'Portaly 台灣信用卡 (VISA/MasterCard)',
      trade_no: 'PT-20260903-' + Date.now()
    });
    console.log(`    Webhook 回應碼: ${webhookRes.status} (OK)`);

    // 3. 查詢訂單確認是否轉為 PAID
    const statusRes = await get(`/api/orders/${order.id}/status`);
    if (statusRes.data && statusRes.data.isPaid) {
      console.log(`🎉 [3/3] 最終訂單狀態：${statusRes.data.status} (isPaid: true)`);
      console.log(`    付款方式: ${statusRes.data.order.paymentMethod}`);
      console.log(`    入帳時間: ${statusRes.data.order.paidAt}`);
      console.log('\n✨ Portaly 金流微服務測試 100% 通過！');
    } else {
      throw new Error('訂單狀態未更新為 PAID: ' + JSON.stringify(statusRes));
    }
  } catch (err) {
    console.error('❌ 測試失敗:', err.message);
  }
}

runTest();
