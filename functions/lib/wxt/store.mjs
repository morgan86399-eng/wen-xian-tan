/* 問仙壇 D1 存取層（wenxiantan-db 八表） */

import { randomHex, sha256Hex } from '../security/token.mjs';
import { normalizeEmail, THEME_IDS } from './http.mjs';

export const VERIFY_CODE_TTL_SECONDS = 10 * 60;
export const VERIFY_CODE_MAX_ATTEMPTS = 5;
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;

export function hasDb(env) {
  return Boolean(env && env.DB && typeof env.DB.prepare === 'function');
}

function db(env) {
  if (!hasDb(env)) throw new Error('資料庫未綁定');
  return env.DB;
}

function now() {
  return Math.floor(Date.now() / 1000);
}

function newId(prefix) {
  return `${prefix}_${randomHex(12)}`;
}

/* ---------- users ---------- */

export async function findUserById(env, id) {
  if (!hasDb(env) || !id) return null;
  return db(env)
    .prepare('SELECT id, display_name, email, provider, provider_subject, status, created_at FROM users WHERE id = ?')
    .bind(id)
    .first();
}

export async function upsertOAuthUser(env, { provider, providerSubject, displayName = '', email = '' }) {
  const existing = await db(env)
    .prepare('SELECT id FROM users WHERE provider = ? AND provider_subject = ?')
    .bind(provider, providerSubject)
    .first();

  if (existing) {
    await db(env)
      .prepare("UPDATE users SET display_name = COALESCE(NULLIF(?, ''), display_name), email = COALESCE(NULLIF(?, ''), email) WHERE id = ?")
      .bind(displayName, normalizeEmail(email), existing.id)
      .run();
    return { id: existing.id, created: false };
  }

  const id = newId('u');
  const stamp = now();
  await db(env)
    .prepare(`INSERT INTO users (id, display_name, email, provider, provider_subject, status, created_at)
              VALUES (?, ?, ?, ?, ?, 'active', ?)`)
    .bind(id, displayName, normalizeEmail(email) || null, provider, providerSubject, stamp)
    .run();
  await grantSignupBonus(env, id);
  return { id, created: true };
}

export async function upsertEmailUser(env, email, displayName = '') {
  const key = normalizeEmail(email);
  const existing = await db(env)
    .prepare('SELECT id FROM users WHERE provider = ? AND provider_subject = ?')
    .bind('email', key)
    .first();
  if (existing) return { id: existing.id, created: false };

  const id = newId('u');
  await db(env)
    .prepare(`INSERT INTO users (id, display_name, email, provider, provider_subject, status, created_at)
              VALUES (?, ?, ?, 'email', ?, 'active', ?)`)
    .bind(id, displayName || key.split('@')[0], key, key, now())
    .run();
  await grantSignupBonus(env, id);
  return { id, created: true };
}

/* ---------- oauth_states ---------- */

export async function putOAuthState(env, { state, provider, redirect = '/' }) {
  await db(env)
    .prepare('INSERT INTO oauth_states (state, provider, expires_at, redirect) VALUES (?, ?, ?, ?)')
    .bind(state, provider, now() + OAUTH_STATE_TTL_SECONDS, redirect)
    .run();
}

export async function consumeOAuthState(env, state, provider) {
  const row = await db(env)
    .prepare('SELECT state, provider, expires_at, redirect FROM oauth_states WHERE state = ? AND provider = ?')
    .bind(state, provider)
    .first();
  if (!row) return { ok: false, reason: 'missing' };
  await db(env).prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run();
  if (row.expires_at < now()) return { ok: false, reason: 'expired' };
  return { ok: true, redirect: row.redirect || '/' };
}

/* ---------- verify_codes ---------- */

export async function putVerifyCode(env, email, code) {
  const key = normalizeEmail(email);
  const hash = await sha256Hex(`${key}:${code}`);
  await db(env)
    .prepare(`INSERT INTO verify_codes (email, code_hash, expires_at, attempts, used_at)
              VALUES (?, ?, ?, 0, NULL)
              ON CONFLICT(email) DO UPDATE SET
                code_hash = excluded.code_hash,
                expires_at = excluded.expires_at,
                attempts = 0,
                used_at = NULL`)
    .bind(key, hash, now() + VERIFY_CODE_TTL_SECONDS)
    .run();
}

export async function consumeVerifyCode(env, email, code) {
  const key = normalizeEmail(email);
  const row = await db(env)
    .prepare('SELECT code_hash, expires_at, attempts, used_at FROM verify_codes WHERE email = ?')
    .bind(key)
    .first();
  if (!row || row.used_at) return { ok: false, reason: 'missing' };
  if (row.expires_at < now()) return { ok: false, reason: 'expired' };
  if (row.attempts >= VERIFY_CODE_MAX_ATTEMPTS) return { ok: false, reason: 'locked' };

  const hash = await sha256Hex(`${key}:${String(code || '').trim()}`);
  if (hash !== row.code_hash) {
    await db(env).prepare('UPDATE verify_codes SET attempts = attempts + 1 WHERE email = ?').bind(key).run();
    return { ok: false, reason: 'mismatch' };
  }

  const updated = await db(env)
    .prepare('UPDATE verify_codes SET used_at = ? WHERE email = ? AND used_at IS NULL')
    .bind(now(), key)
    .run();
  if (!updated.meta || !updated.meta.changes) return { ok: false, reason: 'used' };
  return { ok: true };
}

/* ---------- credits ---------- */

export async function getCreditsMap(env, userId) {
  const out = Object.fromEntries(THEME_IDS.map((t) => [t, 0]));
  if (!hasDb(env) || !userId) return out;
  const result = await db(env)
    .prepare('SELECT theme_id, balance FROM credits WHERE user_id = ?')
    .bind(userId)
    .all();
  for (const row of (result.results || [])) {
    if (THEME_IDS.includes(row.theme_id)) out[row.theme_id] = row.balance;
  }
  return out;
}

/* 註冊禮：新帳號送一點感情篇，讓人可以先問一次再決定要不要買。
   點數各篇獨立，這一點只能用在感情篇。
   冪等鍵綁 userId，同一個帳號重複呼叫也只會發一次。 */
export const SIGNUP_BONUS_THEME = 'love';
export const SIGNUP_BONUS_AMOUNT = 1;

export function signupBonusKey(userId) {
  return `signup:${userId}:${SIGNUP_BONUS_THEME}`;
}

/** 發註冊禮；回傳 true 代表這次真的有發（已發過會回 false） */
export async function grantSignupBonus(env, userId) {
  if (!userId) return false;
  const ledgerId = newId('cl');
  // 帳本與餘額同進同退：餘額那句用 WHERE EXISTS 綁在本次剛寫進去的帳本列上，
  // 冪等鍵擋掉帳本時餘額就不會加，跟購買核發用同一套寫法
  const [inserted] = await db(env).batch([
    db(env)
      .prepare(`INSERT INTO credit_ledger (id, user_id, theme_id, delta, reason, order_id, reading_id, idempotency_key, created_at)
                VALUES (?, ?, ?, ?, 'signup', NULL, NULL, ?, ?)
                ON CONFLICT(idempotency_key) DO NOTHING`)
      .bind(ledgerId, userId, SIGNUP_BONUS_THEME, SIGNUP_BONUS_AMOUNT, signupBonusKey(userId), now()),
    db(env)
      .prepare(`INSERT INTO credits (user_id, theme_id, balance)
                SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM credit_ledger WHERE id = ?)
                ON CONFLICT(user_id, theme_id) DO UPDATE SET balance = balance + excluded.balance`)
      .bind(userId, SIGNUP_BONUS_THEME, SIGNUP_BONUS_AMOUNT, ledgerId)
  ]);
  return Boolean(inserted && inserted.meta && inserted.meta.changes);
}

/** 逐篇核發：每篇點數由 creditsByTheme 決定；每篇各自冪等，中斷後重跑會補齊沒發到的篇章 */
export async function grantCreditsForOrder(env, { userId, orderId, themes, creditsByTheme, idempotencyPrefix }) {
  const stamp = now();
  let grantedAny = false;
  for (const themeId of themes) {
    const amount = Number((creditsByTheme || {})[themeId] || 0);
    if (amount <= 0) continue;

    const ledgerKey = `${idempotencyPrefix}:${themeId}`;
    const ledgerId = newId('cl');

    // 帳本與餘額必須同進同退：餘額那句用 WHERE EXISTS 綁在本次剛寫進去的帳本列上，
    // 帳本被冪等鍵擋掉時餘額就不會加，中途失敗時整批回滾，不會留下「有帳本沒點數」的破洞
    const [inserted] = await db(env).batch([
      db(env)
        .prepare(`INSERT INTO credit_ledger (id, user_id, theme_id, delta, reason, order_id, reading_id, idempotency_key, created_at)
                  VALUES (?, ?, ?, ?, 'purchase', ?, NULL, ?, ?)
                  ON CONFLICT(idempotency_key) DO NOTHING`)
        .bind(ledgerId, userId, themeId, amount, orderId, ledgerKey, stamp),
      db(env)
        .prepare(`INSERT INTO credits (user_id, theme_id, balance)
                  SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM credit_ledger WHERE id = ?)
                  ON CONFLICT(user_id, theme_id) DO UPDATE SET balance = balance + excluded.balance`)
        .bind(userId, themeId, amount, ledgerId)
    ]);

    if (inserted && inserted.meta && inserted.meta.changes) grantedAny = true;
  }
  return grantedAny;
}

/** 原子扣 1 點；不足回 insufficient */
export async function atomicDeductCredit(env, { userId, themeId, idempotencyKey, readingId = null, reason = 'reading' }) {
  const stamp = now();
  const ledgerId = newId('cl');
  const inserted = await db(env)
    .prepare(`INSERT INTO credit_ledger (id, user_id, theme_id, delta, reason, order_id, reading_id, idempotency_key, created_at)
              VALUES (?, ?, ?, -1, ?, NULL, ?, ?, ?)
              ON CONFLICT(idempotency_key) DO NOTHING`)
    .bind(ledgerId, userId, themeId, reason, readingId, idempotencyKey, stamp)
    .run();

  if (!inserted.meta || !inserted.meta.changes) {
    const existing = await db(env)
      .prepare('SELECT reading_id FROM credit_ledger WHERE idempotency_key = ?')
      .bind(idempotencyKey)
      .first();
    return { ok: false, idempotent: true, readingId: existing && existing.reading_id };
  }

  const decremented = await db(env)
    .prepare('UPDATE credits SET balance = balance - 1 WHERE user_id = ? AND theme_id = ? AND balance >= 1')
    .bind(userId, themeId)
    .run();

  if (!decremented.meta || !decremented.meta.changes) {
    await db(env).prepare('DELETE FROM credit_ledger WHERE idempotency_key = ?').bind(idempotencyKey).run();
    return { ok: false, insufficient: true };
  }
  return { ok: true };
}

export async function refundCredit(env, { userId, themeId, idempotencyKey }) {
  const row = await db(env)
    .prepare('SELECT id FROM credit_ledger WHERE idempotency_key = ? AND delta = -1')
    .bind(idempotencyKey)
    .first();
  if (!row) return false;

  await db(env)
    .prepare('UPDATE credits SET balance = balance + 1 WHERE user_id = ? AND theme_id = ?')
    .bind(userId, themeId)
    .run();
  await db(env).prepare('DELETE FROM credit_ledger WHERE idempotency_key = ?').bind(idempotencyKey).run();
  return true;
}

/* ---------- orders / payment_events ---------- */

export async function createOrder(env, { userId, productId, amount, themes, merchantTradeNo, termsVersion = '', provider = 'portaly' }) {
  const id = newId('ord');
  await db(env)
    .prepare(`INSERT INTO orders (id, user_id, product_id, amount, currency, status, provider, merchant_trade_no, themes_json, terms_version, created_at)
              VALUES (?, ?, ?, ?, 'TWD', 'PENDING', ?, ?, ?, ?, ?)`)
    .bind(id, userId, productId, amount, provider, merchantTradeNo, JSON.stringify(themes), termsVersion, now())
    .run();
  return id;
}

export async function getOrderByTradeNo(env, merchantTradeNo) {
  return db(env)
    .prepare('SELECT * FROM orders WHERE merchant_trade_no = ?')
    .bind(merchantTradeNo)
    .first();
}

export async function getOrderById(env, orderId) {
  return db(env)
    .prepare('SELECT * FROM orders WHERE id = ?')
    .bind(orderId)
    .first();
}

export async function recordPaymentEvent(env, { provider, eventId, orderId, payloadHash }) {
  const inserted = await db(env)
    .prepare(`INSERT INTO payment_events (provider, event_id, order_id, payload_hash, created_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(provider, event_id) DO NOTHING`)
    .bind(provider, eventId, orderId, payloadHash, now())
    .run();
  return Boolean(inserted.meta && inserted.meta.changes);
}

export async function markOrderPaid(env, merchantTradeNo) {
  const updated = await db(env)
    .prepare(`UPDATE orders SET status = 'PAID', paid_at = ? WHERE merchant_trade_no = ? AND status = 'PENDING'`)
    .bind(now(), merchantTradeNo)
    .run();
  return Boolean(updated.meta && updated.meta.changes);
}

/* ---------- readings ---------- */

export async function getReadingByNonce(env, nonce) {
  return db(env)
    .prepare('SELECT * FROM readings WHERE nonce = ?')
    .bind(nonce)
    .first();
}

export async function saveReading(env, { userId, themeId, inputJson, contentJson, model, tokens, nonce, idempotencyKey, promptVersion = 'v1' }) {
  const id = newId('rd');
  await db(env)
    .prepare(`INSERT INTO readings (id, user_id, theme_id, input_json, content_json, model, tokens, prompt_version, nonce, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, userId, themeId, JSON.stringify(inputJson), JSON.stringify(contentJson), model, tokens, promptVersion, nonce, now())
    .run();
  await db(env)
    .prepare('UPDATE credit_ledger SET reading_id = ? WHERE idempotency_key = ?')
    .bind(id, idempotencyKey)
    .run();
  return id;
}

export async function listReadingsForUser(env, userId, limit = 50) {
  const result = await db(env)
    .prepare(`SELECT id, theme_id, content_json, model, tokens, created_at FROM readings
              WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
    .bind(userId, limit)
    .all();
  return (result.results || []).map((row) => ({
    id: row.id,
    themeId: row.theme_id,
    content: JSON.parse(row.content_json),
    model: row.model,
    tokens: row.tokens,
    createdAt: row.created_at
  }));
}
