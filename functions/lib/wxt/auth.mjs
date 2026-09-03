/* 問仙壇認證設定：AUTH_SECRET 未設就 throw，不留 fallback */

import { ConfigError, buildSetCookie, parseCookies } from './http.mjs';
import { signToken, verifyToken } from '../security/token.mjs';

export const SESSION_COOKIE = 'wx_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

export function authSecret(env) {
  const secret = String((env && env.AUTH_SECRET) || '').trim();
  if (!secret) throw new ConfigError('AUTH_SECRET 未設定');
  return secret;
}

export async function signUserSession(env, { uid, provider = '' }) {
  return signToken({ kind: 'wx_session', uid, provider }, authSecret(env), SESSION_TTL_SECONDS);
}

export async function readUserSession(env, request) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return { ok: false, error: 'UNAUTHENTICATED' };
  const result = await verifyToken(token, authSecret(env));
  if (!result.ok || result.payload.kind !== 'wx_session' || !result.payload.uid) {
    return { ok: false, error: 'UNAUTHENTICATED' };
  }
  return { ok: true, uid: String(result.payload.uid), provider: String(result.payload.provider || '') };
}


export function sessionCookieHeader(token) {
  return buildSetCookie(SESSION_COOKIE, token, { maxAge: SESSION_TTL_SECONDS });
}

export function clearSessionCookieHeader() {
  return `wx_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function requireOAuthConfig(env, provider) {
  if (provider === 'line') {
    const id = String(env.LINE_CHANNEL_ID || '').trim();
    const secret = String(env.LINE_CHANNEL_SECRET || '').trim();
    if (!id || !secret) throw new ConfigError('LINE OAuth 未設定');
    return { clientId: id, clientSecret: secret };
  }
  if (provider === 'google') {
    const id = String(env.GOOGLE_CLIENT_ID || '').trim();
    const secret = String(env.GOOGLE_CLIENT_SECRET || '').trim();
    if (!id || !secret) throw new ConfigError('Google OAuth 未設定');
    return { clientId: id, clientSecret: secret };
  }
  throw new ConfigError('不支援的 OAuth provider');
}

export function requireResend(env) {
  const key = String(env.RESEND_API_KEY || '').trim();
  if (!key) throw new ConfigError('RESEND_API_KEY 未設定');
  return {
    apiKey: key,
    from: String(env.FROM_EMAIL || '').trim() || '問仙壇 <onboarding@resend.dev>'
  };
}

export function requireGroq(env) {
  const key = String(env.GROQ_API_KEY || '').trim();
  if (!key) throw new ConfigError('GROQ_API_KEY 未設定');
  return key;
}
