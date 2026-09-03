import { postOnly, json, fail } from '../lib/wxt/http.mjs';
import { clearSessionCookieHeader } from '../lib/wxt/auth.mjs';
import { isSameOriginRequest } from '../lib/wxt/route-guard.mjs';

export const onRequest = postOnly(async ({ request, env }) => {
  if (!isSameOriginRequest(request, env)) {
    return fail('拒絕跨站登出請求。', 403);
  }
  return json({ ok: true }, 200, { 'set-cookie': clearSessionCookieHeader() });
});
