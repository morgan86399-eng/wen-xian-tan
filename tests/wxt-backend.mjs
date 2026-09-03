/* 問仙壇後端閉環：冪等 callback、原子扣點、禁用詞、OTP 不回碼、generate 401 */

import assert from 'node:assert/strict';
import { createFakeD1 } from './helpers/fake-d1.mjs';
import { onRequest as ecpayCallback } from '../functions/api/ecpay/callback.js';
import { onRequest as sendCode } from '../functions/api/auth/email/send-code.js';
import { onRequest as verifyCode } from '../functions/api/auth/email/verify.js';
import { onRequest as generate } from '../functions/api/reading/generate.js';
import {
  atomicDeductCredit,
  createOrder,
  grantCreditsForOrder,
  getCreditsMap,
  putVerifyCode,
  consumeVerifyCode,
  VERIFY_CODE_MAX_ATTEMPTS,
  upsertEmailUser,
  recordPaymentEvent,
  markOrderPaid
} from '../functions/lib/wxt/store.mjs';
import { scanForbidden, replaceForbidden } from '../functions/lib/wxt/forbidden.mjs';
import { getEcpayConfig, calculateCheckMacValue } from '../functions/lib/wxt/ecpay.mjs';
import { signUserSession, sessionCookieHeader } from '../functions/lib/wxt/auth.mjs';
import { generateReport } from '../functions/lib/wxt/ai.mjs';
import { formatAdviceFromReport, pickReportObject, withAdviceField } from '../functions/lib/wxt/report-format.mjs';

let passed = 0;

const BASE_ENV = {
  AUTH_SECRET: 'test-auth-secret',
  SITE_URL: 'https://wenxiantan.example.test',
  ECPAY_MERCHANT_ID: '3002607',
  ECPAY_HASH_KEY: 'pwFHCqoQZGmho4w6',
  ECPAY_HASH_IV: 'EkRm7iFT261dpevs',
  ECPAY_IS_PRODUCTION: 'false',
  RESEND_API_KEY: 're_test_key',
  FROM_EMAIL: 'test@example.test',
  GROQ_API_KEY: 'gsk_test'
};

async function check(name, fn) {
  const db = createFakeD1();
  try {
    await fn({ ...BASE_ENV, DB: db, RL: createFakeKv() });
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(`      ${error.stack || error.message}`);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

function createFakeKv() {
  const map = new Map();
  return {
    async get(key) { return map.get(key) || null; },
    async put(key, value) { map.set(key, value); }
  };
}

async function postForm(handler, env, params) {
  const form = new FormData();
  for (const [k, v] of Object.entries(params)) form.append(k, v);
  const request = new Request('https://example.test/api/ecpay/callback', { method: 'POST', body: form });
  const response = await handler({ request, env });
  return { status: response.status, body: await response.text() };
}

async function postJson(handler, env, body, headers = {}) {
  const request = new Request('https://example.test/api/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  const response = await handler({ request, env });
  return { status: response.status, body: await response.json(), raw: response };
}

console.log('\n[綠界 callback 冪等]');

await check('同一 event 重送只發點一次', async (env) => {
  const { id: userId } = await upsertEmailUser(env, 'buyer@example.test');
  const orderId = await createOrder(env, {
    userId,
    productId: 'single',
    amount: 199,
    themes: ['love'],
    merchantTradeNo: 'WXT250903120000ABC'
  });

  const params = {
    MerchantID: env.ECPAY_MERCHANT_ID,
    MerchantTradeNo: 'WXT250903120000ABC',
    RtnCode: '1',
    RtnMsg: 'paid',
    TradeAmt: '199',
    PaymentDate: '2026/09/03 12:00:00',
    TradeNo: 'ECP123'
  };
  const config = getEcpayConfig(env);
  params.CheckMacValue = await calculateCheckMacValue(params, config.hashKey, config.hashIV);

  const first = await postForm(ecpayCallback, env, params);
  const second = await postForm(ecpayCallback, env, params);
  assert.equal(first.body, '1|OK');
  assert.equal(second.body, '1|OK');

  const credits = await getCreditsMap(env, userId);
  assert.equal(credits.love, 3, '應只發 3 點');
  assert.equal(orderId.length > 0, true);
});

console.log('\n[原子扣點]');

await check('餘額不足時 UPDATE changes=0', async (env) => {
  const { id: userId } = await upsertEmailUser(env, 'reader@example.test');
  const deduct = await atomicDeductCredit(env, {
    userId,
    themeId: 'love',
    idempotencyKey: 'reading:test-1'
  });
  assert.equal(deduct.ok, false);
  assert.equal(deduct.insufficient, true);
});

await check('有餘額時原子扣 1 點', async (env) => {
  const { id: userId } = await upsertEmailUser(env, 'reader2@example.test');
  await grantCreditsForOrder(env, {
    userId,
    orderId: 'ord_test',
    themes: ['love'],
    creditsPerTheme: 1,
    idempotencyPrefix: 'purchase:ord_test'
  });
  const deduct = await atomicDeductCredit(env, {
    userId,
    themeId: 'love',
    idempotencyKey: 'reading:test-2'
  });
  assert.equal(deduct.ok, true);
  const credits = await getCreditsMap(env, userId);
  assert.equal(credits.love, 0);
});

console.log('\n[禁用詞掃描]');

await check('命中百分比與 W 系列禁詞', async () => {
  const hits = scanForbidden('你的感情卡住了，契合度 93%，身體很誠實。');
  assert.ok(hits.includes('卡'));
  assert.ok(hits.some((h) => /%/.test(h)));
  const cleaned = replaceForbidden('這段很爛，卡住了 50%');
  assert.ok(!cleaned.includes('爛'));
});

console.log('\n[send-code 不回驗證碼]');

await check('回應 JSON 不含 6 位數字', async (env) => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ id: 'email_1' }) });
  const { status, body, raw } = await postJson(sendCode, env, { email: 'otp@example.test' });
  globalThis.fetch = realFetch;
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  const dump = JSON.stringify(body);
  assert.ok(!/\b\d{6}\b/.test(dump), `回應含 6 位數：${dump}`);
  assert.equal(body.code, undefined);
  assert.equal(raw.headers.get('set-cookie'), null);
});

await check('缺 RESEND_API_KEY 回 503 且無 cookie', async (env) => {
  const noResend = { ...env };
  delete noResend.RESEND_API_KEY;
  const { status, body, raw } = await postJson(sendCode, noResend, { email: 'otp@example.test' });
  assert.equal(status, 503);
  assert.equal(body.error, 'SERVICE_UNAVAILABLE');
  assert.equal(raw.headers.get('set-cookie'), null);
});

console.log('\n[verify OTP]');

await check('verify 成功才 Set-Cookie', async (env) => {
  const email = 'cookie@example.test';
  await putVerifyCode(env, email, '654321');
  const { status, body, raw } = await postJson(verifyCode, env, { email, code: '654321' });
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.ok(raw.headers.get('set-cookie')?.includes('wx_session='));
});

await check('未 verify 時 send-code 不發 session', async (env) => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ id: 'email_1' }) });
  const { raw } = await postJson(sendCode, env, { email: 'nosession@example.test' });
  globalThis.fetch = realFetch;
  assert.equal(raw.headers.get('set-cookie'), null);
});

await check('錯碼達上限後鎖定', async (env) => {
  const email = 'lock@example.test';
  await putVerifyCode(env, email, '123456');
  for (let i = 0; i < VERIFY_CODE_MAX_ATTEMPTS; i += 1) {
    const wrong = await postJson(verifyCode, env, { email, code: '000000' });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.error, 'INVALID_CODE');
  }
  const correct = await postJson(verifyCode, env, { email, code: '123456' });
  assert.equal(correct.status, 401);
  assert.equal(correct.body.error, 'INVALID_CODE');
  const consumed = await consumeVerifyCode(env, email, '123456');
  assert.equal(consumed.ok, false);
});

console.log('\n[generate 未登入 401]');

await check('未登入 generate 回 UNAUTHENTICATED', async (env) => {
  const { status, body } = await postJson(generate, env, {
    themeId: 'love',
    requestId: 'nonce-abc-12345678',
    answers: { question: '測試' }
  });
  assert.equal(status, 401);
  assert.equal(body.error, 'UNAUTHENTICATED');
});

await check('已登入但缺點數回 402', async (env) => {
  const { id } = await upsertEmailUser(env, 'gen@example.test');
  const token = await signUserSession(env, { uid: id, provider: 'email' });
  const { status, body } = await postJson(generate, env, {
    themeId: 'love',
    requestId: 'nonce-def-12345678',
    answers: { question: '測試' }
  }, { cookie: `wx_session=${token}` });
  assert.equal(status, 402);
  assert.equal(body.error, 'INSUFFICIENT_CREDITS');
});

console.log('\n[AI 呼叫順序]');

await check('有 Gemini 時先打 Gemini', async (env) => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('generativelanguage.googleapis.com')) {
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"summary":"gemini-ok"}' }] } }],
          usageMetadata: { totalTokenCount: 8 }
        })
      };
    }
    throw new Error(`不該打到 ${url}`);
  };
  try {
    const result = await generateReport({
      ...env,
      GEMINI_API_KEY: 'AQ.test',
      GROQ_API_KEY: 'gsk_test'
    }, { systemPrompt: 's', userPrompt: 'u' });
    assert.match(calls[0], /generativelanguage\.googleapis\.com/);
    assert.equal(result.parsed.summary, 'gemini-ok');
    assert.equal(result.model, 'gemini-3.7-flash');
  } finally {
    globalThis.fetch = realFetch;
  }
});

await check('Gemini 失敗才打 Groq', async (env) => {
  const hosts = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    hosts.push(href);
    if (href.includes('generativelanguage.googleapis.com')) {
      return { ok: false, status: 429, text: async () => 'limit:0' };
    }
    if (href.includes('api.groq.com')) {
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"summary":"groq-ok"}' } }],
          usage: { total_tokens: 11 }
        })
      };
    }
    throw new Error(`不該打到 ${href}`);
  };
  try {
    const result = await generateReport({
      ...env,
      GEMINI_API_KEY: 'AQ.test',
      GROQ_API_KEY: 'gsk_test'
    }, { systemPrompt: 's', userPrompt: 'u' });
    assert.ok(hosts.some((item) => item.includes('generativelanguage.googleapis.com')));
    assert.ok(hosts.some((item) => item.includes('api.groq.com')));
    assert.equal(result.parsed.summary, 'groq-ok');
  } finally {
    globalThis.fetch = realFetch;
  }
});

console.log('\n[報告正文正規化]');

await check('summary+sections 收成 advice，前端能從 generate 包取出正文', async () => {
  const raw = {
    title: '感情篇',
    summary: '先把相處節奏看清楚。',
    sections: [
      { heading: '對象輪廓', body: '對方目前偏觀察、少主動。' },
      { heading: '下一步', body: '這週只確認一件具體約定。' }
    ]
  };
  const advice = formatAdviceFromReport(raw);
  assert.match(advice, /相處節奏/);
  assert.match(advice, /對象輪廓/);
  assert.match(advice, /具體約定/);
  assert.equal(withAdviceField(raw).advice, advice);

  const fromGenerate = pickReportObject({ ok: true, id: 'rd_1', report: raw });
  assert.equal(formatAdviceFromReport(fromGenerate), advice);

  const fromHistory = pickReportObject({
    id: 'rd_1',
    themeId: 'love',
    content: raw
  });
  assert.equal(formatAdviceFromReport(fromHistory), advice);
});

await check('已登入且有點數時 generate 回傳 advice 正文', async (env) => {
  const { id } = await upsertEmailUser(env, 'advice@example.test');
  const orderId = await createOrder(env, {
    userId: id,
    productId: 'single',
    amount: 199,
    themes: ['love'],
    merchantTradeNo: 'WXT250903120000ADV'
  });
  await grantCreditsForOrder(env, {
    userId: id,
    orderId,
    themes: ['love'],
    creditsPerTheme: 3,
    idempotencyPrefix: `order:${orderId}`
  });
  const token = await signUserSession(env, { uid: id, provider: 'email' });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('api.groq.com')) {
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                title: '感情篇',
                summary: '先把相處節奏看清楚。',
                sections: [{ heading: '下一步', body: '這週只確認一件具體約定。' }]
              })
            }
          }],
          usage: { total_tokens: 9 }
        })
      };
    }
    throw new Error(`不該打到 ${url}`);
  };
  try {
    const { status, body } = await postJson(generate, env, {
      themeId: 'love',
      requestId: 'nonce-advice-12345678',
      answers: { question: '這段關係接下來怎麼相處' }
    }, { cookie: `wx_session=${token}` });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.match(String(body.report.advice || ''), /相處節奏/);
    assert.match(String(body.report.advice || ''), /具體約定/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

console.log('\n[logout CSRF]');

await check('跨站 POST /api/logout 回 403', async (env) => {
  const { onRequest: logout } = await import('../functions/api/logout.js');
  const request = new Request('https://example.test/api/logout', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example' }
  });
  const response = await logout({ request, env });
  assert.equal(response.status, 403);
});

console.log(`\n問仙壇後端測試通過 ${passed} 項`);
