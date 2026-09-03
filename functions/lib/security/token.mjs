/* HMAC-SHA256 簽章 token。用途：通關證明、解鎖憑證、會員 session。
   格式：base64url(payloadJson) + "." + base64url(hmac)
   秘密只在伺服器 env，前端無法自行偽造。 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret) {
  if (!secret) throw new Error('缺少簽章密鑰。');
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(String(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/** 常數時間比較，避免以回應時間反推簽章。 */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function signToken(payload, secret, ttlSeconds = 60 * 60 * 24 * 7) {
  const body = {
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + Math.max(60, ttlSeconds)
  };
  const encodedBody = toBase64Url(encoder.encode(JSON.stringify(body)));
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(encodedBody));
  return `${encodedBody}.${toBase64Url(new Uint8Array(signature))}`;
}

/** 驗簽並檢查有效期。回傳 { ok, payload, error }，不丟例外。 */
export async function verifyToken(token, secret) {
  const text = String(token || '').trim();
  const dot = text.indexOf('.');
  if (dot <= 0 || dot === text.length - 1) {
    return { ok: false, error: '憑證格式不正確。' };
  }
  const encodedBody = text.slice(0, dot);
  const encodedSig = text.slice(dot + 1);

  let key;
  let expected;
  try {
    key = await hmacKey(secret);
    expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(encodedBody)));
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }

  let actual;
  try {
    actual = fromBase64Url(encodedSig);
  } catch {
    return { ok: false, error: '憑證簽章無法解析。' };
  }

  if (!timingSafeEqual(expected, actual)) {
    return { ok: false, error: '憑證簽章不符。' };
  }

  let payload;
  try {
    payload = JSON.parse(decoder.decode(fromBase64Url(encodedBody)));
  } catch {
    return { ok: false, error: '憑證內容無法解析。' };
  }

  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: '憑證內容不正確。' };
  }
  // exp 缺漏或不是數字時，NaN 比較永遠為 false，等於發出永不過期的憑證。
  // 這裡要求 exp 必須是有效數字，否則直接視為無效。
  const exp = Number(payload.exp);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) {
    return { ok: false, error: '憑證已過期，請重新登入或重新解鎖。' };
  }

  return { ok: true, payload };
}

/** 從 Authorization: Bearer 或 body.token 取出憑證字串。 */
export function readBearer(request, body) {
  const header = String(request.headers.get('authorization') || '');
  if (/^Bearer\s+/i.test(header)) return header.replace(/^Bearer\s+/i, '').trim();
  return String((body && body.token) || '').trim();
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(text)));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function randomHex(bytes = 16) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 六位數字驗證碼，用密碼學隨機源而非 Math.random。 */
export function randomNumericCode(digits = 6) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const max = 10 ** digits;
  return String(buf[0] % max).padStart(digits, '0');
}
