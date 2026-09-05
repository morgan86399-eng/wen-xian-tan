import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFakeD1 } from '../tests/helpers/fake-d1.mjs';
import { onRequest as webhookHandler } from '../functions/api/portaly/webhook.js';
import { onRequest as generateHandler } from '../functions/api/reading/generate.js';
import { createOrder, getOrderByTradeNo, getCreditsMap } from '../functions/lib/wxt/store.mjs';
import { signPortalyCallback } from '../functions/lib/wxt/portaly.mjs';
import { signUserSession } from '../functions/lib/wxt/auth.mjs';

// 讀取本地 .dev.vars
function loadDevVars() {
  const vars = {};
  try {
    const lines = readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        vars[key] = val;
      }
    }
  } catch (e) {
    console.warn('無法讀取 .dev.vars:', e.message);
  }
  return vars;
}

async function runEndToEndFlow() {
  console.log('====================================================');
  console.log('🌟 問仙壇 · Portaly 扣款、入帳至 AI 測算報告產出全流程測試');
  console.log('====================================================\n');

  const devVars = loadDevVars();
  const fakeDb = createFakeD1();

  const env = {
    DB: fakeDb,
    AUTH_SECRET: devVars.AUTH_SECRET || 'test_auth_secret_for_session_token_32chars',
    PORTALY_CALLBACK_SECRET: 'portaly_test_signing_secret_2026',
    GROQ_API_KEY: devVars.GROQ_API_KEY || process.env.GROQ_API_KEY || '',
    GEMINI_API_KEY: devVars.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '',
    GROQ_TEXT_MODEL: 'openai/gpt-oss-20b',
    GEMINI_TEXT_MODEL: devVars.GEMINI_TEXT_MODEL || 'gemini-3.5-flash',
    ALLOW_DEV_LOGIN: 'true',
    PAYMENTS_ENABLED: 'true'
  };

  const userId = 'u_weiyo_tester';
  const userEmail = 'weiyo@zenasker.com';

  // 0. 初始化使用者
  await fakeDb.raw.exec(`
    INSERT INTO users (id, display_name, email, provider, provider_subject, status, created_at)
    VALUES ('${userId}', 'weiyo', '${userEmail}', 'email', '${userEmail}', 'active', ${Math.floor(Date.now() / 1000)})
  `);

  console.log('【步驟 0】檢查使用者初始點數：');
  let credits = await getCreditsMap(env, userId);
  console.log(`  當前感情篇 (love) 點數：${credits.love} 次（尚未購買，餘額為 0）\n`);
  assert.equal(credits.love, 0);

  // 1. 前端發起建立訂單（選定「單項體驗方案 199」，選擇主題「感情篇」）
  const tradeNo = `WXT${Date.now().toString().slice(-8)}LOVE`;
  console.log(`【步驟 1】使用者選購「單項體驗方案 199」（感情篇），系統建立待付款訂單：`);
  const orderId = await createOrder(env, {
    userId,
    productId: 'single',
    amount: 199,
    themes: ['love'],
    merchantTradeNo: tradeNo,
    termsVersion: '20260901',
    provider: 'portaly'
  });
  console.log(`  ✓ 訂單建立成功，訂單號：${orderId}，交易序號：${tradeNo}\n`);

  // 2. 模擬使用者在 Portaly 收銀台付款成功，Portaly Webhook 發送簽章通知
  console.log('【步驟 2】模擬使用者於 Portaly 完成付款，Portaly Webhook 發送付款完成通知：');
  const timestamp = new Date().toISOString();
  const webhookPayload = {
    event: 'digital_product.checkout.completed',
    sessionId: 'dps_live_session_123456',
    merchantOrderNumber: tradeNo,
    totalAmount: 199,
    currency: 'TWD',
    customerEmail: userEmail,
    metadata: {
      orderId,
      tradeNo
    }
  };

  const signature = await signPortalyCallback({
    secret: env.PORTALY_CALLBACK_SECRET,
    payload: webhookPayload,
    timestamp
  });

  const webhookReq = new Request('https://www.zenasker.com/api/portaly/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-portaly-signature': signature,
      'x-portaly-timestamp': timestamp,
      'x-portaly-event': 'digital_product.checkout.completed'
    },
    body: JSON.stringify(webhookPayload)
  });

  const webhookRes = await webhookHandler({ request: webhookReq, env });
  const webhookData = await webhookRes.json();
  assert.equal(webhookRes.status, 200);
  assert.equal(webhookData.ok, true);
  console.log(`  ✓ Webhook 數位簽章驗證通過，訂單自動核銷！\n`);

  // 3. 驗證入帳與額度
  const order = await getOrderByTradeNo(env, tradeNo);
  assert.equal(order.status, 'PAID');
  credits = await getCreditsMap(env, userId);
  console.log('【步驟 3】驗證會員帳號額度（已由 Portaly 自動核銷入帳）：');
  console.log(`  ✓ 訂單狀態：${order.status}`);
  console.log(`  ✓ 感情篇 (love) 專屬額度入帳：${credits.love} 次（單項方案核發 4 次永久點數）\n`);
  assert.equal(credits.love, 4);

  // 4. 使用者發起測算，送出求問單並呼叫 /api/reading/generate
  console.log('【步驟 4】使用者提交測算求問單，執行扣點 (1點) 並產出 AI 深度報告：');
  const userSessionToken = await signUserSession(env, { uid: userId, provider: 'email' });
  const nonce = `test_req_${Date.now()}`;
  const generatePayload = {
    themeId: 'love',
    themeKey: 'love',
    nonce,
    answers: {
      target: '本人',
      gender: '女',
      age: '32',
      relationshipStatus: '單身',
      occupation: '科技業專案經理',
      question: '想知道今年下半年有沒有機會遇到正緣對象？目前的桃花狀態如何，該積極社交還是沉澱自己？'
    }
  };

  const generateReq = new Request('https://www.zenasker.com/api/reading/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `wx_session=${userSessionToken}`
    },
    body: JSON.stringify(generatePayload)
  });

  console.log('  ⏳ 正在呼叫問仙壇 AI 管線（嚴格依循正統易學與四大段落合約）...');
  const generateRes = await generateHandler({ request: generateReq, env });
  const generateData = await generateRes.json();

  if (generateRes.status !== 200) {
    console.error('產出失敗:', generateData);
  }
  assert.equal(generateRes.status, 200);
  assert.equal(generateData.ok, true);

  // 5. 驗證扣點結果
  const creditsAfterReading = await getCreditsMap(env, userId);
  console.log(`  ✓ 測算扣點成功！感情篇剩餘點數：${creditsAfterReading.love} 次（由 4 點扣減 1 點為 3 點）`);
  assert.equal(creditsAfterReading.love, 3);

  // 6. 印出產出的專業報告成果
  console.log('\n====================================================');
  console.log('📜 產出之【感情篇】深度解碼命理報告成果');
  console.log('====================================================\n');
  const r = generateData.report;
  console.log(`【總覽摘要】：\n${r.summary || r.advice}\n`);

  if (Array.isArray(r.sections)) {
    r.sections.forEach((sec, idx) => {
      console.log(`【篇章第 ${idx + 1} 段 · ${sec.heading}】：`);
      console.log(`${sec.body}\n`);
    });
  }

  if (Array.isArray(r.actions) && r.actions.length > 0) {
    console.log('【仙佛錦囊具體指引】：');
    r.actions.forEach((act, idx) => {
      console.log(`  ${idx + 1}. ${act}`);
    });
  }

  console.log('\n====================================================');
  console.log('🎉 全流程測試（Portaly 金流付款 -> Webhook 簽章入帳 -> 扣點 -> AI 報告生成）圓滿成功！');
  console.log('====================================================\n');

  fakeDb.close();
}

runEndToEndFlow().catch((err) => {
  console.error('❌ 測試過程發生異常:', err);
  process.exit(1);
});
