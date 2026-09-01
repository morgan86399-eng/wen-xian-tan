/**
 * 問仙壇 · 綠界科技 (ECPay) 核心工具模組
 * 支援 Cloudflare Pages Functions (Web Crypto API) 與 Node.js 環境
 */

// 綠界官方公開測試環境金鑰 (Stage Test Mode)
export const STAGE_CONFIG = {
  isProduction: false,
  merchantId: '3002607',
  hashKey: 'pwFHCqoQZGmho4w6',
  hashIV: 'EkRm7iFT261dpevs',
  actionUrl: 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5'
};

// 綠界正式環境收銀台
export const PROD_ACTION_URL = 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5';

/**
 * 取得當前金流設定（優先讀取環境變數，無設定則使用 Stage 測試環境）
 */
export function getEcpayConfig(env = {}) {
  const isProd = env.ECPAY_IS_PRODUCTION === 'true' || env.NODE_ENV === 'production';
  const merchantId = env.ECPAY_MERCHANT_ID || STAGE_CONFIG.merchantId;
  const hashKey = env.ECPAY_HASH_KEY || STAGE_CONFIG.hashKey;
  const hashIV = env.ECPAY_HASH_IV || STAGE_CONFIG.hashIV;

  return {
    isProduction: isProd && merchantId !== STAGE_CONFIG.merchantId,
    merchantId,
    hashKey,
    hashIV,
    actionUrl: (isProd && merchantId !== STAGE_CONFIG.merchantId) ? PROD_ACTION_URL : STAGE_CONFIG.actionUrl
  };
}

/**
 * 產生符合綠界規範的交易編號 (MerchantTradeNo: 英數組合，長度需 <= 20 碼)
 * 格式: WXT + 年月日時分秒(12碼) + 隨機3碼英數 = 18碼
 */
export function generateTradeNo() {
  const now = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  
  // 轉為台灣時間 (UTC+8)
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

/**
 * 格式化為綠界規範之台灣時間字串: yyyy/MM/dd HH:mm:ss
 */
export function formatTaiwanDateTime(date = new Date()) {
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

/**
 * 綠界專屬 .NET UrlEncode 字元替換規則
 */
export function ecpayUrlEncode(raw) {
  return encodeURIComponent(raw)
    .replace(/%20/g, '+')
    .replace(/%2d/gi, '-')
    .replace(/%5f/gi, '_')
    .replace(/%2e/gi, '.')
    .replace(/%21/gi, '!')
    .replace(/%2a/gi, '*')
    .replace(/%28/gi, '(')
    .replace(/%29/gi, ')');
}

/**
 * 計算 CheckMacValue (SHA256)
 * 相容於 Web Crypto API 與 Node.js
 */
export async function calculateCheckMacValue(params, hashKey, hashIV) {
  // 1. 排除 CheckMacValue 本身，依照 key 字母順序排序 (A-Z, case-insensitive)
  const sortedKeys = Object.keys(params)
    .filter((k) => k !== 'CheckMacValue')
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  // 2. 串接 HashKey 與 HashIV
  const rawPairs = sortedKeys.map((k) => `${k}=${params[k]}`);
  const combined = `HashKey=${hashKey}&${rawPairs.join('&')}&HashIV=${hashIV}`;

  // 3. 進行 .NET 規範之 UrlEncode
  const encoded = ecpayUrlEncode(combined);

  // 4. 轉為全小寫
  const lower = encoded.toLowerCase();

  // 5. 進行 SHA256 雜湊
  let hashHex = '';
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(lower);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } else {
    // Node.js fallback
    const nodeCrypto = await import('crypto');
    hashHex = nodeCrypto.createHash('sha256').update(lower).digest('hex');
  }

  // 6. 轉為全大寫
  return hashHex.toUpperCase();
}

/**
 * 驗證綠界回傳之 CheckMacValue 是否正確
 */
export async function verifyCheckMacValue(params, hashKey, hashIV) {
  if (!params || !params.CheckMacValue) return false;
  const computed = await calculateCheckMacValue(params, hashKey, hashIV);
  return computed === params.CheckMacValue;
}
