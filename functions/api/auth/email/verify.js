import { postOnly, json, readJson, isEmail, normalizeEmail } from '../../../lib/wxt/http.mjs';
import { signUserSession, sessionCookieHeader } from '../../../lib/wxt/auth.mjs';
import { consumeVerifyCode, upsertEmailUser, findUserById, hasDb } from '../../../lib/wxt/store.mjs';

export const onRequest = postOnly(async ({ request, env }) => {
  if (!hasDb(env)) return json({ error: 'SERVICE_UNAVAILABLE' }, 503);

  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const code = String(body.code || '').trim();
  if (!isEmail(email)) return json({ error: 'INVALID_EMAIL' }, 400);
  if (!/^\d{6}$/.test(code)) return json({ error: 'INVALID_CODE' }, 400);

  const verified = await consumeVerifyCode(env, email, code);
  if (!verified.ok) return json({ error: 'INVALID_CODE' }, 401);

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
