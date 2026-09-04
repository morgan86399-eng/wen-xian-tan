/* 20 人格 × 真實 AI 報告測試
   用法：export GROQ_API_KEY='...' && node scripts/persona-live-bench.mjs
   只呼叫模型，不碰資料庫、不建訂單、不扣點。 */

import { writeFileSync } from 'node:fs';
import { buildSystemPrompt, buildUserPrompt, scanForbidden, HARDENED_RETRY_HINT, WEAK_ACTIONS_RETRY_HINT } from '../functions/lib/wxt/forbidden.mjs';
import { isIncompleteReport, hasWeakActions, extractSections, extractActions } from '../functions/lib/wxt/report-format.mjs';
import { generateReport } from '../functions/lib/wxt/ai.mjs';
import { PERSONAS } from './persona-cases.mjs';

const env = {
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GROQ_TEXT_MODEL: process.env.GROQ_TEXT_MODEL || 'openai/gpt-oss-120b',
  GEMINI_TEXT_MODEL: process.env.GEMINI_TEXT_MODEL || 'gemini-3.5-flash'
};

if (!env.GROQ_API_KEY && !env.GEMINI_API_KEY) {
  console.error('沒有金鑰。請先 export GROQ_API_KEY=... 再執行。');
  process.exit(2);
}

/* 人格貼合評分：報告有沒有真的針對這一個人寫 */
function scorePersonaFit(report, persona) {
  const text = [
    report.summary || '',
    ...(Array.isArray(report.sections) ? report.sections.map((s) => `${s.heading || ''}${s.body || ''}`) : []),
    ...extractActions(report)
  ].join('\n');

  const questionWords = persona.question.replace(/[，。？、]/g, '').match(/.{2}/g) || [];
  const hitWords = questionWords.filter((w) => text.includes(w)).length;
  const questionEcho = hitWords / Math.max(questionWords.length, 1);

  return {
    引用使用者問題: questionEcho >= 0.25,
    提到本人處境關鍵字: persona.fitKeywords.some((w) => text.includes(w)),
    沒有寫成通用範本: !/每個人的人生|順其自然就會|保持正面的心態/.test(text),
    內文夠長: text.length >= 500
  };
}

const rows = [];
let index = 0;

for (const persona of PERSONAS) {
  index += 1;
  const answers = {
    genderLabel: persona.gender,
    ageLabel: persona.age,
    relationLabel: persona.relation,
    roleLabel: persona.role,
    question: persona.question,
    goalLabel: '想知道接下來怎麼做',
    [persona.extraKey]: persona.extra
  };

  const systemPrompt = buildSystemPrompt(persona.theme);
  const basePrompt = buildUserPrompt({ themeId: persona.theme, answers });

  let report = null;
  let attempts = 0;
  let model = '';
  let retryHint = '';
  let lastError = '';

  try {
    for (let i = 0; i < 2; i += 1) {
      attempts += 1;
      const outcome = await generateReport(env, { systemPrompt, userPrompt: `${basePrompt}${retryHint}` });
      model = outcome.model;
      const raw = outcome.parsed || { summary: outcome.text, sections: [] };
      if (isIncompleteReport(raw)) { retryHint = HARDENED_RETRY_HINT; continue; }
      if (hasWeakActions(raw)) { retryHint = WEAK_ACTIONS_RETRY_HINT; continue; }
      report = raw;
      break;
    }
  } catch (error) {
    lastError = String(error && error.message ? error.message : error);
  }

  const fit = report ? scorePersonaFit(report, persona) : {};
  const forbidden = report ? scanForbidden(JSON.stringify(report)) : [];
  const sections = report ? extractSections(report) : [];
  const actions = report ? extractActions(report) : [];

  rows.push({
    index, persona, report, attempts, model, lastError, fit, forbidden,
    sectionCount: sections.length,
    actionCount: actions.length,
    minActionLen: actions.length ? Math.min(...actions.map((a) => a.length)) : 0,
    sample: report ? (actions[0] || '') : ''
  });

  console.log(`[${index}/${PERSONAS.length}] ${persona.name}｜${report ? '產出成功' : '失敗'}｜嘗試 ${attempts} 次｜${model || lastError}`);
}

const lines = ['# 問仙壇 × 20 人格 真實 AI 報告測試', '', `執行時間：${new Date().toLocaleString('zh-TW')}`, ''];
lines.push('| # | 人格 | 篇章 | 產出 | 嘗試 | 段數 | 建議 | 最短建議 | 引用問題 | 提到本人處境 | 非通用範本 | 內文夠長 | 禁用詞 |');
lines.push('|---|------|------|------|------|------|------|---------|---------|-------------|-----------|---------|--------|');
for (const r of rows) {
  const y = (v) => (v ? '✅' : '❌');
  lines.push(`| ${String(r.index).padStart(2, '0')} | ${r.persona.name} | ${r.persona.theme} | ${r.report ? '✅' : '❌'} | ${r.attempts} | ${r.sectionCount} | ${r.actionCount} | ${r.minActionLen} | ${y(r.fit.引用使用者問題)} | ${y(r.fit.提到本人處境關鍵字)} | ${y(r.fit.沒有寫成通用範本)} | ${y(r.fit.內文夠長)} | ${r.forbidden.length ? r.forbidden.join('、') : '無'} |`);
}

const ok = rows.filter((r) => r.report).length;
lines.push('', `**成功產出：${ok} / ${rows.length}**`, '');
lines.push('## 各人格第一條建議（抽樣看是否具體可執行）', '');
for (const r of rows) {
  lines.push(`- **${r.persona.name}**（${r.persona.theme}）：${r.sample || `產出失敗：${r.lastError}`}`);
}

const out = new URL('../persona-live-bench-output.md', import.meta.url).pathname;
writeFileSync(out, lines.join('\n'), 'utf8');
console.log(`\n報告已寫入：${out}`);
