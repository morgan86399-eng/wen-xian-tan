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
import {
  scanForbidden,
  replaceForbidden,
  buildSystemPrompt,
  buildUserPrompt,
  THEME_SKELETONS
} from '../functions/lib/wxt/forbidden.mjs';
import { getEcpayConfig, calculateCheckMacValue } from '../functions/lib/wxt/ecpay.mjs';
import { CREDITS_BY_THEME, validateOrderInput, getProduct } from '../functions/lib/wxt/products.mjs';
import { onRequest as devLogin } from '../functions/api/auth/dev-login.js';
import { onRequest as createOrderApi } from '../functions/api/ecpay/create.js';
import { saveReading, getOrderByTradeNo } from '../functions/lib/wxt/store.mjs';
import { signUserSession, sessionCookieHeader } from '../functions/lib/wxt/auth.mjs';
import { generateReport } from '../functions/lib/wxt/ai.mjs';
import {
  formatAdviceFromReport,
  pickReportObject,
  withAdviceField,
  extractActions,
  extractSections,
  hasWeakActions,
  hasVagueBody,
  isIncompleteReport
} from '../functions/lib/wxt/report-format.mjs';

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
  assert.equal(credits.love, CREDITS_BY_THEME.love, '應只發一次感情篇的量');
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
    creditsByTheme: { love: 1 },
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

await check('Groq 是第一順位，有 Gemini 也先打 Groq', async (env) => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('api.groq.com')) {
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"summary":"groq-ok"}' } }],
          usage: { total_tokens: 11 }
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
    assert.match(calls[0], /api\.groq\.com/, '第一通應該打 Groq');
    assert.equal(calls.length, 1, 'Groq 成功就不該再打 Gemini');
    assert.equal(result.parsed.summary, 'groq-ok');
  } finally {
    globalThis.fetch = realFetch;
  }
});

await check('Groq 撞到速率上限才換 Gemini', async (env) => {
  const hosts = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    hosts.push(href);
    if (href.includes('api.groq.com')) {
      return { ok: false, status: 429, text: async () => 'rate limit' };
    }
    if (href.includes('generativelanguage.googleapis.com')) {
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"summary":"gemini-ok"}' }] } }],
          usageMetadata: { totalTokenCount: 8 }
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
    assert.match(hosts[0], /api\.groq\.com/, '先打 Groq');
    assert.ok(hosts.some((item) => item.includes('generativelanguage.googleapis.com')), 'Groq 失敗要換 Gemini');
    assert.equal(result.parsed.summary, 'gemini-ok');
  } finally {
    globalThis.fetch = realFetch;
  }
});

await check('Groq 不可用時，Gemini 主力型號滿載會換同金鑰的次選型號', async (env) => {
  const models = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.includes('api.groq.com')) return { ok: false, status: 429, text: async () => 'rate limit' };
    const model = decodeURIComponent(href.split('/models/')[1].split(':')[0]);
    models.push(model);
    if (model === 'gemini-3.6-flash') {
      return { ok: false, status: 503, text: async () => 'high demand' };
    }
    return {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"summary":"fallback-ok"}' }] } }],
        usageMetadata: { totalTokenCount: 8 }
      })
    };
  };
  try {
    const result = await generateReport({
      ...env,
      GEMINI_API_KEY: 'AQ.test',
      GROQ_API_KEY: 'gsk_test',
      GEMINI_TEXT_MODEL: 'gemini-3.6-flash',
      GEMINI_TEXT_MODEL_FALLBACK: 'gemini-3.5-flash'
    }, { systemPrompt: 's', userPrompt: 'u' });
    assert.deepEqual(models, ['gemini-3.6-flash', 'gemini-3.5-flash']);
    assert.equal(result.model, 'gemini-3.5-flash');
    assert.equal(result.parsed.summary, 'fallback-ok');
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
    creditsByTheme: { love: 3 },
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
                sections: [
                  { heading: '對象輪廓與相處模式', body: '對方目前偏觀察、少主動，遇到不確定的事會先退一步，不是沒有意願，而是需要更多時間確認。' },
                  { heading: '這段關係目前的節奏', body: '先把相處節奏看清楚，你想要的是明確的方向，對方目前還在適應階段，兩邊的速度並不一致。' },
                  { heading: '適合主動或等待的時機', body: '週末再開口比較合適，平日彼此的心力都被工作佔滿，這時候談重要的事容易失焦也容易誤解。' },
                  { heading: '自身要調整的互動習慣', body: '這週只確認一件具體約定就好，一次談太多件事，對方會不知道要先回應哪一個，反而更沉默。' }
                ],
                actions: [
                  '這週三晚上傳一則訊息給對方，只約週末白天見面，不要在訊息裡談關係定位',
                  '見面時把最想確認的那一件事寫成一句話先講，講完停下來聽對方怎麼回應',
                  '這週先不要主動追問進度，把注意力放回自己原本安排好的行程與生活節奏'
                ]
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


console.log('\n[報告合約：禁止追問]');

const INCOMPLETE_SAMPLE = {
  title: '缺少關鍵資訊，請提供七步答案以完成解讀',
  summary: '請提供七步答案，以便完成個人化的感情解讀報告。',
  sections: [{ heading: '需要您補充的資訊', body: '1. 您對自己的性格與核心價值的描述' }]
};

const GOOD_SAMPLE = {
  title: '關係的穩定始於內心的從容',
  summary: '先把相處節奏看清楚。',
  sections: [
    { heading: '對象輪廓與相處模式', body: '對方在意的是被理解，比起被安排行程，他更希望有人願意聽完整件事。先從日常對話裡的小事開始接話，不要急著給結論或建議。' },
    { heading: '這段關係目前的節奏', body: '目前兩個人的節奏並不同步，你想確認方向，對方還停留在觀察期。先把相處節奏看清楚，不急著在這個月下定論，讓彼此都有喘息的空間。' },
    { heading: '適合主動或等待的時機', body: '週間對方的心力多半放在工作上，這時候談重要的事容易失焦。週末白天兩個人都比較放鬆，這個時段開口比較合適，也比較聽得進去。' },
    { heading: '自身要調整的互動習慣', body: '你習慣把話講一半就停下來，等對方自己意會，這樣容易造成誤解。把想說的話講完整，包含你的感受和你希望的做法，對方才有辦法回應。' }
  ],
  actions: [
    '這週挑一個平常的晚上，主動約對方吃一頓飯，只聊生活不談將來',
    '把最近三次對話裡對方主動提起的事記下來，找出他真正在意的主題',
    '週末之前把心裡最想確認的一件事，用一句話講給對方聽'
  ]
};

await check('六篇 system prompt 都含禁止追問與自己那四段骨架', async () => {
  for (const [themeId, skeleton] of Object.entries(THEME_SKELETONS)) {
    const prompt = buildSystemPrompt(themeId);
    assert.match(prompt, /嚴禁向使用者索取任何補充資料/, `${themeId} 少了禁止索取`);
    assert.match(prompt, /嚴禁反問使用者/, `${themeId} 少了禁止反問`);
    assert.match(prompt, /actions 必須剛好三條/, `${themeId} 少了建設性建議要求`);
    assert.match(prompt, /本次主要問題/, `${themeId} 少了扣住使用者問題的要求`);
    assert.match(prompt, /嚴禁寫成任何人都適用的通用範本/, `${themeId} 少了禁止通用範本`);
    assert.equal(skeleton.length, 4, `${themeId} 骨架不是四段`);
    for (const heading of skeleton) {
      assert.ok(prompt.includes(heading), `${themeId} prompt 少了骨架「${heading}」`);
    }
  }
  const loveHeadings = THEME_SKELETONS.love.join('');
  const wealthPrompt = buildSystemPrompt('wealth');
  assert.ok(!wealthPrompt.includes(loveHeadings), '財運篇不該沿用感情篇骨架');
});

await check('buildUserPrompt 送白話標籤，略過期望寫成未指定並要求直接產出', async () => {
  const prompt = buildUserPrompt({
    themeId: 'love',
    answers: {
      gender: 'male',
      age: '25-34',
      relation: 'self_love',
      role: 'single_seeking',
      genderLabel: '男性 (乾造)',
      ageLabel: '25 ~ 34 歲',
      relationLabel: '本人自身',
      roleLabel: '單身尋覓',
      question: '目前這段感情是否能修成正果、邁入婚姻？',
      goal: 'skip'
    }
  });
  assert.match(prompt, /本人自身/);
  assert.match(prompt, /單身尋覓/);
  assert.match(prompt, /男性 \(乾造\)/);
  assert.ok(!prompt.includes('self_love'), '不該把代碼送給模型');
  assert.ok(!prompt.includes('single_seeking'), '不該把代碼送給模型');
  assert.match(prompt, /期望方向：未指定，請全方位推演/);
  assert.match(prompt, /本次未提供，改以前六項推演/);
  assert.match(prompt, /請直接輸出完整報告，不得要求補充任何資料/);
});

await check('isIncompleteReport 擋掉追問文、段數不足、放行正常報告', async () => {
  assert.equal(isIncompleteReport(INCOMPLETE_SAMPLE), true);
  assert.equal(isIncompleteReport(GOOD_SAMPLE), false);
  assert.equal(isIncompleteReport({ title: '感情篇', summary: '', sections: [] }), true);
  // llama 沒有 JSON 模式時會整段吐純文字：有字但沒有段落結構，一樣算不合格
  assert.equal(isIncompleteReport({ title: '感情篇', summary: '一大段沒有結構的文字。'.repeat(50), sections: [] }), true);
  assert.equal(isIncompleteReport({ ...GOOD_SAMPLE, sections: GOOD_SAMPLE.sections.slice(0, 3) }), true);
  assert.equal(
    isIncompleteReport({ ...GOOD_SAMPLE, sections: [...GOOD_SAMPLE.sections.slice(0, 3), { heading: '第四段', body: '   ' }] }),
    true,
    '第四段只有空白也算不合格'
  );
});

await check('extractActions 收出三條建設性建議', async () => {
  assert.equal(extractActions(GOOD_SAMPLE).length, 3);
  assert.equal(extractActions(INCOMPLETE_SAMPLE).length, 0);
  assert.deepEqual(
    extractActions({ actions: [{ text: '1. 先把帳單列出來' }] }),
    ['先把帳單列出來']
  );
});

async function seedUserWithCredit(env, email) {
  const { id } = await upsertEmailUser(env, email);
  const orderId = await createOrder(env, {
    userId: id,
    productId: 'single',
    amount: 199,
    themes: ['love'],
    merchantTradeNo: `WXT${Date.now().toString().slice(-9)}${Math.random().toString(36).slice(2, 5)}`
  });
  await grantCreditsForOrder(env, {
    userId: id,
    orderId,
    themes: ['love'],
    creditsByTheme: { love: 3 },
    idempotencyPrefix: `order:${orderId}`
  });
  return id;
}

function groqReply(reportObj) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(reportObj) } }],
      usage: { total_tokens: 9 }
    })
  };
}

await check('模型回追問文時自動加硬指令重試，第二次過關才入庫', async (env) => {
  const id = await seedUserWithCredit(env, 'retry@example.test');
  const token = await signUserSession(env, { uid: id, provider: 'email' });
  const realFetch = globalThis.fetch;
  const prompts = [];
  globalThis.fetch = async (url, init) => {
    if (!String(url).includes('api.groq.com')) throw new Error(`不該打到 ${url}`);
    const sent = JSON.parse(init.body);
    prompts.push(sent.messages[1].content);
    return groqReply(prompts.length === 1 ? INCOMPLETE_SAMPLE : GOOD_SAMPLE);
  };
  try {
    const { status, body } = await postJson(generate, env, {
      themeId: 'love',
      requestId: 'nonce-retry-12345678',
      answers: { question: '這段關係能否修成正果', goal: 'skip', relationLabel: '本人自身' }
    }, { cookie: `wx_session=${token}` });
    assert.equal(status, 200);
    assert.equal(prompts.length, 2, '應該只重試一次');
    assert.match(prompts[1], /重試指令/, '第二次要帶加硬指令');
    assert.ok(!/請提供七步/.test(String(body.report.advice || '')), '追問文不可以當成品');
    assert.match(String(body.report.advice || ''), /相處節奏/);
    assert.equal((body.report.actions || []).length, 3);
  } finally {
    globalThis.fetch = realFetch;
  }
});

await check('整條鏈都拿不回任何內容才失敗退點', async (env) => {
  const id = await seedUserWithCredit(env, 'fail@example.test');
  const token = await signUserSession(env, { uid: id, provider: 'email' });
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url) => {
    if (!String(url).includes('api.groq.com')) throw new Error(`不該打到 ${url}`);
    calls += 1;
    return groqReply(INCOMPLETE_SAMPLE);
  };
  try {
    const { status, body } = await postJson(generate, env, {
      themeId: 'love',
      requestId: 'nonce-fail-12345678',
      answers: { question: '這段關係能否修成正果' }
    }, { cookie: `wx_session=${token}` });
    assert.equal(status, 503);
    assert.equal(body.error, 'GENERATION_FAILED');
    assert.equal(calls, 3, '三種策略都要試過才准放棄');
    const credits = await getCreditsMap(env, id);
    assert.equal(credits.love, 3, '完全拿不到內容才退點');
  } finally {
    globalThis.fetch = realFetch;
  }
});


console.log('\n[綠界 callback 逐欄核對]');

/** 用一筆正常訂單 + 一份可覆寫的回呼參數，產生通過簽章的表單 */
async function paidCallbackParams(env, { tradeNo, orderId, amount = 199, productId = 'single', overrides = {} }) {
  const params = {
    MerchantID: env.ECPAY_MERCHANT_ID,
    MerchantTradeNo: tradeNo,
    RtnCode: '1',
    RtnMsg: 'paid',
    TradeAmt: String(amount),
    PaymentDate: '2026/09/04 12:00:00',
    TradeNo: `ECP${tradeNo.slice(-6)}`,
    CustomField1: orderId,
    CustomField2: productId,
    ...overrides
  };
  const config = getEcpayConfig(env);
  params.CheckMacValue = await calculateCheckMacValue(params, config.hashKey, config.hashIV);
  return params;
}

async function seedOrder(env, { email, productId, themes, amount, tradeNo }) {
  const { id: userId } = await upsertEmailUser(env, email);
  const orderId = await createOrder(env, { userId, productId, amount, themes, merchantTradeNo: tradeNo });
  return { userId, orderId };
}

await check('TradeAmt 被改小時拒絕入帳', async (env) => {
  const tradeNo = 'WXT250904120000AMT';
  const { userId, orderId } = await seedOrder(env, {
    email: 'amount@example.test', productId: 'single', themes: ['love'], amount: 199, tradeNo
  });
  const params = await paidCallbackParams(env, { tradeNo, orderId, overrides: { TradeAmt: '1' } });
  const res = await postForm(ecpayCallback, env, params);

  assert.equal(res.status, 400);
  assert.equal(res.body, '0|AMOUNT_MISMATCH');
  const credits = await getCreditsMap(env, userId);
  assert.equal(credits.love, 0, '金額不符不可以發點');
  const order = await getOrderByTradeNo(env, tradeNo);
  assert.equal(order.status, 'PENDING', '金額不符訂單不可以變成已付款');
});

await check('MerchantID 不是自家商店代號時拒絕入帳', async (env) => {
  const tradeNo = 'WXT250904120000MID';
  const { userId, orderId } = await seedOrder(env, {
    email: 'mid@example.test', productId: 'single', themes: ['love'], amount: 199, tradeNo
  });
  const params = await paidCallbackParams(env, { tradeNo, orderId, overrides: { MerchantID: '9999999' } });
  const res = await postForm(ecpayCallback, env, params);

  assert.equal(res.body, '0|MERCHANT_MISMATCH');
  const credits = await getCreditsMap(env, userId);
  assert.equal(credits.love, 0);
});

await check('回呼帶到別筆訂單編號時拒絕入帳', async (env) => {
  const tradeNo = 'WXT250904120000CF1';
  const { userId, orderId } = await seedOrder(env, {
    email: 'cf1@example.test', productId: 'single', themes: ['love'], amount: 199, tradeNo
  });
  const params = await paidCallbackParams(env, { tradeNo, orderId, overrides: { CustomField1: 'ord_someone_else' } });
  const res = await postForm(ecpayCallback, env, params);

  assert.equal(res.body, '0|ORDER_MISMATCH');
  const credits = await getCreditsMap(env, userId);
  assert.equal(credits.love, 0);
  assert.ok(orderId.length > 0);
});

console.log('\n[六篇方案與各篇點數]');

await check('前端送的 all 方案後端收得到，六篇金額 999', async () => {
  const validated = validateOrderInput('all', ['love', 'work', 'career', 'wealth', 'family', 'children']);
  assert.equal(validated.ok, true, validated.error || '');
  assert.equal(validated.product.amount, 999);
  assert.equal(validated.themes.length, 6);
  assert.equal(getProduct('six'), null, '舊的 six 代號不應該再存在');
});

await check('六篇方案各篇點數不同且合計 18 次', async (env) => {
  const themes = ['love', 'work', 'career', 'wealth', 'family', 'children'];
  const tradeNo = 'WXT250904120000ALL';
  const { userId, orderId } = await seedOrder(env, {
    email: 'all@example.test', productId: 'all', themes, amount: 999, tradeNo
  });
  const params = await paidCallbackParams(env, { tradeNo, orderId, amount: 999, productId: 'all' });
  const res = await postForm(ecpayCallback, env, params);
  assert.equal(res.body, '1|OK');

  const credits = await getCreditsMap(env, userId);
  assert.deepEqual(credits, { love: 4, wealth: 4, career: 3, work: 3, family: 2, children: 2 });
  const total = Object.values(credits).reduce((sum, n) => sum + n, 0);
  assert.equal(total, 18);
});

console.log('\n[付款成功但核發中斷]');

/** 讓指定 SQL 第一次執行就炸掉，用來模擬 Worker 在核發途中被切斷 */
function dbFailingOnce(db, marker) {
  let armed = true;
  const boom = async () => { throw new Error('模擬 D1 中斷'); };
  return {
    ...db,
    prepare(sql) {
      if (armed && sql.includes(marker)) {
        armed = false;
        return { bind: () => ({ run: boom, first: boom, all: boom }) };
      }
      return db.prepare(sql);
    }
  };
}

await check('核發中斷時不留付款事件，綠界重送會把點數補齊', async (env) => {
  const themes = ['love', 'work', 'career', 'wealth', 'family', 'children'];
  const tradeNo = 'WXT250904120000RTY';
  const { userId, orderId } = await seedOrder(env, {
    email: 'retrygrant@example.test', productId: 'all', themes, amount: 999, tradeNo
  });
  const params = await paidCallbackParams(env, { tradeNo, orderId, amount: 999, productId: 'all' });

  const brokenEnv = { ...env, DB: dbFailingOnce(env.DB, 'INSERT INTO credits') };
  const broken = await postForm(ecpayCallback, brokenEnv, params);
  assert.ok(broken.status >= 500, `核發失敗要回非 2xx 讓綠界重送，實際 ${broken.status}`);
  assert.notEqual(broken.body, '1|OK', '核發沒完成不可以回 1|OK');

  const events = await env.DB.prepare('SELECT COUNT(*) AS c FROM payment_events').bind().first();
  assert.equal(events.c, 0, '核發沒完成就不可以留下付款事件，否則重送會被當重複而不補發');

  const retry = await postForm(ecpayCallback, env, params);
  assert.equal(retry.body, '1|OK');
  const credits = await getCreditsMap(env, userId);
  assert.deepEqual(credits, { love: 4, wealth: 4, career: 3, work: 3, family: 2, children: 2 });
});

console.log('\n[報告不可跨帳號讀取]');

await check('別人拿同一組 nonce 讀不到我的報告', async (env) => {
  const { id: ownerId } = await upsertEmailUser(env, 'owner@example.test');
  const rawNonce = 'shared-nonce-0904';
  await saveReading(env, {
    userId: ownerId,
    themeId: 'love',
    inputJson: { themeId: 'love' },
    contentJson: { summary: '這是本人的私密報告', sections: [] },
    model: 'test',
    tokens: 0,
    nonce: `${ownerId}:${rawNonce}`,
    idempotencyKey: `reading:${ownerId}:${rawNonce}`
  });

  const { id: strangerId } = await upsertEmailUser(env, 'stranger@example.test');
  const token = await signUserSession(env, { uid: strangerId, provider: 'email' });
  const { status, body } = await postJson(generate, env, {
    themeId: 'love',
    requestId: rawNonce,
    answers: { question: '借看一下', goal: 'skip' }
  }, { cookie: `wx_session=${token}` });

  assert.equal(status, 402, '沒點數的人應該被擋在扣點這關');
  assert.equal(body.error, 'INSUFFICIENT_CREDITS');
  assert.ok(!JSON.stringify(body).includes('私密報告'), '不可以回傳別人的報告內容');
});

console.log('\n[測試帳號入口]');

await check('沒開 ALLOW_DEV_LOGIN 時測試登入等同不存在', async (env) => {
  const { status, body, raw } = await postJson(devLogin, env, { username: 'user', password: 'user123' });
  assert.equal(status, 404);
  assert.equal(body.error, 'NOT_FOUND');
  assert.equal(raw.headers.get('set-cookie'), null, '不可以發 session');
});

await check('開了 ALLOW_DEV_LOGIN 才能用測試帳號', async (env) => {
  const { status, body } = await postJson(devLogin, { ...env, ALLOW_DEV_LOGIN: 'true' }, { username: 'user', password: 'user123' });
  assert.equal(status, 200);
  assert.equal(body.ok, true);
});

console.log('\n[肖像宣稱不得復活]');

await check('前端原始碼與首頁不得出現肖像或外貌宣稱', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const banned = ['肖像', '長相', '樣貌', '容貌'];
  const files = ['index.html', 'README.md']
    .concat(readdirSync(new URL('../src/js', import.meta.url)).map((f) => `src/js/${f}`));

  const hits = [];
  for (const file of files) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    for (const word of banned) {
      if (text.includes(word)) hits.push(`${file}:${word}`);
    }
  }
  assert.deepEqual(hits, [], `這些檔案還留著外貌宣稱：${hits.join('、')}`);
});



console.log('\n[收款總開關]');

await check('沒開 PAYMENTS_ENABLED 時建不了單', async (env) => {
  const { id } = await upsertEmailUser(env, 'blocked@example.test');
  const token = await signUserSession(env, { uid: id, provider: 'email' });
  const { status, body } = await postJson(createOrderApi, env, {
    productId: 'all',
    themeKeys: ['love', 'work', 'career', 'wealth', 'family', 'children']
  }, { cookie: `wx_session=${token}` });

  assert.equal(status, 503);
  assert.equal(body.error, 'PAYMENTS_DISABLED');
});

await check('收款關閉時，未登入者也拿不到建單資訊', async (env) => {
  const { status, body } = await postJson(createOrderApi, env, { productId: 'single', themeKeys: ['love'] });
  assert.equal(status, 503);
  assert.equal(body.error, 'PAYMENTS_DISABLED');
  assert.equal(body.action, undefined, '不可以外洩金流端點');
  assert.equal(body.fields, undefined, '不可以外洩簽章欄位');
});

await check('對外文案不得再出現特定金流商名稱', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const files = ['index.html'].concat(
    readdirSync(new URL('../src/js', import.meta.url)).map((f) => `src/js/${f}`)
  );
  const hits = [];
  for (const file of files) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    if (text.includes('綠界') || text.includes('ECPay')) hits.push(file);
  }
  assert.deepEqual(hits, [], `這些對外檔案還寫著金流商名稱：${hits.join('、')}`);
});



console.log('\n[建議品質門檻]');

const FOUR_SECTIONS = [
  { heading: '對象輪廓與相處模式', body: '對方在意的是被理解，比起被安排行程，他更希望有人願意聽完整件事，先從日常對話的小事開始接話。' },
  { heading: '這段關係目前的節奏', body: '目前兩個人的節奏並不同步，你想確認方向，對方還停留在觀察期，先讓彼此都有喘息的空間比較好。' },
  { heading: '適合主動或等待的時機', body: '週間對方心力多半在工作上，這時談重要的事容易失焦，週末白天兩人都放鬆，開口比較聽得進去。' },
  { heading: '自身要調整的互動習慣', body: '你習慣把話講一半就停，等對方自己意會，容易造成誤解，把感受和希望的做法一起講完整比較好。' }
];

const GOOD_ACTIONS = [
  '這週三晚上傳訊息給對方，只約週末白天見面，訊息裡不要談關係定位',
  '見面時把最想確認的那件事寫成一句話先講，講完停下來聽對方怎麼回應',
  '這週先不主動追問進度，把注意力放回自己原本安排好的行程與生活節奏'
];

await check('完全沒有建議的報告判不合格', async () => {
  assert.equal(hasWeakActions({ sections: FOUR_SECTIONS }), true);
  assert.equal(hasWeakActions({ sections: FOUR_SECTIONS, actions: [] }), true);
});

await check('建議少於三條判不合格', async () => {
  assert.equal(hasWeakActions({ sections: FOUR_SECTIONS, actions: GOOD_ACTIONS.slice(0, 2) }), true);
});

await check('建議太短判不合格', async () => {
  const short = ['多陪伴對方', '保持好心情', '記得多溝通'];
  assert.equal(hasWeakActions({ sections: FOUR_SECTIONS, actions: short }), true);
});

await check('三條建議重複判不合格', async () => {
  const dup = [GOOD_ACTIONS[0], GOOD_ACTIONS[0], GOOD_ACTIONS[1]];
  assert.equal(hasWeakActions({ sections: FOUR_SECTIONS, actions: dup }), true);
});

await check('建議整句照抄內文判不合格', async () => {
  const copied = [FOUR_SECTIONS[0].body, GOOD_ACTIONS[1], GOOD_ACTIONS[2]];
  assert.equal(hasWeakActions({ sections: FOUR_SECTIONS, actions: copied }), true);
});

await check('三條具體且互不重複的建議才放行', async () => {
  assert.equal(hasWeakActions({ sections: FOUR_SECTIONS, actions: GOOD_ACTIONS }), false);
});

await check('段落太短的報告判不完整', async () => {
  const thin = FOUR_SECTIONS.map((section) => ({ heading: section.heading, body: '再觀察看看。' }));
  assert.equal(isIncompleteReport({ sections: thin, actions: GOOD_ACTIONS }), true);
  assert.equal(isIncompleteReport({ sections: FOUR_SECTIONS, actions: GOOD_ACTIONS }), false);
});

await check('extractSections 收出四段標題與內文', async () => {
  const sections = extractSections({ sections: FOUR_SECTIONS });
  assert.equal(sections.length, 4);
  assert.equal(sections[0].heading, '對象輪廓與相處模式');
  assert.ok(sections[0].body.length > 20);
});

console.log('\n[建議不合格會重試]');

function groqPayload(obj) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(obj) } }],
      usage: { total_tokens: 12 }
    })
  };
}

await check('模型漏掉建議時自動重試，第二次補上才入庫', async (env) => {
  const id = await seedUserWithCredit(env, 'weakaction@example.test');
  const token = await signUserSession(env, { uid: id, provider: 'email' });
  const realFetch = globalThis.fetch;
  const prompts = [];
  globalThis.fetch = async (url, init) => {
    if (!String(url).includes('api.groq.com')) throw new Error(`不該打到 ${url}`);
    prompts.push(JSON.parse(init.body).messages[1].content);
    return groqPayload(prompts.length === 1
      ? { title: '感情篇', summary: '先看節奏。', sections: FOUR_SECTIONS }
      : { title: '感情篇', summary: '先看節奏。', sections: FOUR_SECTIONS, actions: GOOD_ACTIONS });
  };
  try {
    const { status, body } = await postJson(generate, env, {
      themeId: 'love',
      requestId: 'nonce-weakaction-1234',
      answers: { question: '這段關係接下來怎麼相處' }
    }, { cookie: `wx_session=${token}` });

    assert.equal(status, 200);
    assert.equal(prompts.length, 2, '應該重試一次');
    assert.match(prompts[1], /actions 不合格/, '第二次要帶建議專用的重試指令');
    assert.equal((body.report.actions || []).length, 3);
  } finally {
    globalThis.fetch = realFetch;
  }
});

await check('模型怎樣都不給建議時，仍然交付報告且不退點', async (env) => {
  const id = await seedUserWithCredit(env, 'noaction@example.test');
  const token = await signUserSession(env, { uid: id, provider: 'email' });
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url) => {
    if (!String(url).includes('api.groq.com')) throw new Error(`不該打到 ${url}`);
    calls += 1;
    return groqPayload({ title: '感情篇', summary: '先看節奏。', sections: FOUR_SECTIONS });
  };
  try {
    const { status, body } = await postJson(generate, env, {
      themeId: 'love',
      requestId: 'nonce-noaction-12345',
      answers: { question: '這段關係接下來怎麼相處' }
    }, { cookie: `wx_session=${token}` });

    assert.equal(status, 200, '付了錢就一定要拿到報告');
    assert.equal(body.ok, true);
    assert.equal((body.report.actions || []).length, 3, '保底也要給三條建議');
    assert.equal(body.degraded, true, '走保底要標記出來，方便日後監控');
    assert.ok(calls > 3, '應該有額外叫過只補建議的那一次');
    const credits = await getCreditsMap(env, id);
    assert.equal(credits.love, 2, '有交付就不退點');
  } finally {
    globalThis.fetch = realFetch;
  }
});

await check('前面都不給建議，專門補建議那次成功就不算保底', async (env) => {
  const id = await seedUserWithCredit(env, 'repair@example.test');
  const token = await signUserSession(env, { uid: id, provider: 'email' });
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    if (!String(url).includes('api.groq.com')) throw new Error(`不該打到 ${url}`);
    calls += 1;
    const prompt = JSON.parse(init.body).messages[1].content;
    if (prompt.includes('只回傳三條')) return groqPayload({ actions: GOOD_ACTIONS });
    return groqPayload({ title: '感情篇', summary: '先看節奏。', sections: FOUR_SECTIONS });
  };
  try {
    const { status, body } = await postJson(generate, env, {
      themeId: 'love',
      requestId: 'nonce-repair-1234567',
      answers: { question: '這段關係接下來怎麼相處' }
    }, { cookie: `wx_session=${token}` });

    assert.equal(status, 200);
    assert.equal(body.degraded, false, '有補到真的建議就不算保底');
    assert.equal((body.report.actions || []).length, 3);
    assert.ok(calls >= 4);
  } finally {
    globalThis.fetch = realFetch;
  }
});

await check('Groq JSON 模式回 400 時，關掉 JSON 模式仍然交付', async (env) => {
  const id = await seedUserWithCredit(env, 'jsonfail@example.test');
  const token = await signUserSession(env, { uid: id, provider: 'email' });
  const realFetch = globalThis.fetch;
  const modes = [];
  globalThis.fetch = async (url, init) => {
    if (!String(url).includes('api.groq.com')) throw new Error(`不該打到 ${url}`);
    const sent = JSON.parse(init.body);
    const jsonMode = Boolean(sent.response_format);
    modes.push(jsonMode);
    if (jsonMode) {
      return { ok: false, status: 400, text: async () => 'json_validate_failed' };
    }
    return groqPayload({ title: '感情篇', summary: '先看節奏。', sections: FOUR_SECTIONS, actions: GOOD_ACTIONS });
  };
  try {
    const { status, body } = await postJson(generate, env, {
      themeId: 'love',
      requestId: 'nonce-jsonfail-123456',
      answers: { question: '這段關係接下來怎麼相處' }
    }, { cookie: `wx_session=${token}` });

    assert.equal(status, 200, 'JSON 模式失敗不可以讓付費使用者空手');
    assert.equal(body.ok, true);
    assert.ok(modes.includes(false), '應該有一次是關掉 JSON 模式打的');
    const credits = await getCreditsMap(env, id);
    assert.equal(credits.love, 2, '有交付就不退點');
  } finally {
    globalThis.fetch = realFetch;
  }
});

console.log('\n[提示詞要貼合本人]');

await check('使用者填的自訂欄位會被送進提示詞', async () => {
  const prompt = buildUserPrompt({
    themeId: 'love',
    answers: {
      question: '我跟他還有機會嗎',
      genderLabel: '女性',
      ageLabel: '25 ~ 34 歲',
      roleLabel: '單身中 · 尋覓正緣',
      childAgeNote: '孩子今年小學三年級'
    }
  });
  assert.match(prompt, /我跟他還有機會嗎/, '主要問題要原話送進去');
  assert.match(prompt, /25 ~ 34 歲/, '年齡要送進去');
  assert.match(prompt, /孩子今年小學三年級/, '自訂欄位不可以被丟掉');
});



console.log('\n[不准模稜兩可]');

await check('內文出現順其自然這類空話判不合格', async () => {
  const vague = FOUR_SECTIONS.map((section, i) => ({
    heading: section.heading,
    body: i === 0
      ? '每個人的狀況因人而異，凡事順其自然就好，時間到了自然會有答案，先保持正面的心態面對眼前的變化。'
      : section.body
  }));
  assert.equal(hasVagueBody({ sections: vague }), true);
  assert.equal(hasVagueBody({ sections: FOUR_SECTIONS }), false);
});

await check('建議出現盡量、適時這種軟釘子判不合格', async () => {
  const hedged = [
    '這週三晚上盡量找時間跟對方講一下最近的狀況，看看他怎麼回應',
    '週末適時安排一次散步，把想講的事情帶出來聊',
    '這週先不主動追問進度，把注意力放回自己原本安排好的行程'
  ];
  assert.equal(hasWeakActions({ sections: FOUR_SECTIONS, actions: hedged }), true);
});

await check('三條建議只有一條講得出時間，判不合格', async () => {
  const noTime = [
    '這週三晚上傳訊息給對方，只約見面，訊息裡不要談關係定位',
    '把最想確認的那件事寫成一句話先講，講完停下來聽對方怎麼回應',
    '先不主動追問進度，把注意力放回自己原本安排好的行程與生活節奏'
  ];
  assert.equal(hasWeakActions({ sections: FOUR_SECTIONS, actions: noTime }), true);
});

await check('至少兩條有明確時間且沒有軟釘子才放行', async () => {
  assert.equal(hasWeakActions({ sections: FOUR_SECTIONS, actions: GOOD_ACTIONS }), false);
});

await check('六篇 system prompt 都寫明禁止模稜兩可', async () => {
  for (const themeId of Object.keys(THEME_SKELETONS)) {
    const prompt = buildSystemPrompt(themeId);
    assert.match(prompt, /禁止模稜兩可/, `${themeId} 少了禁止模稜兩可`);
    assert.match(prompt, /嚴禁「順其自然」/, `${themeId} 少了空話清單`);
    assert.match(prompt, /軟釘子/, `${themeId} 少了禁止軟釘子`);
    assert.match(prompt, /至少兩條要明確講出時間/, `${themeId} 少了時間要求`);
  }
});

await check('模型寫空話時自動重試，第二次寫具體才入庫', async (env) => {
  const id = await seedUserWithCredit(env, 'vague@example.test');
  const token = await signUserSession(env, { uid: id, provider: 'email' });
  const realFetch = globalThis.fetch;
  const prompts = [];
  const vagueSections = FOUR_SECTIONS.map((section, i) => ({
    heading: section.heading,
    body: i === 0
      ? '每個人的狀況因人而異，凡事順其自然就好，時間到了自然會有答案，先保持正面的心態面對眼前的變化。'
      : section.body
  }));
  globalThis.fetch = async (url, init) => {
    if (!String(url).includes('api.groq.com')) throw new Error(`不該打到 ${url}`);
    prompts.push(JSON.parse(init.body).messages[1].content);
    return groqPayload(prompts.length === 1
      ? { title: '感情篇', summary: '先看節奏。', sections: vagueSections, actions: GOOD_ACTIONS }
      : { title: '感情篇', summary: '先看節奏。', sections: FOUR_SECTIONS, actions: GOOD_ACTIONS });
  };
  try {
    const { status } = await postJson(generate, env, {
      themeId: 'love',
      requestId: 'nonce-vague-123456789',
      answers: { question: '這段關係接下來怎麼相處' }
    }, { cookie: `wx_session=${token}` });

    assert.equal(status, 200);
    assert.equal(prompts.length, 2, '空話應該觸發一次重試');
    assert.match(prompts[1], /出現「順其自然」/, '第二次要帶空話專用的重試指令');
  } finally {
    globalThis.fetch = realFetch;
  }
});


console.log(`\n問仙壇後端測試通過 ${passed} 項`);
