/* 20 人格 × 真實 AI 報告測試
   用法：export GROQ_API_KEY='...' && node scripts/persona-live-bench.mjs
   只呼叫模型，不碰資料庫、不建訂單、不扣點。 */

import { writeFileSync } from 'node:fs';
import { buildSystemPrompt, buildUserPrompt, scanForbidden, replaceForbidden, HARDENED_RETRY_HINT, WEAK_ACTIONS_RETRY_HINT } from '../functions/lib/wxt/forbidden.mjs';
import { isIncompleteReport, hasWeakActions, extractSections, extractActions } from '../functions/lib/wxt/report-format.mjs';
import { runReportPipeline } from '../functions/lib/wxt/report-pipeline.mjs';
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* Groq 免費層每分鐘 8000 token，撞到 429 就等一分鐘再來，最多等四次 */
async function callWithBackoff(fn, maxWaits = 4) {
  for (let i = 0; i <= maxWaits; i += 1) {
    try {
      return await fn();
    } catch (error) {
      const message = String(error && error.message ? error.message : error);
      if (!message.includes('429') || i === maxWaits) throw error;
      console.log(`    撞到速率上限，等 65 秒再試（第 ${i + 1} 次）`);
      await sleep(65000);
    }
  }
  throw new Error('退避重試用盡');
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

  // 直接走正式站用的保證交付管線，測的就是使用者真的會拿到什麼
  let report = null;
  let attempts = 1;
  let model = '';
  let lastError = '';
  let forbiddenReplaced = false;
  let degraded = false;
  let stage = '';

  try {
    const outcome = await callWithBackoff(() => runReportPipeline(env, { themeId: persona.theme, answers }));
    if (outcome && outcome.report) {
      report = outcome.report;
      model = outcome.model;
      forbiddenReplaced = Boolean(outcome.forbiddenReplaced);
      degraded = Boolean(outcome.degraded);
      stage = outcome.stage;
    } else {
      lastError = '整條模型鏈都拿不回內容';
    }
  } catch (error) {
    lastError = String(error && error.message ? error.message : error);
  }

  const fit = report ? scorePersonaFit(report, persona) : {};
  const forbidden = report ? scanForbidden(JSON.stringify(report)) : [];
  const sections = report ? extractSections(report) : [];
  const actions = report ? extractActions(report) : [];

  rows.push({
    index, persona, report, attempts, model, lastError, fit, forbidden, forbiddenReplaced, degraded, stage,
    sectionCount: sections.length,
    actionCount: actions.length,
    minActionLen: actions.length ? Math.min(...actions.map((a) => a.length)) : 0,
    sample: report ? (actions[0] || '') : ''
  });

  console.log(`[${index}/${PERSONAS.length}] ${persona.name}｜${report ? '產出成功' : '失敗'}｜${stage || lastError.slice(0, 50)}${degraded ? '（保底）' : ''}`);
  if (index < PERSONAS.length) await sleep(35000);
}

const lines = ['# 問仙壇 × 20 人格 真實 AI 報告測試', '', `執行時間：${new Date().toLocaleString('zh-TW')}`, ''];
lines.push('| # | 人格 | 篇章 | 產出 | 嘗試 | 段數 | 建議 | 最短建議 | 引用問題 | 提到本人處境 | 非通用範本 | 內文夠長 | 禁用詞替換 | 走保底 | 產出階段 |');
lines.push('|---|------|------|------|------|------|------|---------|---------|-------------|-----------|---------|-----------|--------|---------|');
for (const r of rows) {
  const y = (v) => (v ? '✅' : '❌');
  lines.push(`| ${String(r.index).padStart(2, '0')} | ${r.persona.name} | ${r.persona.theme} | ${r.report ? '✅' : '❌'} | ${r.attempts} | ${r.sectionCount} | ${r.actionCount} | ${r.minActionLen} | ${y(r.fit.引用使用者問題)} | ${y(r.fit.提到本人處境關鍵字)} | ${y(r.fit.沒有寫成通用範本)} | ${y(r.fit.內文夠長)} | ${r.forbiddenReplaced ? '✅' : '—'} | ${r.degraded ? '⚠️' : '—'} | ${r.stage || r.lastError.slice(0, 20)} |`);
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
