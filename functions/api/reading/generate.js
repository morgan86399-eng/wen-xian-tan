import { postOnly, json, readJson, isThemeId } from '../../lib/wxt/http.mjs';
import { readUserSession } from '../../lib/wxt/auth.mjs';
import {
  atomicDeductCredit,
  refundCredit,
  getReadingByNonce,
  saveReading,
  hasDb
} from '../../lib/wxt/store.mjs';
import { buildSystemPrompt, buildUserPrompt, scanForbidden, replaceForbidden } from '../../lib/wxt/forbidden.mjs';
import { describePalm, generateReport } from '../../lib/wxt/ai.mjs';
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

  const existing = await getReadingByNonce(env, nonce);
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

  const idempotencyKey = `reading:${nonce}`;
  const deduct = await atomicDeductCredit(env, {
    userId: session.uid,
    themeId,
    idempotencyKey
  });

  if (deduct.idempotent && deduct.readingId) {
    const cached = await getReadingByNonce(env, nonce);
    if (cached) {
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

  const systemPrompt = buildSystemPrompt(themeId);
  const userPrompt = buildUserPrompt({ themeId, answers, palmDescription });

  let model = '';
  let tokens = 0;
  let report = null;

  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const outcome = await generateReport(env, { systemPrompt, userPrompt });
      model = outcome.model;
      tokens = (outcome.tokens || 0) + visionTokens;
      const raw = outcome.parsed || { summary: outcome.text, sections: [] };
      const textDump = JSON.stringify(raw);
      const hits = scanForbidden(textDump);
      if (!hits.length) {
        report = raw;
        break;
      }
      if (attempt === 1) {
        report = JSON.parse(replaceForbidden(textDump));
      }
    }
  } catch {
    await refundCredit(env, { userId: session.uid, themeId, idempotencyKey });
    return json({ error: 'GENERATION_FAILED' }, 503);
  }

  if (!report) {
    await refundCredit(env, { userId: session.uid, themeId, idempotencyKey });
    return json({ error: 'GENERATION_FAILED' }, 503);
  }

  report = withAdviceField(report);

  const readingId = await saveReading(env, {
    userId: session.uid,
    themeId,
    inputJson: { themeId, answers, hasPalm: Boolean(palmImageBase64) },
    contentJson: report,
    model,
    tokens,
    nonce
  });

  return json({
    ok: true,
    id: readingId,
    themeId,
    report,
    model,
    tokens
  });
});
