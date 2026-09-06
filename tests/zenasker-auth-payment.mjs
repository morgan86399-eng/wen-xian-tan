import assert from 'node:assert/strict';
import { createFakeD1 } from './helpers/fake-d1.mjs';
import { cookieDomainForSiteUrl, buildSetCookie } from '../functions/lib/wxt/http.mjs';
import {
  sessionCookieHeader,
  oauthSessionInterstitial,
  signUserSession
} from '../functions/lib/wxt/auth.mjs';
import { createPortalyCheckoutSession } from '../functions/lib/wxt/portaly.mjs';
import { onRequest as lineCallback } from '../functions/api/auth/line/callback.js';
import { onRequest as createOrderApi } from '../functions/api/orders/create.js';
import { putOAuthState, upsertEmailUser } from '../functions/lib/wxt/store.mjs';
import { readPaymentReturnOrderId } from '../src/js/payment-return.mjs';

let passed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(`      ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

console.log('\n[OAuth 中轉頁與 cookie Domain]');

await check('正式站 cookie 加 Domain=.zenasker.com', async () => {
  assert.equal(cookieDomainForSiteUrl('https://www.zenasker.com'), '.zenasker.com');
  assert.equal(cookieDomainForSiteUrl('https://zenasker.com'), '.zenasker.com');
  const header = buildSetCookie('wx_session', 'tok', {
    maxAge: 60,
    domain: cookieDomainForSiteUrl('https://www.zenasker.com')
  });
  assert.match(header, /Domain=\.zenasker.com/);
  assert.match(header, /wx_session=/);
});

await check('pages.dev 不加 Domain', async () => {
  assert.equal(cookieDomainForSiteUrl('https://wen-xian-tan.pages.dev'), '');
  const header = sessionCookieHeader('tok', { SITE_URL: 'https://wen-xian-tan.pages.dev' });
  assert.doesNotMatch(header, /Domain=/i);
});

await check('OAuth 中轉頁 200 且有 Set-Cookie 與 location.replace', async () => {
  const env = { SITE_URL: 'https://www.zenasker.com', AUTH_SECRET: 'test-auth-secret' };
  const token = await signUserSession(env, { uid: 'u_test', provider: 'line' });
  const res = oauthSessionInterstitial(env, token);
  assert.equal(res.status, 200);
  const cookie = res.headers.get('set-cookie') || '';
  assert.match(cookie, /wx_session=/);
  assert.match(cookie, /Domain=\.zenasker.com/);
  const html = await res.text();
  assert.match(html, /window\.location\.replace/);
  assert.match(html, /\/\?auth=ok/);
  assert.equal(res.headers.get('content-type')?.includes('text/html'), true);
});

await check('LINE callback 成功走 200 中轉頁並寫 cookie', async () => {
  const db = createFakeD1();
  const env = {
    AUTH_SECRET: 'test-auth-secret',
    SITE_URL: 'https://www.zenasker.com',
    LINE_CHANNEL_ID: 'line-id',
    LINE_CHANNEL_SECRET: 'line-secret',
    DB: db
  };
  await putOAuthState(env, { state: 'st_line_1', provider: 'line' });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('oauth2/v2.1/token')) {
      return { ok: true, json: async () => ({ access_token: 'at_test' }) };
    }
    if (target.includes('/v2/profile')) {
      return { ok: true, json: async () => ({ userId: 'U123', displayName: 'LineUser' }) };
    }
    throw new Error(`不該打到 ${target}`);
  };
  try {
    const request = new Request('https://www.zenasker.com/api/auth/line/callback?code=abc&state=st_line_1');
    const res = await lineCallback({ request, env });
    assert.equal(res.status, 200);
    const cookie = res.headers.get('set-cookie') || '';
    assert.match(cookie, /wx_session=/);
    assert.match(cookie, /Domain=\.zenasker.com/);
    const html = await res.text();
    assert.match(html, /window\.location\.replace/);
    assert.match(html, /auth=ok/);
  } finally {
    globalThis.fetch = realFetch;
    db.close();
  }
});

console.log('\n[建單失敗不得回 portaly.cc]');

await check('沒有 API 設定時即使有 PORTALY_URL 也不回 portaly.cc', async () => {
  const result = await createPortalyCheckoutSession({
    env: {
      PORTALY_URL_SINGLE: 'https://portaly.cc/morgan8639/product/2LFgafSJfCLGGImzHZcT',
      PORTALY_PRODUCT_ID_SINGLE: ''
    },
    orderId: 'ord_1',
    tradeNo: 'WXT1',
    product: { id: 'single', amount: 199, label: '單項' },
    themes: ['love'],
    user: { uid: 'u1', email: 'a@example.test', displayName: '會員' },
    siteUrl: 'https://www.zenasker.com'
  });
  assert.equal(result.ok, false);
  assert.equal(Boolean(result.checkoutUrl), false);
  assert.doesNotMatch(JSON.stringify(result), /portaly\.cc/);
});

await check('Checkout Session API 失敗不 fallback 到 portaly.cc', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({ error: 'invalid_plan' })
  });
  try {
    const result = await createPortalyCheckoutSession({
      env: {
        PORTALY_API_KEY: 'pk_test',
        PORTALY_PRODUCT_ID_SINGLE: '2LFgafSJfCLGGImzHZcT',
        PORTALY_URL_SINGLE: 'https://portaly.cc/morgan8639/product/2LFgafSJfCLGGImzHZcT'
      },
      orderId: 'ord_2',
      tradeNo: 'WXT2',
      product: { id: 'single', amount: 199, label: '單項' },
      themes: ['love'],
      user: { uid: 'u1', email: 'a@example.test', emailVerified: true, displayName: '會員' },
      siteUrl: 'https://www.zenasker.com'
    });
    assert.equal(result.ok, false);
    assert.equal(Boolean(result.checkoutUrl), false);
    assert.doesNotMatch(JSON.stringify(result), /portaly\.cc/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

await check('orders/create 在 Portaly API 失敗時不回 portaly.cc URL', async () => {
  const db = createFakeD1();
  const env = {
    AUTH_SECRET: 'test-auth-secret',
    SITE_URL: 'https://www.zenasker.com',
    PAYMENTS_ENABLED: 'true',
    PAYMENT_PROVIDER: 'portaly',
    PORTALY_API_KEY: 'pk_test',
    PORTALY_PRODUCT_ID_SINGLE: '2LFgafSJfCLGGImzHZcT',
    PORTALY_URL_SINGLE: 'https://portaly.cc/morgan8639/product/2LFgafSJfCLGGImzHZcT',
    DB: db
  };
  const { id: userId } = await upsertEmailUser(env, 'buyer@example.test');
  const token = await signUserSession(env, { uid: userId, provider: 'email' });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 502,
    json: async () => ({ error: 'upstream' })
  });
  try {
    const request = new Request('https://www.zenasker.com/api/orders/create', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `wx_session=${token}`
      },
      body: JSON.stringify({ productId: 'single', themeKeys: ['love'] })
    });
    const res = await createOrderApi({ request, env });
    const body = await res.json();
    assert.notEqual(res.status, 200);
    assert.equal(Boolean(body.checkoutUrl || body.url), false);
    assert.doesNotMatch(JSON.stringify(body), /portaly\.cc/);
  } finally {
    globalThis.fetch = realFetch;
    db.close();
  }
});

console.log('\n[付款回跳吃 orderId]');

await check('readPaymentReturnOrderId 優先讀 orderId', async () => {
  assert.equal(readPaymentReturnOrderId('?payment=success&orderId=ord_abc'), 'ord_abc');
  assert.equal(readPaymentReturnOrderId('?order=legacy_1'), 'legacy_1');
  assert.equal(readPaymentReturnOrderId('payment=success&orderId=new_id&order=old_id'), 'new_id');
  assert.equal(readPaymentReturnOrderId(new URLSearchParams('payment=success&orderId=from_params')), 'from_params');
});

console.log(`\nZenasker 登入金流測試通過 ${passed} 項`);
