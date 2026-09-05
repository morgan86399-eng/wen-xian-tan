import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFakeD1 } from '../tests/helpers/fake-d1.mjs';
import { onRequest as meHandler } from '../functions/api/me.js';
import { onRequest as createOrderHandler } from '../functions/api/orders/create.js';
import { onRequest as getOrderHandler } from '../functions/api/orders/[orderId].js';
import { onRequest as webhookHandler } from '../functions/api/portaly/webhook.js';
import { onRequest as ecpayCallbackHandler } from '../functions/api/ecpay/callback.js';
import { onRequest as ecpayClientReturnHandler } from '../functions/api/ecpay/client-return.js';
import { onRequest as generateHandler } from '../functions/api/reading/generate.js';
import { onRequest as readingsHandler } from '../functions/api/readings.js';
import { onRequestGet as configHandler } from '../functions/api/config.js';
import { onRequest as devLoginHandler } from '../functions/api/auth/dev-login.js';
import { signUserSession, sessionCookieHeader, SESSION_COOKIE } from '../functions/lib/wxt/auth.mjs';
import { getCreditsMap, getOrderById } from '../functions/lib/wxt/store.mjs';
import { signPortalyCallback } from '../functions/lib/wxt/portaly.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

// 讀取本地 .dev.vars
function loadDevVars() {
  const vars = {};
  const devVarsPath = join(ROOT_DIR, '.dev.vars');
  if (existsSync(devVarsPath)) {
    const lines = readFileSync(devVarsPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        vars[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
      }
    }
  }
  return vars;
}

export async function createDemoServer(port = 3456) {
  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use((req, res, next) => {
    console.log(`[HTTP] ${req.method} ${req.url}`);
    next();
  });

  const devVars = loadDevVars();
  const db = createFakeD1();

  const env = {
    DB: db,
    AUTH_SECRET: devVars.AUTH_SECRET || 'test_auth_secret_for_session_token_32chars',
    PORTALY_CALLBACK_SECRET: 'portaly_test_signing_secret_2026',
    PORTALY_API_KEY: 'portaly_live_key_test',
    PORTALY_URL_SINGLE: 'https://portaly.cc/wenxiantan/single',
    PORTALY_URL_TRIPLE: 'https://portaly.cc/wenxiantan/triple',
    PORTALY_URL_ALL: 'https://portaly.cc/wenxiantan/all',
    GROQ_API_KEY: devVars.GROQ_API_KEY || process.env.GROQ_API_KEY || '',
    GEMINI_API_KEY: devVars.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '',
    GROQ_TEXT_MODEL: 'openai/gpt-oss-20b',
    GEMINI_TEXT_MODEL: devVars.GEMINI_TEXT_MODEL || 'gemini-3.5-flash',
    PAYMENT_PROVIDER: devVars.PAYMENT_PROVIDER || 'ecpay',
    PAYMENTS_ENABLED: 'true',
    ALLOW_DEV_LOGIN: 'true',
    BRAND_NAME: '問仙壇',
    ECPAY_MERCHANT_ID: devVars.ECPAY_MERCHANT_ID || '3002607',
    ECPAY_HASH_KEY: devVars.ECPAY_HASH_KEY || 'pwFHCqoQZGmho4w6',
    ECPAY_HASH_IV: devVars.ECPAY_HASH_IV || 'EkRm7iFT261dpevs',
    ECPAY_IS_PRODUCTION: 'false',
    SITE_URL: `http://localhost:${port}`
  };

  const TEST_USER_ID = 'u_weiyo_tester';
  const TEST_USER_EMAIL = 'weiyo@zenasker.com';
  const TEST_USER_NAME = 'weiyo';

  // 初始化測試使用者
  async function seedUser() {
    await db.raw.exec(`
      INSERT INTO users (id, display_name, email, provider, provider_subject, status, created_at)
      VALUES ('${TEST_USER_ID}', '${TEST_USER_NAME}', '${TEST_USER_EMAIL}', 'email', '${TEST_USER_EMAIL}', 'active', ${Math.floor(Date.now() / 1000)})
      ON CONFLICT(id) DO NOTHING;
    `);
  }
  await seedUser();

  const userSessionToken = await signUserSession(env, { uid: TEST_USER_ID, provider: 'email' });

  // 自動為所有瀏覽器連線加上登入 Session Cookie
  app.use((req, res, next) => {
    if (!req.headers.cookie || !req.headers.cookie.includes(SESSION_COOKIE)) {
      res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${userSessionToken}; Path=/; SameSite=Lax; Max-Age=86400`);
    }
    next();
  });

  // Cloudflare Pages Function 轉接器
  function adaptHandler(handler) {
    return async (req, res) => {
      try {
        const fullUrl = `http://localhost:${port}${req.originalUrl}`;
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) {
          if (v) headers.set(k, Array.isArray(v) ? v.join(',') : v);
        }
        // 確保 session 存在
        if (!headers.get('cookie') || !headers.get('cookie').includes(SESSION_COOKIE)) {
          headers.set('cookie', `${SESSION_COOKIE}=${userSessionToken}`);
        }

        let body = null;
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          const contentType = req.headers['content-type'] || '';
          if (contentType.includes('application/x-www-form-urlencoded')) {
            body = new URLSearchParams(req.body).toString();
            headers.set('content-type', 'application/x-www-form-urlencoded');
          } else {
            body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
            if (!headers.get('content-type')) {
              headers.set('content-type', 'application/json');
            }
          }
        }

        const request = new Request(fullUrl, {
          method: req.method,
          headers,
          body
        });

        const params = req.params || {};
        const response = await handler({ request, env, params });

        if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
          res.redirect(response.headers.get('location'));
          return;
        }

        res.status(response.status);
        response.headers.forEach((val, key) => {
          res.setHeader(key, val);
        });

        const text = await response.text();
        res.send(text);
      } catch (err) {
        console.error('API Error:', err);
        res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
      }
    };
  }

  // 1. 標準 API 路由
  app.get('/api/me', adaptHandler(meHandler));
  app.get('/api/config', adaptHandler(configHandler));
  app.post('/api/orders/create', adaptHandler(createOrderHandler));
  app.get('/api/orders/:orderId', adaptHandler(getOrderHandler));
  app.post('/api/portaly/webhook', adaptHandler(webhookHandler));
  app.post('/api/ecpay/callback', adaptHandler(ecpayCallbackHandler));
  app.post('/api/ecpay/client-return', adaptHandler(ecpayClientReturnHandler));
  app.post('/api/reading/generate', adaptHandler(generateHandler));
  app.get('/api/readings', adaptHandler(readingsHandler));
  app.post('/api/auth/dev-login', adaptHandler(devLoginHandler));

  // 動態更新與取得金流參數
  app.get('/api/demo/config', (req, res) => {
    res.json({
      ok: true,
      provider: env.PAYMENT_PROVIDER,
      portalyUrlSingle: env.PORTALY_URL_SINGLE || '',
      portalyUrlTriple: env.PORTALY_URL_TRIPLE || '',
      portalyUrlAll: env.PORTALY_URL_ALL || '',
      hasApiKey: Boolean(env.PORTALY_API_KEY),
      hasSecret: Boolean(env.PORTALY_CALLBACK_SECRET)
    });
  });

  app.post('/api/demo/save-config', (req, res) => {
    try {
      const { portalyUrlSingle, portalyUrlTriple, portalyUrlAll, portalyApiKey, portalySecret } = req.body;
      env.PAYMENT_PROVIDER = 'portaly';
      if (portalyUrlSingle !== undefined) env.PORTALY_URL_SINGLE = portalyUrlSingle.trim();
      if (portalyUrlTriple !== undefined) env.PORTALY_URL_TRIPLE = portalyUrlTriple.trim();
      if (portalyUrlAll !== undefined) env.PORTALY_URL_ALL = portalyUrlAll.trim();
      if (portalyApiKey !== undefined) env.PORTALY_API_KEY = portalyApiKey.trim();
      if (portalySecret !== undefined) env.PORTALY_CALLBACK_SECRET = portalySecret.trim();

      // 同步寫入 .dev.vars
      const devVarsPath = join(ROOT_DIR, '.dev.vars');
      let content = existsSync(devVarsPath) ? readFileSync(devVarsPath, 'utf8') : '';
      const updateKey = (key, val) => {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(content)) {
          content = content.replace(regex, `${key}=${val}`);
        } else {
          content += `\n${key}=${val}`;
        }
      };
      if (env.PORTALY_URL_SINGLE) updateKey('PORTALY_URL_SINGLE', env.PORTALY_URL_SINGLE);
      if (env.PORTALY_URL_TRIPLE) updateKey('PORTALY_URL_TRIPLE', env.PORTALY_URL_TRIPLE);
      if (env.PORTALY_URL_ALL) updateKey('PORTALY_URL_ALL', env.PORTALY_URL_ALL);
      if (env.PORTALY_API_KEY) updateKey('PORTALY_API_KEY', env.PORTALY_API_KEY);
      if (env.PORTALY_CALLBACK_SECRET) updateKey('PORTALY_CALLBACK_SECRET', env.PORTALY_CALLBACK_SECRET);
      updateKey('PAYMENT_PROVIDER', 'portaly');
      updateKey('PAYMENTS_ENABLED', 'true');
      writeFileSync(devVarsPath, content.trim() + '\n', 'utf8');

      console.log(`[Portaly Config Update] Portaly 商品網址與金鑰已寫入並即時生效！`);
      res.json({
        ok: true,
        message: 'Portaly 金流參數已更新成功並存檔！',
        provider: 'portaly',
        portalyUrlSingle: env.PORTALY_URL_SINGLE,
        portalyUrlTriple: env.PORTALY_URL_TRIPLE,
        portalyUrlAll: env.PORTALY_URL_ALL
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
  app.post('/api/reading/generate', adaptHandler(generateHandler));
  app.get('/api/readings', adaptHandler(readingsHandler));
  app.post('/api/auth/dev-login', adaptHandler(devLoginHandler));

  // 2. 專屬 Demo 輔助 API
  // 觸發自動簽章的 Portaly Webhook
  app.post('/api/demo/auto-sign-webhook', async (req, res) => {
    try {
      const { orderId } = req.body;
      if (!orderId) {
        return res.status(400).json({ ok: false, error: 'MISSING_ORDER_ID' });
      }

      const order = await getOrderById(env, orderId);
      if (!order) {
        return res.status(404).json({ ok: false, error: 'ORDER_NOT_FOUND' });
      }

      const timestamp = new Date().toISOString();
      const webhookPayload = {
        event: 'digital_product.checkout.completed',
        sessionId: `dps_live_${Date.now().toString(36)}`,
        merchantOrderNumber: order.merchant_trade_no,
        totalAmount: order.amount,
        currency: 'TWD',
        customerEmail: TEST_USER_EMAIL,
        metadata: {
          orderId: order.id,
          tradeNo: order.merchant_trade_no
        }
      };

      const signature = await signPortalyCallback({
        secret: env.PORTALY_CALLBACK_SECRET,
        payload: webhookPayload,
        timestamp
      });

      const fullUrl = `http://localhost:${port}/api/portaly/webhook`;
      const webhookReq = new Request(fullUrl, {
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

      const credits = await getCreditsMap(env, TEST_USER_ID);
      const updatedOrder = await getOrderById(env, orderId);

      res.json({
        ok: true,
        webhookStatus: webhookRes.status,
        webhookData,
        signature,
        timestamp,
        payload: webhookPayload,
        order: updatedOrder,
        credits
      });
    } catch (e) {
      console.error('Demo auto-sign webhook error:', e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // 重設測試使用者點數與訂單
  app.post('/api/demo/reset', async (req, res) => {
    try {
      await db.raw.exec(`
        DELETE FROM credit_ledger WHERE user_id = '${TEST_USER_ID}';
        DELETE FROM credits WHERE user_id = '${TEST_USER_ID}';
        DELETE FROM readings WHERE user_id = '${TEST_USER_ID}';
        DELETE FROM orders WHERE user_id = '${TEST_USER_ID}';
        DELETE FROM payment_events;
      `);
      const credits = await getCreditsMap(env, TEST_USER_ID);
      res.json({ ok: true, message: '測試資料已完全重置為 0 點狀態', credits });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // 取得完整 Demo 狀態
  app.get('/api/demo/state', async (req, res) => {
    try {
      const credits = await getCreditsMap(env, TEST_USER_ID);
      const orders = await db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 5').bind(TEST_USER_ID).all();
      const readings = await db.prepare('SELECT * FROM readings WHERE user_id = ? ORDER BY created_at DESC LIMIT 5').bind(TEST_USER_ID).all();
      res.json({
        ok: true,
        user: { id: TEST_USER_ID, email: TEST_USER_EMAIL, displayName: TEST_USER_NAME },
        credits,
        orders: orders.results || [],
        readings: readings.results || []
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // 靜態檔案服務
  // 1. 提供視覺化驗證中控台 /verify
  app.get('/verify', (req, res) => {
    try {
      const html = readFileSync(join(ROOT_DIR, 'public', 'verify.html'), 'utf8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e) {
      res.status(500).send('載入 verify.html 失敗: ' + e.message);
    }
  });

  // 2. 前台主頁 /
  app.get('/', (req, res) => {
    try {
      let html = '';
      const distIndex = join(ROOT_DIR, 'dist', 'index.html');
      if (existsSync(distIndex)) {
        html = readFileSync(distIndex, 'utf8');
      } else {
        html = readFileSync(join(ROOT_DIR, 'index.html'), 'utf8');
      }
      // 注入浮動驗證中控台按鈕
      const badgeHtml = `
        <div style="position:fixed;bottom:24px;right:24px;z-index:999999;box-shadow:0 8px 30px rgba(0,0,0,0.5);border-radius:12px;overflow:hidden;">
          <a href="/verify" style="display:flex;align-items:center;gap:8px;background:linear-gradient(135deg,#f0cb68,#c99320);color:#060b17;padding:12px 18px;font-weight:700;font-size:14px;text-decoration:none;border-radius:12px;border:1px solid #fff2c4;box-shadow:0 0 15px rgba(240,203,104,0.4);">
            <span>⚡️</span> 前往 Portaly 金流與 AI 驗證中控台
          </a>
        </div>
      `;
      if (html.includes('</body>')) {
        html = html.replace('</body>', `${badgeHtml}</body>`);
      } else {
        html += badgeHtml;
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (e) {
      res.status(500).send('載入主頁失敗: ' + e.message);
    }
  });

  // 3. 提供靜態資源
  app.use(express.static(join(ROOT_DIR, 'dist')));
  app.use(express.static(join(ROOT_DIR, 'public')));
  app.use('/src', express.static(join(ROOT_DIR, 'src')));
  app.use('/assets', express.static(join(ROOT_DIR, 'assets')));

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`\n====================================================`);
      console.log(`🚀 問仙壇 · Portaly 瀏覽器即時驗證服務已就緒！`);
      console.log(`🌐 視覺化驗證中控台：http://localhost:${port}/verify`);
      console.log(`⛩️ 問仙壇前台主頁面：http://localhost:${port}/`);
      console.log(`====================================================\n`);
      resolve({ server, env, db, port });
    });
  });
}

// 若直接執行
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createDemoServer(3456);
}
