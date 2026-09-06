import { postOnly, fail, buildSetCookie } from '../lib/wxt/http.mjs';
import { clearSessionCookieHeader, SESSION_COOKIE } from '../lib/wxt/auth.mjs';
import { isSameOriginRequest } from '../lib/wxt/route-guard.mjs';

export const onRequest = postOnly(async ({ request, env }) => {
  if (!isSameOriginRequest(request, env)) {
    return fail('拒絕跨站登出請求。', 403);
  }
  const headers = new Headers();
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.append('set-cookie', clearSessionCookieHeader(env));
  headers.append('set-cookie', buildSetCookie(SESSION_COOKIE, '', { maxAge: 0, domain: '' }));

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers
  });
});
