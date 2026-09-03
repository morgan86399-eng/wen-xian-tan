/* Google id_token 驗簽（JWKS）與 aud/iss/exp 檢查 */

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

let jwksCache = null;
let jwksCacheAt = 0;
const JWKS_TTL_MS = 60 * 60 * 1000;

function base64UrlToBytes(value) {
  const base64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getGoogleJwks() {
  if (jwksCache && Date.now() - jwksCacheAt < JWKS_TTL_MS) return jwksCache;
  const response = await fetch(JWKS_URL);
  if (!response.ok) throw new Error('無法取得 Google JWKS');
  jwksCache = await response.json();
  jwksCacheAt = Date.now();
  return jwksCache;
}

async function importRsaKey(jwk) {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

/**
 * @param {string} idToken
 * @param {string} clientId GOOGLE_CLIENT_ID
 * @returns {Promise<{ok: true, payload: object}|{ok: false, error: string}>}
 */
export async function verifyGoogleIdToken(idToken, clientId) {
  const token = String(idToken || '').trim();
  const expectedClientId = String(clientId || '').trim();
  if (!expectedClientId) return { ok: false, error: 'no_client_id' };

  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, error: 'invalid_token' };

  const [headerPart, payloadPart, signaturePart] = parts;
  let header;
  let payload;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(headerPart)));
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadPart)));
  } catch {
    return { ok: false, error: 'invalid_token' };
  }

  const stamp = Math.floor(Date.now() / 1000);
  if (!payload.exp || Number(payload.exp) < stamp) return { ok: false, error: 'expired' };
  if (payload.nbf && Number(payload.nbf) > stamp + 60) return { ok: false, error: 'not_yet_valid' };
  if (!GOOGLE_ISSUERS.has(String(payload.iss || ''))) return { ok: false, error: 'bad_issuer' };

  const audience = payload.aud;
  const audienceOk = Array.isArray(audience)
    ? audience.includes(expectedClientId)
    : audience === expectedClientId;
  if (!audienceOk) return { ok: false, error: 'bad_audience' };

  const jwks = await getGoogleJwks();
  const jwk = (jwks.keys || []).find((key) => key.kid === header.kid);
  if (!jwk) return { ok: false, error: 'unknown_kid' };

  const key = await importRsaKey(jwk);
  const signed = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
  const signature = base64UrlToBytes(signaturePart);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signed);
  if (!valid) return { ok: false, error: 'bad_signature' };

  return { ok: true, payload };
}
