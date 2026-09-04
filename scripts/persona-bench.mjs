/* 20 人格 × 問仙壇報告管線基準測試
   測的是「產品有沒有把這個人的處境送進模型，以及會不會擋下通用範本與沒有建議的報告」。
   沒有呼叫真實 AI，所以不代表模型寫出來的文字品質。 */

import { writeFileSync } from 'node:fs';
import { buildSystemPrompt, buildUserPrompt } from '../functions/lib/wxt/forbidden.mjs';
import { isIncompleteReport, hasWeakActions, hasVagueBody, extractSections, extractActions } from '../functions/lib/wxt/report-format.mjs';
import { PERSONAS } from './persona-cases.mjs';


/* 三種候選報告：通用範本、敷衍短文、合格報告 */
function genericReport() {
  const body = '每個人的人生都有高低起伏，重要的是保持正面的心態，凡事順其自然就會慢慢好轉，時間到了自然會有答案，不需要太過焦慮。';
  return {
    title: '順其自然就會好轉',
    summary: '保持正面心態。',
    sections: [1, 2, 3, 4].map((i) => ({ heading: `第 ${i} 段`, body }))
  };
}

function thinReport() {
  return {
    title: '簡短回覆',
    summary: '再觀察。',
    sections: [1, 2, 3, 4].map((i) => ({ heading: `第 ${i} 段`, body: '再看看。' })),
    actions: ['保持正面', '多多加油', '順其自然']
  };
}

/* 四段夠長、建議三條，但整篇都是空話與軟釘子 —— 這種最容易矇混過關 */
function wishyWashyReport(persona) {
  const body = `關於「${persona.question}」這件事，每個人的狀況因人而異，凡事順其自然就好，時間到了自然會有答案，先保持正面的心態，慢慢就會看到轉變。`;
  return {
    title: '順其自然',
    summary: '保持平常心。',
    sections: [1, 2, 3, 4].map((i) => ({ heading: `第 ${i} 段`, body })),
    actions: [
      '這週盡量找時間跟身邊的人聊一聊，適時把心裡的想法表達出來，不要一直放著',
      '平常多加留意自己的情緒變化，適度給自己一些休息的空間，不要給自己太大壓力',
      '不妨試著看看能不能換個角度想這件事，視情況調整自己的步調就好'
    ]
  };
}

function goodReport(persona) {
  const who = persona.name;
  return {
    title: `${who}的階段課題`,
    summary: `扣住你問的「${persona.question}」，先處理最近一週能動的部分。`,
    sections: [
      { heading: '現況輪廓', body: `你提到「${persona.question}」，這件事現在佔掉你大部分心力，${persona.extra}，讓你很難靜下來判斷先後順序。` },
      { heading: '目前的節奏', body: `以${persona.age}這個階段來看，你的處境不是突然發生的，而是累積了一段時間，先看清楚節奏比急著下決定更重要。` },
      { heading: '時機判斷', body: `這一個月之內不需要做最終決定，先把可以驗證的部分做完，等到資訊足夠再選邊，會比現在賭一把穩當得多。` },
      { heading: '要調整的習慣', body: `你習慣把事情自己留著不說出口，這讓旁邊的人沒有辦法幫你，練習把處境完整講給一個信任的人聽。` }
    ],
    actions: [
      `這週三之前，把「${persona.question}」寫成三句話，找一位信任的人當面講完，不要只在心裡想`,
      `這週挑一個晚上，把${persona.extra}的實際數字或情況列成清單，看清楚真正的缺口在哪裡`,
      `這個週末先做一件與這件事無關的事，讓自己有半天完全離開這個題目，再回頭判斷`
    ]
  };
}

const rows = [];
let passAll = 0;

for (const p of PERSONAS) {
  const answers = {
    genderLabel: p.gender,
    ageLabel: p.age,
    relationLabel: p.relation,
    roleLabel: p.role,
    question: p.question,
    goalLabel: '想知道接下來怎麼做',
    [p.extraKey]: p.extra
  };

  const systemPrompt = buildSystemPrompt(p.theme);
  const userPrompt = buildUserPrompt({ themeId: p.theme, answers });

  const checks = {
    問題原話進提示詞: userPrompt.includes(p.question),
    年齡進提示詞: userPrompt.includes(p.age),
    身分狀態進提示詞: userPrompt.includes(p.role),
    自訂欄位進提示詞: userPrompt.includes(p.extra),
    禁止通用範本: systemPrompt.includes('嚴禁寫成任何人都適用的通用範本'),
    擋下無建議的通用報告: hasWeakActions(genericReport()) === true,
    擋下敷衍短報告: isIncompleteReport(thinReport()) === true || hasWeakActions(thinReport()) === true,
    擋下模稜兩可報告: hasVagueBody(wishyWashyReport(p)) === true && hasWeakActions(wishyWashyReport(p)) === true,
    放行合格報告: isIncompleteReport(goodReport(p)) === false && hasWeakActions(goodReport(p)) === false && hasVagueBody(goodReport(p)) === false
  };

  const good = goodReport(p);
  const passed = Object.values(checks).filter(Boolean).length;
  const total = Object.keys(checks).length;
  if (passed === total) passAll += 1;

  rows.push({
    slug: p.slug,
    name: p.name,
    theme: p.theme,
    passed,
    total,
    checks,
    sections: extractSections(good).length,
    actions: extractActions(good).length
  });
}

const lines = [];
lines.push('# 問仙壇 × 20 人格 報告管線基準測試');
lines.push('');
lines.push(`執行時間：${new Date().toLocaleString('zh-TW')}`);
lines.push('');
lines.push('**這份測試測什麼**：把 20 個人格的處境做成七步問答，實際呼叫問仙壇的提示詞建構與報告品質閘門，');
lines.push('檢查產品有沒有把「這一個人」的資料送進模型，以及會不會擋下通用範本與沒有建議的報告。');
lines.push('');
lines.push('**這份測試不能證明什麼**：沒有呼叫真實 AI，所以模型實際寫出來的文字品質不在這次驗證範圍。');
lines.push('');
lines.push('| # | 人格 | 篇章 | 問題原話 | 年齡 | 身分 | 自訂欄位 | 禁通用範本 | 擋通用報告 | 擋敷衍報告 | 擋模稜兩可 | 放行合格報告 | 小計 |');
lines.push('|---|------|------|---------|------|------|---------|-----------|-----------|-----------|-----------|-------------|------|');
rows.forEach((r, i) => {
  const c = r.checks;
  const y = (v) => (v ? '✅' : '❌');
  lines.push(`| ${String(i + 1).padStart(2, '0')} | ${r.name} | ${r.theme} | ${y(c.問題原話進提示詞)} | ${y(c.年齡進提示詞)} | ${y(c.身分狀態進提示詞)} | ${y(c.自訂欄位進提示詞)} | ${y(c.禁止通用範本)} | ${y(c.擋下無建議的通用報告)} | ${y(c.擋下敷衍短報告)} | ${y(c.擋下模稜兩可報告)} | ${y(c.放行合格報告)} | ${r.passed}/${r.total} |`);
});
lines.push('');
lines.push(`**全數通過的人格：${passAll} / ${rows.length}**`);
lines.push('');

const totalChecks = rows.reduce((sum, r) => sum + r.total, 0);
const totalPassed = rows.reduce((sum, r) => sum + r.passed, 0);
lines.push(`**檢查項總計：${totalPassed} / ${totalChecks} 通過**`);

const out = new URL('../../persona-bench-output.md', import.meta.url).pathname;
writeFileSync(out, lines.join('\n'), 'utf8');
console.log(lines.join('\n'));
console.log(`\n報告已寫入：${out}`);
process.exitCode = totalPassed === totalChecks ? 0 : 1;
