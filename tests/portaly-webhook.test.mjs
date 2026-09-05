import assert from 'node:assert/strict';
import { createFakeD1 } from './helpers/fake-d1.mjs';
import { onRequest as webhookHandler } from '../functions/api/portaly/webhook.js';
import { createOrder, getOrderByTradeNo, getCreditsMap } from '../functions/lib/wxt/store.mjs';
import { signPortalyCallback } from '../functions/lib/wxt/portaly.mjs';

async function runWebhookTests() {
  console.log('🧪 正在執行 Portaly Webhook 整合測試...');
  const fakeDb = createFakeD1();

  const env = {
    DB: fakeDb,
    PORTALY_CALLBACK_SECRET: 'webhook_secret_key_123'
  };

  const userId = 'u_test_buyer';
  const tradeNo = 'WXT260905183000ABC';
  const themes = ['love', 'career', 'wealth'];

  // 1. 建立測試訂單
  const orderId = await createOrder(env, {
    userId,
    productId: 'triple',
    amount: 499,
    themes,
    merchantTradeNo: tradeNo,
    termsVersion: '20260901',
    provider: 'portaly'
  });

  const orderBefore = await getOrderByTradeNo(env, tradeNo);
  assert.equal(orderBefore.status, 'PENDING');
  console.log('  ✓ 測試訂單已建立，初始狀態 PENDING');

  // 2. 模擬 Portaly 傳入數位簽章與 Webhook 請求
  const now = new Date().toISOString();
  const webhookPayload = {
    event: 'digital_product.checkout.completed',
    sessionId: 'dps_test_session_999',
    merchantOrderNumber: tradeNo,
    totalAmount: 499,
    currency: 'TWD',
    customerEmail: 'buyer@example.com',
    metadata: {
      orderId,
      tradeNo
    }
  };

  const signature = await signPortalyCallback({
    secret: env.PORTALY_CALLBACK_SECRET,
    payload: webhookPayload,
    timestamp: now
  });

  const request = new Request('https://www.zenasker.com/api/portaly/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-portaly-signature': signature,
      'x-portaly-timestamp': now,
      'x-portaly-event': 'digital_product.checkout.completed'
    },
    body: JSON.stringify(webhookPayload)
  });

  const response = await webhookHandler({ request, env });
  const resJson = await response.json();

  assert.equal(response.status, 200);
  assert.equal(resJson.ok, true);
  assert.equal(resJson.message, 'PAYMENT_PROCESSED');
  console.log('  ✓ Webhook 簽名校驗通過並正確處理');

  // 3. 驗證訂單狀態已轉為 PAID
  const orderAfter = await getOrderByTradeNo(env, tradeNo);
  assert.equal(orderAfter.status, 'PAID');
  assert.ok(orderAfter.paid_at > 0);
  console.log('  ✓ 訂單狀態已轉為 PAID');

  // 4. 驗證會員主題點數已正確入帳
  const credits = await getCreditsMap(env, userId);
  assert.equal(credits.love, 4, 'love 篇應核發 4 點');
  assert.equal(credits.career, 3, 'career 篇應核發 3 點');
  assert.equal(credits.wealth, 4, 'wealth 篇應核發 4 點');
  assert.equal(credits.work, 0, '未選主題應為 0 點');
  console.log('  ✓ 各篇章測算額度已正確入帳到資料庫');

  // 5. 測試冪等性（再次送出相同 Webhook 不得重複加點）
  const replayRequest = new Request('https://www.zenasker.com/api/portaly/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-portaly-signature': signature,
      'x-portaly-timestamp': now,
      'x-portaly-event': 'digital_product.checkout.completed'
    },
    body: JSON.stringify(webhookPayload)
  });
  const replayResponse = await webhookHandler({ request: replayRequest, env });
  const replayJson = await replayResponse.json();
  assert.equal(replayResponse.status, 200);
  assert.equal(replayJson.message, 'ALREADY_PAID');

  const creditsReplay = await getCreditsMap(env, userId);
  assert.equal(creditsReplay.love, 4, '重放請求不得重複加點');
  assert.equal(creditsReplay.career, 3);
  assert.equal(creditsReplay.wealth, 4);
  console.log('  ✓ Webhook 冪等性防重複加點測試通過');

  // 6. 測試偽造簽章防禦
  const fakeRequest = new Request('https://www.zenasker.com/api/portaly/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-portaly-signature': 'forged_fake_signature_abc',
      'x-portaly-timestamp': now
    },
    body: JSON.stringify(webhookPayload)
  });
  const fakeResponse = await webhookHandler({ request: fakeRequest, env });
  assert.equal(fakeResponse.status, 400);
  const fakeJson = await fakeResponse.json();
  assert.equal(fakeJson.error, 'INVALID_SIGNATURE');
  console.log('  ✓ 偽造簽名攻擊被成功阻斷 (400 INVALID_SIGNATURE)');

  fakeDb.close();
  console.log('🎉 Portaly Webhook 所有整合與安全測試全數通過！');
}

runWebhookTests().catch((err) => {
  console.error('❌ Webhook 測試失敗:', err);
  process.exit(1);
});
