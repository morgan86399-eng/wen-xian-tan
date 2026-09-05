/* 保證交付管線：付費使用者一定要拿到報告。
   只有整條模型鏈都拿不回任何內容時才准失敗退點，其餘情況一律想辦法補到合格為止。 */

import {
  buildSystemPrompt,
  buildUserPrompt,
  scanForbidden,
  replaceForbidden,
  HARDENED_RETRY_HINT,
  WEAK_ACTIONS_RETRY_HINT,
  VAGUE_RETRY_HINT,
  THEME_NAMES
} from './forbidden.mjs';
import {
  isIncompleteReport,
  hasWeakActions,
  hasVagueBody,
  extractSections,
  extractActions
} from './report-format.mjs';
import { generateReport } from './ai.mjs';

/* 每一輪的策略：先照正常方式要 JSON，再試一次，最後關掉 JSON 模式救 json_validate_failed */
const PLANS = [
  { jsonMode: true, temperature: 0.55 },
  { jsonMode: true, temperature: 0.7 },
  { jsonMode: false, temperature: 0.6 }
];

function hasAnyBody(report) {
  return extractSections(report).some((section) => section.body && section.body.length >= 20);
}

/** 只要三條建議的補救提示：比整份重寫便宜，也比較容易過 */
export function buildActionsPrompt(themeId, answers) {
  const data = (answers && typeof answers === 'object') ? answers : {};
  const question = String(data.question || '').trim() || `${THEME_NAMES[themeId] || ''}的常見處境`;
  return [
    `使用者的主要問題是：「${question}」`,
    '',
    '請只回傳三條這一週就能開始做的具體行動，其他什麼都不要寫。',
    '每條 30 到 60 字，要寫出「什麼時候、對誰、具體做什麼」，其中至少兩條要明確講出時間。',
    '嚴禁「盡量」「適時」「多加」「不妨」「視情況」這類軟釘子，嚴禁只寫心態口號。',
    '',
    '輸出格式（只回這個 JSON，前後不要任何文字）：',
    '{"actions":["...","...","..."]}'
  ].join('\n');
}

/** 模型怎樣都給不出合格建議時的保底：用使用者自己填的內容組，仍然帶時間與具體做法 */
export function fallbackActions(themeId, answers) {
  const data = (answers && typeof answers === 'object') ? answers : {};
  const question = String(data.question || '').trim() || `${THEME_NAMES[themeId] || '這件事'}目前的處境`;
  const short = question.length > 24 ? `${question.slice(0, 24)}…` : question;
  return [
    `今晚睡前把「${short}」寫成三句話，明天早上再讀一次，圈出最先要處理的那一句`,
    '這週三之前找一位信任的人當面講完這件事，只講事實與你的感受，先不要求對方給答案',
    '這個週末挑一小時，把手上的實際數字或狀況列成清單，看清楚缺口到底在哪一段'
  ];
}

export function mergeActions(report, actions) {
  const base = (report && typeof report === 'object') ? report : {};
  return { ...base, actions: actions.slice(0, 3) };
}

/* 交付前把禁用詞就地換掉，這是最後一關 */
function finalize(report, extra) {
  const dump = JSON.stringify(report);
  const hits = scanForbidden(dump);
  const cleaned = hits.length ? JSON.parse(replaceForbidden(dump)) : report;
  return { report: cleaned, forbiddenReplaced: hits.length > 0, ...extra };
}

async function repairActions(env, { themeId, answers, report }) {
  const systemPrompt = '你是問仙壇的解讀顧問，只負責產出可執行的行動建議，不寫其他內容。';
  const userPrompt = buildActionsPrompt(themeId, answers);
  for (const plan of [{ jsonMode: true }, { jsonMode: false }]) {
    try {
      const outcome = await generateReport(env, { systemPrompt, userPrompt, jsonMode: plan.jsonMode });
      const actions = extractActions(outcome.parsed || {});
      if (actions.length >= 3 && !hasWeakActions({ ...report, actions })) {
        return { actions: actions.slice(0, 3), tokens: outcome.tokens || 0 };
      }
    } catch {
      /* 換下一種模式 */
    }
  }
  return null;
}

/**
 * 回傳 { report, model, tokens, degraded, stage, forbiddenReplaced }；
 * 只有完全拿不到任何內容才回 null（那才是真的斷線，可以退點）。
 */
export async function runReportPipeline(env, { themeId, answers, palmDescription = '' }) {
  const systemPrompt = buildSystemPrompt(themeId);
  const basePrompt = buildUserPrompt({ themeId, answers, palmDescription });

  let best = null;        // 四段內文合格的最好一份
  let anyContent = null;  // 至少有內容的任何一份
  let model = '';
  let tokens = 0;
  let hint = '';

  for (const plan of PLANS) {
    let outcome;
    try {
      outcome = await generateReport(env, {
        systemPrompt,
        userPrompt: `${basePrompt}${hint}`,
        jsonMode: plan.jsonMode,
        temperature: plan.temperature
      });
    } catch {
      continue;
    }

    model = outcome.model || model;
    tokens += outcome.tokens || 0;
    const raw = outcome.parsed || (outcome.text ? { summary: outcome.text, sections: [] } : null);
    if (!raw) continue;
    if (!anyContent && hasAnyBody(raw)) anyContent = raw;

    if (isIncompleteReport(raw)) { hint = HARDENED_RETRY_HINT; continue; }
    if (hasVagueBody(raw)) { hint = VAGUE_RETRY_HINT; continue; }

    best = raw;
    if (!hasWeakActions(raw)) {
      return finalize(raw, { model, tokens, degraded: false, stage: 'direct' });
    }
    hint = WEAK_ACTIONS_RETRY_HINT;
  }

  // 四段內文合格、只有建議不過關 → 花一次小成本只補建議
  if (best) {
    const repaired = await repairActions(env, { themeId, answers, report: best });
    if (repaired) {
      tokens += repaired.tokens;
      return finalize(mergeActions(best, repaired.actions), { model, tokens, degraded: false, stage: 'actions-repaired' });
    }
    return finalize(mergeActions(best, fallbackActions(themeId, answers)), {
      model, tokens, degraded: true, stage: 'actions-fallback'
    });
  }

  // 連四段都湊不齊，但拿得到內容 → 仍然交付，不讓付費的人空手而回
  if (anyContent) {
    return finalize(mergeActions(anyContent, fallbackActions(themeId, answers)), {
      model, tokens, degraded: true, stage: 'salvaged'
    });
  }

  return null;
}
