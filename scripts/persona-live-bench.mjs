/* 20 人格 × 真實 AI 報告測試
   用法：export GROQ_API_KEY='...' && node scripts/persona-live-bench.mjs
   只呼叫模型，不碰資料庫、不建訂單、不扣點。 */

import { writeFileSync } from 'node:fs';
import { buildSystemPrompt, buildUserPrompt, scanForbidden, replaceForbidden, HARDENED_RETRY_HINT, WEAK_ACTIONS_RETRY_HINT } from '../functions/lib/wxt/forbidden.mjs';
import { isIncompleteReport, hasWeakActions, extractSections, extractActions } from '../functions/lib/wxt/report-format.mjs';
import { runReportPipeline } from '../functions/lib/wxt/report-pipeline.mjs';
import { PERSONAS } from './persona-cases.mjs';

const env = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GROQ_TEXT_MODEL: process.env.GROQ_TEXT_MODEL || 'openai/gpt-oss-120b',
  GEMINI_TEXT_MODEL: process.env.GEMINI_TEXT_MODEL || 'gemini-3.5-flash'
};
/* Groq 可以掛多把金鑰，這裡把所有 GROQ_API_KEY* 原樣帶過去，
   不要再手動挑欄位——漏掉一把就等於整條輪替機制沒生效。 */
for (const [name, value] of Object.entries(process.env)) {
  if (/^GROQ_API_KEYS?(_\d+)?$/.test(name) && value) env[name] = value;
}

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

/* 模板感與可讀性：這是這次提示詞改造要修的東西，所以要量得出來 */
const 時間詞開頭 = /^(今晚|今天|今早|明天|後天|本週|這週|下週|週末|這個週末|本月|這個月|睡前)/;

function scoreTexture(report) {
  const actions = extractActions(report);
  const sections = extractSections(report);
  const 首四字 = (t) => String(t || '').slice(0, 4);

  const 建議時間開頭 = actions.filter((a) => 時間詞開頭.test(a)).length;
  const 建議句首重複 = new Set(actions.map(首四字)).size < actions.length;
  const 段落句首重複 = new Set(sections.map((x) => 首四字(x.body))).size < sections.length;

  const lens = sections.map((x) => (x.body || '').length);
  const 平均 = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
  const 標準差 = lens.length
    ? Math.sqrt(lens.reduce((a, b) => a + (b - 平均) ** 2, 0) / lens.length)
    : 0;

  const 全文 = JSON.stringify(report);
  const 破字 = ['信用停滯', '停滯片', '關停滯', '停滯路里', '打停滯'].filter((w) => 全文.includes(w));

  return {
    建議時間開頭,
    建議句首不重複: !建議句首重複,
    段落句首不重複: !段落句首重複,
    段落長度標準差: Math.round(標準差),
    長度不平均: 標準差 >= 25,
    無破字: 破字.length === 0,
    破字
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
  const texture = report ? scoreTexture(report) : {};
  const forbidden = report ? scanForbidden(JSON.stringify(report)) : [];
  const sections = report ? extractSections(report) : [];
  const actions = report ? extractActions(report) : [];

  rows.push({
    index, persona, report, attempts, model, lastError, fit, texture, forbidden, forbiddenReplaced, degraded, stage,
    sectionCount: sections.length,
    actionCount: actions.length,
    minActionLen: actions.length ? Math.min(...actions.map((a) => a.length)) : 0,
    sample: report ? (actions[0] || '') : ''
  });

  console.log(`[${index}/${PERSONAS.length}] ${persona.name}｜${report ? '產出成功' : '失敗'}｜${stage || lastError.slice(0, 50)}${degraded ? '（保底）' : ''}`);
  if (index < PERSONAS.length) await sleep(35000);
}

const lines = ['# 問仙壇 × 20 人格 真實 AI 報告測試', '', `執行時間：${new Date().toLocaleString('zh-TW')}`, ''];
lines.push('| # | 人格 | 篇章 | 產出 | 段數 | 建議 | 引用問題 | 提到本人處境 | 內文夠長 | 建議時間詞開頭 | 建議句首不重複 | 段落句首不重複 | 長度不平均 | 無破字 | 走保底 | 產出階段 |');
lines.push('|---|------|------|------|------|------|---------|-------------|---------|--------------|--------------|--------------|-----------|-------|--------|---------|');
for (const r of rows) {
  const y = (v) => (v ? '✅' : '❌');
  const t = r.texture || {};
  lines.push(`| ${String(r.index).padStart(2, '0')} | ${r.persona.name} | ${r.persona.theme} | ${r.report ? '✅' : '❌'} | ${r.sectionCount} | ${r.actionCount} | ${y(r.fit.引用使用者問題)} | ${y(r.fit.提到本人處境關鍵字)} | ${y(r.fit.內文夠長)} | ${t.建議時間開頭 == null ? '—' : `${t.建議時間開頭}/3`} | ${y(t.建議句首不重複)} | ${y(t.段落句首不重複)} | ${y(t.長度不平均)}（${t.段落長度標準差 ?? '—'}） | ${y(t.無破字)} | ${r.degraded ? '⚠️' : '—'} | ${r.stage || r.lastError.slice(0, 20)} |`);
}

const ok = rows.filter((r) => r.report).length;
lines.push('', `**成功產出：${ok} / ${rows.length}**`, '');
lines.push('## 各人格第一條建議（抽樣看是否具體可執行）', '');
for (const r of rows) {
  lines.push(`- **${r.persona.name}**（${r.persona.theme}）：${r.sample || `產出失敗：${r.lastError}`}`);
}

/* 模板感彙總：這幾個數字才是這次提示詞改造要看的 */
const 有報告 = rows.filter((r) => r.report);
const 時間開頭首條 = 有報告.filter((r) => {
  const a = extractActions(r.report)[0] || '';
  return 時間詞開頭.test(a);
}).length;
const 開頭詞 = {};
for (const r of 有報告) {
  const a = extractActions(r.report)[0] || '';
  const m = a.match(時間詞開頭);
  const k = m ? m[1] : '（非時間開頭）';
  開頭詞[k] = (開頭詞[k] || 0) + 1;
}
lines.push('', '## 模板感彙總（提示詞改造的驗收指標）', '');
lines.push(`- 第一條建議以時間詞開頭：**${時間開頭首條} / ${有報告.length}**（改造前是 20/20）`);
lines.push(`- 第一條建議的開頭詞分佈：${Object.entries(開頭詞).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join('、')}`);
lines.push(`- 三條建議句首不重複：${有報告.filter((r) => r.texture.建議句首不重複).length} / ${有報告.length}`);
lines.push(`- 四段開頭不重複：${有報告.filter((r) => r.texture.段落句首不重複).length} / ${有報告.length}`);
lines.push(`- 四段長度不平均（標準差 ≥ 25）：${有報告.filter((r) => r.texture.長度不平均).length} / ${有報告.length}`);
lines.push(`- 沒有替換破字：${有報告.filter((r) => r.texture.無破字).length} / ${有報告.length}`);

const out = new URL('../persona-live-bench-output.md', import.meta.url).pathname;
writeFileSync(out, lines.join('\n'), 'utf8');

/* 完整報告落檔：四段內文一直沒有人看過，這份是拿來人工審的 */
const full = ['# 問仙壇 20 人格 完整報告全文', '', `執行時間：${new Date().toLocaleString('zh-TW')}`, ''];
for (const r of rows) {
  full.push(`---`, '', `## ${String(r.index).padStart(2, '0')} ${r.persona.name}（${r.persona.theme}｜${r.persona.age}｜${r.persona.role}）`, '');
  full.push(`**他問的**：${r.persona.question}`, '');
  if (!r.report) { full.push(`產出失敗：${r.lastError}`, ''); continue; }
  full.push(`**標題**：${r.report.title || '（無）'}`, '');
  for (const sec of extractSections(r.report)) full.push(`### ${sec.heading}`, '', sec.body, '');
  full.push('**三條建議**：', '');
  extractActions(r.report).forEach((a, i) => full.push(`${i + 1}. ${a}`));
  full.push('', `**總結**：${r.report.summary || '（無）'}`, '');
}
const fullOut = new URL('../persona-live-bench-full.md', import.meta.url).pathname;
writeFileSync(fullOut, full.join('\n'), 'utf8');

console.log(`\n指標報告：${out}`);
console.log(`完整全文：${fullOut}`);
