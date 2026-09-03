/* 問仙壇後端共用 HTTP：JSON、Cookie、路由包裝 */

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};

export const THEME_IDS = ['love', 'work', 'career', 'wealth', 'family', 'children'];

export function corsHeaders(origin) {
  return {
    'access-control-allow-origin': origin || '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization, cookie',
    'access-control-max-age': '86400'
  };
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(), ...extraHeaders }
  });
}

export function fail(message, status = 400, extra = {}) {
  return json({ ok: false, error: message, ...extra }, status);
}

export function redirect(url, status = 302, extraHeaders = {}) {
  return new Response(null, { status, headers: { location: url, ...extraHeaders } });
}

export function preflight() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export function methodNotAllowed() {
  return fail('方法不允許。', 405);
}

export class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'UserError';
    this.status = status;
  }
}

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

function handleRouteError(err) {
  if (err instanceof UserError) return fail(err.message, err.status);
  if (err instanceof ConfigError) return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
  console.error('route error:', errorText(err));
  return json({ error: 'INTERNAL_ERROR' }, 500);
}

export function route(handler, { methods = ['POST'] } = {}) {
  const allowed = new Set(methods.map((m) => m.toUpperCase()));
  return async (context) => {
    const method = context.request.method.toUpperCase();
    if (method === 'OPTIONS') return preflight();
    if (!allowed.has(method)) return methodNotAllowed();
    try {
      return await handler(context);
    } catch (err) {
      return handleRouteError(err);
    }
  };
}

export function postOnly(handler) {
  return route(handler, { methods: ['POST'] });
}

export function getOnly(handler) {
  return route(handler, { methods: ['GET'] });
}

export async function readJson(request, limitBytes = 256 * 1024) {
  const raw = await request.text();
  if (raw.length > limitBytes) throw new UserError('請求內容過大。', 413);
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw new UserError('請求內容不是合法 JSON。', 400);
  }
}

export function pickAction(table, name) {
  const key = String(name || '');
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : null;
}

export function errorText(err) {
  if (!err) return '未知錯誤。';
  if (typeof err === 'string') return err;
  return String(err.message || err);
}

export function clampText(value, max) {
  return String(value == null ? '' : value).slice(0, max);
}

export function normalizeEmail(value) {
  return clampText(value, 254).trim().toLowerCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isEmail(value) {
  return EMAIL_RE.test(normalizeEmail(value));
}

export function requireSiteUrl(env) {
  const url = String((env && env.SITE_URL) || '').trim().replace(/\/$/, '');
  if (!url) throw new ConfigError('SITE_URL 未設定');
  return url;
}

export function parseCookies(request) {
  const header = String(request.headers.get('cookie') || '');
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

export function buildSetCookie(name, value, { maxAge = 0, httpOnly = true, secure = true, sameSite = 'Lax', path = '/' } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  if (maxAge > 0) parts.push(`Max-Age=${maxAge}`);
  else parts.push('Max-Age=0');
  return parts.join('; ');
}

export function clientIp(request) {
  return String(
    request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')
    || 'unknown'
  ).split(',')[0].trim();
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = 25000, label = '上游服務') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error(`${label}逾時（${timeoutMs} 毫秒）。`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function isThemeId(value) {
  return THEME_IDS.includes(String(value || ''));
}
