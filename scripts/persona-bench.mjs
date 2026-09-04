/* 20 人格 × 問仙壇報告管線基準測試
   測的是「產品有沒有把這個人的處境送進模型，以及會不會擋下通用範本與沒有建議的報告」。
   沒有呼叫真實 AI，所以不代表模型寫出來的文字品質。 */

import { writeFileSync } from 'node:fs';
import { buildSystemPrompt, buildUserPrompt } from '../functions/lib/wxt/forbidden.mjs';
import { isIncompleteReport, hasWeakActions, extractSections, extractActions } from '../functions/lib/wxt/report-format.mjs';

const PERSONAS = [
  { slug: 'mother', name: '林秀芬', age: '45 ~ 54 歲', theme: 'family', gender: '女性', relation: '家人', role: '已婚 · 與子女同住',
    question: '我女兒現在連房門都鎖著不跟我講話，我到底哪裡做錯了', extraKey: 'familyNote', extra: '先生長年外派，家裡只有我和女兒' },
  { slug: 'group-buying-mom', name: '陳淑惠', age: '35 ~ 44 歲', theme: 'wealth', gender: '女性', relation: '本人自身', role: '全職媽媽兼團購主',
    question: '團購的錢每個月都在轉，但存款一直沒有增加，我到底哪裡漏財', extraKey: 'incomeNote', extra: '每月流水約二十萬，實拿不到兩萬' },
  { slug: 'retired-teacher', name: '曾國榮', age: '55 歲以上', theme: 'family', gender: '男性', relation: '家人', role: '退休 · 與配偶同住',
    question: '退休後在家講話沒人要聽，跟兒子每次見面都在吵，我該怎麼辦', extraKey: 'familyNote', extra: '兒子今年三十五歲，一年回家兩次' },
  { slug: 'senior-citizen', name: '洪金土', age: '55 歲以上', theme: 'family', gender: '男性', relation: '本人自身', role: '獨居 · 退休',
    question: '我一個人住，萬一哪天倒在家裡沒人知道，這件事我該先跟誰講', extraKey: 'healthNote', extra: '眼睛看不清楚，手機只會接電話' },
  { slug: 'spiritual-elder', name: '廖素蘭', age: '55 歲以上', theme: 'wealth', gender: '女性', relation: '本人自身', role: '退休 · 進修中',
    question: '我一直在上課學顯化豐盛，但錢還是留不住，這是業力的關係嗎', extraKey: 'spendNote', extra: '一年上課花費超過三十萬' },
  { slug: 'senior-engineer', name: '柯明哲', age: '35 ~ 44 歲', theme: 'work', gender: '男性', relation: '本人自身', role: '在職 · 資深技術主管',
    question: '公司一直要導入 AI，我在想要不要換工作，還是先留在原位觀察', extraKey: 'workNote', extra: '團隊裡我年紀最大，房貸還有十八年' },
  { slug: 'intern', name: '許庭萱', age: '18 ~ 24 歲', theme: 'work', gender: '女性', relation: '本人自身', role: '實習中 · 大四',
    question: '我很怕做錯事被辭退，每天加班到很晚還是覺得自己不夠好', extraKey: 'workNote', extra: '這是第一份工作，不敢問主管問題' },
  { slug: 'anxious-manager', name: '楊政達', age: '35 ~ 44 歲', theme: 'work', gender: '男性', relation: '本人自身', role: '在職 · 中階主管',
    question: '下個月數字沒到我這組可能被裁，我要先跟主管說明還是自己先處理', extraKey: 'healthNote', extra: '最近血壓偏高，半夜會醒來' },
  { slug: 'entrepreneur', name: '陸震華', age: '35 ~ 44 歲', theme: 'career', gender: '男性', relation: '本人自身', role: '創業中 · 公司負責人',
    question: '這輪融資談不下來，要先縮編保住現金，還是繼續照原計畫擴張', extraKey: 'cashNote', extra: '帳上現金剩四個月' },
  { slug: 'compliance-accountant', name: '莊美玲', age: '45 ~ 54 歲', theme: 'work', gender: '女性', relation: '本人自身', role: '在職 · 會計主管',
    question: '主管一直要我放行不合規的單據，我要不要離職', extraKey: 'workNote', extra: '再兩年可以領到退休金' },
  { slug: 'gen-z-student', name: '邱子軒', age: '18 ~ 24 歲', theme: 'work', gender: '男性', relation: '本人自身', role: '學生 · 高二',
    question: '反正努力也買不起房，我還要不要拚大學', extraKey: 'studyNote', extra: '班排中段，家裡沒有人可以商量' },
  { slug: 'influencer', name: '林若涵', age: '25 ~ 34 歲', theme: 'career', gender: '女性', relation: '本人自身', role: '自由接案 · 自媒體',
    question: '流量少了一半，我要轉型做別的題材，還是繼續做美妝', extraKey: 'incomeNote', extra: '業績最好的時候月收二十萬，現在剩三萬' },
  { slug: 'passionate-sales', name: '蔡宗憲', age: '25 ~ 34 歲', theme: 'wealth', gender: '男性', relation: '本人自身', role: '在職 · 房仲業務',
    question: '我身上有幾百萬債務，這一行還要不要繼續做下去', extraKey: 'debtNote', extra: '每月最低應繳四萬八' },
  { slug: 'social-activist', name: '梁詠欣', age: '25 ~ 34 歲', theme: 'career', gender: '女性', relation: '本人自身', role: '在職 · 非營利組織',
    question: '做倡議薪水很低又看不到改變，我該不該轉去企業上班', extraKey: 'valueNote', extra: '同溫層會覺得我背叛理念' },
  { slug: 'overseas-student', name: '杜家瑋', age: '18 ~ 24 歲', theme: 'work', gender: '男性', relation: '本人自身', role: '學生 · 海外碩士',
    question: '投過八百封履歷沒有回音，簽證快到期，我要留下還是回台灣', extraKey: 'loanNote', extra: '學貸兩百萬，父母不知道' },
  { slug: 'single-father', name: '謝文彬', age: '35 ~ 44 歲', theme: 'children', gender: '男性', relation: '子女', role: '單親 · 長途貨運',
    question: '我女兒上國中之後就不跟我說話，我又常常不在家，要怎麼跟她相處', extraKey: 'childNote', extra: '女兒國二，週間住阿嬤家' },
  { slug: 'blue-collar-worker', name: '吳萬財', age: '55 歲以上', theme: 'wealth', gender: '男性', relation: '本人自身', role: '在職 · 工程統包',
    question: '被業主倒帳三百萬，工班的薪水要怎麼發得出來', extraKey: 'debtNote', extra: '底下八個師傅等著領錢' },
  { slug: 'counselor', name: '簡心儀', age: '35 ~ 44 歲', theme: 'love', gender: '女性', relation: '伴侶', role: '在職 · 諮商心理師',
    question: '我每天聽別人的痛苦，回到家跟伴侶一句話都不想講', extraKey: 'workNote', extra: '一週接二十八個個案' },
  { slug: 'isolated-youth', name: '韓宇晨', age: '18 ~ 24 歲', theme: 'family', gender: '男性', relation: '家人', role: '待業 · 與家人同住',
    question: '我兩年沒有出門，家裡快要停止金援，我不知道怎麼開口', extraKey: 'stateNote', extra: '白天睡覺，只在半夜出房間' },
  { slug: 'petty-bourgeois', name: '溫郁雯', age: '25 ~ 34 歲', theme: 'wealth', gender: '女性', relation: '本人自身', role: '在職 · 行銷企劃',
    question: '薪水三萬八，想存頭期款但物價一直漲，這件事還有可能嗎', extraKey: 'saveNote', extra: '每月固定存六千，已經存三年' }
];

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
    放行合格報告: isIncompleteReport(goodReport(p)) === false && hasWeakActions(goodReport(p)) === false
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
lines.push('| # | 人格 | 篇章 | 問題原話 | 年齡 | 身分 | 自訂欄位 | 禁通用範本 | 擋通用報告 | 擋敷衍報告 | 放行合格報告 | 小計 |');
lines.push('|---|------|------|---------|------|------|---------|-----------|-----------|-----------|-------------|------|');
rows.forEach((r, i) => {
  const c = r.checks;
  const y = (v) => (v ? '✅' : '❌');
  lines.push(`| ${String(i + 1).padStart(2, '0')} | ${r.name} | ${r.theme} | ${y(c.問題原話進提示詞)} | ${y(c.年齡進提示詞)} | ${y(c.身分狀態進提示詞)} | ${y(c.自訂欄位進提示詞)} | ${y(c.禁止通用範本)} | ${y(c.擋下無建議的通用報告)} | ${y(c.擋下敷衍短報告)} | ${y(c.放行合格報告)} | ${r.passed}/${r.total} |`);
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
