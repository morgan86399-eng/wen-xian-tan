import { postOnly, json, readJson, isThemeId } from '../../lib/wxt/http.mjs';
import { readUserSession } from '../../lib/wxt/auth.mjs';
import {
  atomicDeductCredit,
  refundCredit,
  getReadingByNonce,
  saveReading,
  hasDb
} from '../../lib/wxt/store.mjs';
import { describePalm } from '../../lib/wxt/ai.mjs';
import { runReportPipeline } from '../../lib/wxt/report-pipeline.mjs';
import { withAdviceField } from '../../lib/wxt/report-format.mjs';

export const onRequest = postOnly(async ({ request, env }) => {
  if (!hasDb(env)) return json({ error: 'SERVICE_UNAVAILABLE' }, 503);

  const session = await readUserSession(env, request);
  if (!session.ok) return json({ error: 'UNAUTHENTICATED' }, 401);

  const body = await readJson(request, 2 * 1024 * 1024);
  const themeId = String(body.themeId || body.themeKey || '').trim();
  const nonce = String(body.requestId || body.nonce || '').trim();
  const answers = (body.answers && typeof body.answers === 'object') ? body.answers : {};

  if (!isThemeId(themeId)) return json({ error: 'INVALID_THEME' }, 400);
  if (!nonce || nonce.length < 8) return json({ error: 'INVALID_NONCE' }, 400);

  // nonce 綁使用者：別人拿走同一組 nonce 也讀不到這份報告，也撞不到這筆扣點紀錄
  const scopedNonce = `${session.uid}:${nonce}`;

  const existing = await getReadingByNonce(env, scopedNonce);
  if (existing && existing.user_id === session.uid) {
    return json({
      ok: true,
      id: existing.id,
      themeId: existing.theme_id,
      report: withAdviceField(JSON.parse(existing.content_json)),
      model: existing.model,
      tokens: existing.tokens,
      cached: true
    });
  }

  const idempotencyKey = `reading:${scopedNonce}`;
  const deduct = await atomicDeductCredit(env, {
    userId: session.uid,
    themeId,
    idempotencyKey
  });

  if (deduct.idempotent && deduct.readingId) {
    const cached = await getReadingByNonce(env, scopedNonce);
    if (cached && cached.user_id === session.uid) {
      return json({
        ok: true,
        id: cached.id,
        themeId: cached.theme_id,
        report: withAdviceField(JSON.parse(cached.content_json)),
        model: cached.model,
        tokens: cached.tokens,
        cached: true
      });
    }
  }
  if (!deduct.ok) return json({ error: 'INSUFFICIENT_CREDITS' }, 402);

  let palmDescription = '';
  let visionTokens = 0;
  const palmImageBase64 = String(body.palmImageBase64 || '').trim();
  if (palmImageBase64) {
    try {
      const vision = await describePalm(env, palmImageBase64);
      palmDescription = vision.text;
      visionTokens = vision.tokens;
    } catch {
      palmDescription = '';
    }
  }

  // 保證交付：只有整條模型鏈都拿不回任何內容才准失敗
  let outcome = null;
  try {
    outcome = await runReportPipeline(env, { themeId, answers, palmDescription });
  } catch {
    outcome = null;
  }

  if (!outcome || !outcome.report) {
    await refundCredit(env, { userId: session.uid, themeId, idempotencyKey });
    return json({ error: 'GENERATION_FAILED' }, 503);
  }

  let report = outcome.report;
  const model = outcome.model;
  const tokens = (outcome.tokens || 0) + visionTokens;

  report = withAdviceField(report);

  const readingId = await saveReading(env, {
    userId: session.uid,
    themeId,
    inputJson: { themeId, answers, hasPalm: Boolean(palmImageBase64) },
    contentJson: report,
    model,
    tokens,
    nonce: scopedNonce,
    idempotencyKey
  });

  return json({
    ok: true,
    id: readingId,
    themeId,
    report,
    model,
    tokens,
    degraded: Boolean(outcome.degraded)
  });
});
