/* 綠界 ECPay 工具：secret 未設就 throw，不留測試金鑰 fallback */

import { ConfigError } from './http.mjs';

const PROD_ACTION_URL = 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5';
const STAGE_ACTION_URL = 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5';

export function getEcpayConfig(env = {}) {
  const merchantId = String(env.ECPAY_MERCHANT_ID || '').trim();
  const hashKey = String(env.ECPAY_HASH_KEY || '').trim();
  const hashIV = String(env.ECPAY_HASH_IV || '').trim();
  if (!merchantId || !hashKey || !hashIV) {
    throw new ConfigError('ECPay 金鑰未完整設定');
  }
  const isProduction = String(env.ECPAY_IS_PRODUCTION || '') === 'true';
  return {
    isProduction,
    merchantId,
    hashKey,
    hashIV,
    actionUrl: isProduction ? PROD_ACTION_URL : STAGE_ACTION_URL
  };
}

export function generateTradeNo() {
  const now = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const tw = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
  const yy = String(tw.getFullYear()).slice(-2);
  const rand = crypto.getRandomValues(new Uint8Array(2));
  const suffix = Array.from(rand).map((b) => (b % 36).toString(36).toUpperCase()).join('').slice(0, 3);
  return `WXT${yy}${pad(tw.getMonth() + 1)}${pad(tw.getDate())}${pad(tw.getHours())}${pad(tw.getMinutes())}${pad(tw.getSeconds())}${suffix}`;
}

export function formatTaiwanDateTime(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const tw = new Date(date.getTime() + (8 * 60 + date.getTimezoneOffset()) * 60000);
  return `${tw.getFullYear()}/${pad(tw.getMonth() + 1)}/${pad(tw.getDate())} ${pad(tw.getHours())}:${pad(tw.getMinutes())}:${pad(tw.getSeconds())}`;
}

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

export async function calculateCheckMacValue(params, hashKey, hashIV) {
  const sortedKeys = Object.keys(params)
    .filter((k) => k !== 'CheckMacValue')
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const rawPairs = sortedKeys.map((k) => `${k}=${params[k]}`);
  const combined = `HashKey=${hashKey}&${rawPairs.join('&')}&HashIV=${hashIV}`;
  const encoded = ecpayUrlEncode(combined).toLowerCase();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(encoded));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export async function verifyCheckMacValue(params, hashKey, hashIV) {
  if (!params || !params.CheckMacValue) return false;
  const computed = await calculateCheckMacValue(params, hashKey, hashIV);
  return computed === params.CheckMacValue;
}
