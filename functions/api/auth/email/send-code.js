import { postOnly, json, readJson, isEmail, normalizeEmail } from '../../../lib/wxt/http.mjs';
import { requireResend } from '../../../lib/wxt/auth.mjs';
import { authRateLimit } from '../../../lib/wxt/rate-limit.mjs';
import { putVerifyCode, hasDb } from '../../../lib/wxt/store.mjs';
import { randomNumericCode } from '../../../lib/security/token.mjs';
import { fetchWithTimeout } from '../../../lib/wxt/http.mjs';

export const onRequest = postOnly(async ({ request, env }) => {
  if (!hasDb(env)) return json({ error: 'SERVICE_UNAVAILABLE' }, 503);

  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  if (!isEmail(email)) return json({ error: 'INVALID_EMAIL' }, 400);

  const limited = await authRateLimit(env, request, { email, perEmailLimit: 5, perIpLimit: 10 });
  if (!limited.allowed) return json({ error: 'TRY_AGAIN_LATER' }, 429);

  let resend;
  try {
    resend = requireResend(env);
  } catch {
    return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
  }

  const code = randomNumericCode(6);
  await putVerifyCode(env, email, code);

  const sendRes = await fetchWithTimeout('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${resend.apiKey}`
    },
    body: JSON.stringify({
      from: resend.from,
      to: [email],
      subject: '問仙壇登入驗證碼',
      text: `您的問仙壇登入驗證碼為 ${code}，10 分鐘內有效。`
    })
  }, 15000, 'Resend');

  if (!sendRes.ok) return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
  // 僅回 { ok: true }；驗證碼只經 Resend 寄出，絕不回傳給前端
  return json({ ok: true });
});
