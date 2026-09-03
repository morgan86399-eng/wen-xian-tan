import { postOnly, json, readJson, isEmail, normalizeEmail } from '../../../lib/wxt/http.mjs';
import { signUserSession, sessionCookieHeader } from '../../../lib/wxt/auth.mjs';
import { authRateLimit } from '../../../lib/wxt/rate-limit.mjs';
import { consumeVerifyCode, upsertEmailUser, findUserById, hasDb } from '../../../lib/wxt/store.mjs';

const VERIFY_FAIL = { error: 'INVALID_CODE' };

export const onRequest = postOnly(async ({ request, env }) => {
  if (!hasDb(env)) return json({ error: 'SERVICE_UNAVAILABLE' }, 503);

  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const code = String(body.code || '').trim();
  if (!isEmail(email)) return json({ error: 'INVALID_EMAIL' }, 400);
  if (!/^\d{6}$/.test(code)) return json(VERIFY_FAIL, 401);

  const limited = await authRateLimit(env, request, {
    email: `verify:${email}`,
    perEmailLimit: 15,
    perIpLimit: 30,
    windowSeconds: 900
  });
  if (!limited.allowed) return json({ error: 'TRY_AGAIN_LATER' }, 429);

  const verified = await consumeVerifyCode(env, email, code);
  if (!verified.ok) return json(VERIFY_FAIL, 401);

  const { id } = await upsertEmailUser(env, email);
  const user = await findUserById(env, id);
  const sessionToken = await signUserSession(env, { uid: id, provider: 'email' });

  return json({
    ok: true,
    user: {
      id: user.id,
      displayName: user.display_name,
      email: user.email,
      provider: user.provider
    }
  }, 200, { 'set-cookie': sessionCookieHeader(sessionToken) });
});
