/**
 * 問仙壇 · Portaly Payment 整合模組
 * 包含 WebCrypto 簽章產生／校驗（完全相容 Portaly v1 callback 規格）
 * 以及 Portaly API 結帳 Session 建立函式
 */

/**
 * 依據 Portaly v1 規範進行鍵值排序序列化
 * - 陣列遞迴處理，undefined 轉為 null
 * - 物件遞迴依照 JavaScript localeCompare 排序鍵值，並排除 undefined
 * - 輸出必須與 Portaly 官方簽章器 byte-identical
 */
export function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value
      .map((item) => (typeof item === 'undefined' ? 'null' : stableJson(item)))
      .join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, val]) => typeof val !== 'undefined')
      .sort(([a], [b]) => a.localeCompare(b));

    return `{${entries
      .map(([key, val]) => `${JSON.stringify(key)}:${stableJson(val)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 計算 Portaly Webhook / Callback HMAC-SHA256 簽章
 * 簽章字串：`${timestamp}.${stableJson(payload)}`
 */
export async function signPortalyCallback({ secret, payload, timestamp }) {
  if (!secret) throw new Error('PORTALY_SECRET_REQUIRED');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(String(secret).trim()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${timestamp}.${stableJson(payload)}`)
  );
  return toHex(signature);
}

/**
 * 固定時間長度 Hex 字串比對，防範時序側信道攻擊（Timing Attack）
 */
export function timingSafeEqualHex(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index++) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

/**
 * 解析時間戳記為毫秒數
 * 支援 ISO-8601 字串（如 2026-07-01T07:00:00.000Z）、秒級或毫秒級數值
 */
export function parseTimestampMs(timestamp) {
  if (!timestamp) return NaN;
  if (typeof timestamp === 'number') {
    return timestamp < 1e11 ? timestamp * 1000 : timestamp;
  }
  const str = String(timestamp).trim();
  if (/^\d+$/.test(str)) {
    const num = Number(str);
    return num < 1e11 ? num * 1000 : num;
  }
  const parsed = Date.parse(str);
  return Number.isNaN(parsed) ? NaN : parsed;
}

/**
 * 校驗 Portaly Callback 簽章與有效時間
 * @param {Object} options
 * @param {string} options.secret - 密鑰（PORTALY_CALLBACK_SECRET 或 Signing Secret）
 * @param {any} options.payload - 解析後的 JSON 物件
 * @param {string|number} options.timestamp - x-portaly-timestamp 或標頭時間
 * @param {string} options.signature - x-portaly-signature 簽章值
 * @param {number} [options.toleranceSeconds=300] - 允許之時鐘偏差（預設 5 分鐘）
 */
export async function verifyPortalyCallback({
  secret,
  payload,
  timestamp,
  signature,
  toleranceSeconds = 300
}) {
  if (!secret || !signature || !timestamp) return false;

  const tsMs = parseTimestampMs(timestamp);
  if (Number.isNaN(tsMs)) return false;

  const nowMs = Date.now();
  if (Math.abs(nowMs - tsMs) > toleranceSeconds * 1000) {
    // 時間戳超出有效容許範圍（防重放攻擊）
    return false;
  }

  const expected = await signPortalyCallback({ secret, payload, timestamp });
  return timingSafeEqualHex(expected.toLowerCase(), String(signature).trim().toLowerCase());
}

/**
 * 讀取環境變數中的 Portaly 設定
 */
export function getPortalyConfig(env) {
  return {
    apiHost: String(env?.PORTALY_API_HOST || 'https://portaly.ai').replace(/\/$/, ''),
    apiKey: String(env?.PORTALY_API_KEY || '').trim(),
    callbackSecret: String(env?.PORTALY_CALLBACK_SECRET || env?.PORTALY_WEBHOOK_SECRET || '').trim(),
    productSingleId: String(env?.PORTALY_PRODUCT_ID_SINGLE || '').trim(),
    productTripleId: String(env?.PORTALY_PRODUCT_ID_TRIPLE || '').trim(),
    productAllId: String(env?.PORTALY_PRODUCT_ID_ALL || '').trim(),
    productSingleUrl: String(env?.PORTALY_URL_SINGLE || '').trim(),
    productTripleUrl: String(env?.PORTALY_URL_TRIPLE || '').trim(),
    productAllUrl: String(env?.PORTALY_URL_ALL || '').trim()
  };
}

/**
 * 根據問仙壇方案代碼對應 Portaly 商品 ID
 */
export function resolvePortalyProductId(config, productId) {
  if (productId === 'single') return config.productSingleId;
  if (productId === 'triple') return config.productTripleId;
  if (productId === 'all') return config.productAllId;
  return '';
}

/**
 * 根據問仙壇方案代碼對應 Portaly 直連商品網址
 */
export function resolvePortalyDirectUrl(config, productId) {
  if (productId === 'single') return config.productSingleUrl;
  if (productId === 'triple') return config.productTripleUrl;
  if (productId === 'all') return config.productAllUrl;
  return '';
}

/**
 * 透過 Portaly Digital Products API 建立 Checkout Session
 */
export async function createPortalyCheckoutSession({
  env,
  orderId,
  tradeNo,
  product,
  themes,
  user,
  siteUrl
}) {
  const config = getPortalyConfig(env);
  const portalyProductId = resolvePortalyProductId(config, product.id);

  // 1. 如果有設定 API Key 與 Portaly 商品 ID，透過 API 建立動態 Checkout Session
  if (config.apiKey && portalyProductId) {
    const callbackUrl = `${siteUrl}/api/portaly/webhook`;
    const payload = {
      items: [{ productId: portalyProductId }],
      totalAmount: product.amount,
      currency: 'TWD',
      merchantOrderNumber: tradeNo,
      callbackUrl,
      successRedirectUrl: `${siteUrl}/?payment=success&orderId=${encodeURIComponent(orderId)}`,
      cancelRedirectUrl: `${siteUrl}/?payment=cancel&orderId=${encodeURIComponent(orderId)}`,
      metadata: {
        orderId,
        tradeNo,
        productId: product.id,
        userId: user.uid,
        themes: JSON.stringify(themes)
      }
    };

    if (user.email) {
      payload.customerEmail = user.email;
      payload.emailVerified = true;
    }
    if (user.displayName) {
      payload.customerName = user.displayName;
    }

    const res = await fetch(`${config.apiHost}/api/digital-products/checkout-sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.data?.checkoutUrl) {
      return {
        ok: true,
        checkoutUrl: data.data.checkoutUrl,
        sessionId: data.data.sessionId
      };
    }

    // 若呼叫 API 發生錯誤，記錄並嘗試 fallback 直連網址
    console.error('Portaly Checkout Session API Failed:', res.status, data);
  }

  // 2. 若未配置 API Key 或 API 呼叫未成功，檢查是否有配置直連商品網址
  const directUrl = resolvePortalyDirectUrl(config, product.id);
  if (directUrl) {
    const url = new URL(directUrl);
    if (user.email && !url.searchParams.has('email')) {
      url.searchParams.set('email', user.email);
    }
    return {
      ok: true,
      checkoutUrl: url.toString()
    };
  }

  return {
    ok: false,
    error: 'PORTALY_NOT_CONFIGURED',
    message: '尚未配置 Portaly 商品 ID 或結帳網址'
  };
}
