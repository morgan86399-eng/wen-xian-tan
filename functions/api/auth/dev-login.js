import { postOnly, json, readJson, THEME_IDS } from '../../lib/wxt/http.mjs';
import { signUserSession, sessionCookieHeader } from '../../lib/wxt/auth.mjs';
import { findUserById, hasDb } from '../../lib/wxt/store.mjs';

const DEV_USERNAME = 'user';
const DEV_PASSWORD = 'user123';
const DEV_EMAIL = 'dev@test.local';
const DEV_PROVIDER = 'dev';
const DEV_PROVIDER_SUBJECT = 'dev-test-user';
const CREDITS_PER_THEME = 1000;

/** 測試帳號只在有明確開啟的環境存在；正式站不設這個變數，端點等同不存在 */
function devLoginAllowed(env) {
  return String((env && env.ALLOW_DEV_LOGIN) || '') === 'true';
}

export const onRequest = postOnly(async ({ request, env }) => {
  if (!devLoginAllowed(env)) return json({ error: 'NOT_FOUND' }, 404);
  if (!hasDb(env)) return json({ error: 'SERVICE_UNAVAILABLE' }, 503);

  const body = await readJson(request);
  const username = String(body.username || '').trim();
  const password = String(body.password || '');

  if (username !== DEV_USERNAME || password !== DEV_PASSWORD) {
    return json({ error: 'INVALID_CREDENTIALS', message: '帳號或密碼錯誤' }, 401);
  }

  const db = env.DB;

  let existing = await db
    .prepare('SELECT id FROM users WHERE provider = ? AND provider_subject = ?')
    .bind(DEV_PROVIDER, DEV_PROVIDER_SUBJECT)
    .first();

  let userId;
  if (existing) {
    userId = existing.id;
  } else {
    userId = `u_dev_${Date.now().toString(36)}`;
    const stamp = Math.floor(Date.now() / 1000);
    await db
      .prepare(`INSERT INTO users (id, display_name, email, provider, provider_subject, status, created_at)
                VALUES (?, ?, ?, ?, ?, 'active', ?)`)
      .bind(userId, '測試帳號', DEV_EMAIL, DEV_PROVIDER, DEV_PROVIDER_SUBJECT, stamp)
      .run();
  }

  for (const themeId of THEME_IDS) {
    await db
      .prepare(`INSERT INTO credits (user_id, theme_id, balance) VALUES (?, ?, ?)
                ON CONFLICT(user_id, theme_id) DO UPDATE SET balance = ?`)
      .bind(userId, themeId, CREDITS_PER_THEME, CREDITS_PER_THEME)
      .run();
  }

  const user = await findUserById(env, userId);
  const sessionToken = await signUserSession(env, { uid: userId, provider: DEV_PROVIDER });

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
