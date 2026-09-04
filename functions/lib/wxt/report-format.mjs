/* 把 generate / 歷史紀錄的 JSON 收成報告頁可用的正文 */

function stripTags(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+\n/g, '\n').trim();
}

function looksLikeReport(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  return Boolean(
    obj.advice
    || obj.formattedAdvice
    || obj.summary
    || obj.sections
    || obj.title
    || obj.body
    || obj.text
    || (obj.content && (typeof obj.content === 'string' || typeof obj.content === 'object'))
  );
}

export function formatAdviceFromReport(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string') return stripTags(raw);
  if (typeof raw !== 'object') return '';

  const direct = [raw.advice, raw.formattedAdvice, raw.body, raw.text];
  for (const item of direct) {
    if (typeof item === 'string' && item.trim()) return stripTags(item);
  }

  if (typeof raw.content === 'string' && raw.content.trim()) {
    return stripTags(raw.content);
  }
  if (raw.content && typeof raw.content === 'object') {
    const nested = formatAdviceFromReport(raw.content);
    if (nested) return nested;
  }

  const parts = [];
  if (typeof raw.summary === 'string' && raw.summary.trim()) {
    parts.push(raw.summary.trim());
  }
  if (Array.isArray(raw.sections)) {
    for (const section of raw.sections) {
      if (!section || typeof section !== 'object') continue;
      const heading = typeof section.heading === 'string' ? section.heading.trim() : '';
      const body = typeof section.body === 'string'
        ? section.body.trim()
        : (typeof section.content === 'string' ? section.content.trim() : '');
      if (heading && body) parts.push(`${heading}\n${body}`);
      else if (body) parts.push(body);
      else if (heading) parts.push(heading);
    }
  }
  return stripTags(parts.join('\n\n'));
}

export function withAdviceField(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { advice: formatAdviceFromReport(raw) };
  }
  const advice = formatAdviceFromReport(raw);
  if (typeof raw.advice === 'string' && raw.advice.trim() && raw.advice === advice) {
    return raw;
  }
  return { ...raw, advice };
}

export function pickReportObject(apiResult) {
  if (!apiResult || typeof apiResult !== 'object') return {};
  const nestedReading = apiResult.reading && typeof apiResult.reading === 'object'
    ? apiResult.reading
    : null;
  const candidates = [
    nestedReading && nestedReading.report,
    nestedReading && nestedReading.content,
    apiResult.report,
    apiResult.content,
    nestedReading,
    apiResult
  ];
  for (const candidate of candidates) {
    if (!looksLikeReport(candidate)) continue;
    if (
      candidate.content
      && typeof candidate.content === 'object'
      && !candidate.advice
      && !candidate.summary
      && !Array.isArray(candidate.sections)
    ) {
      return pickReportObject(candidate.content);
    }
    return candidate;
  }
  return apiResult.report || apiResult.content || nestedReading || apiResult || {};
}

/* 建設性建議：模型回的 actions 陣列，容忍字串或物件寫法 */
export function extractActions(raw) {
  if (!raw || typeof raw !== 'object') return [];
  const source = raw.actions || raw.suggestions || raw.nextSteps || raw.advices || raw.todo;
  const list = Array.isArray(source) ? source : (typeof source === 'string' ? [source] : []);
  const out = [];
  for (const item of list) {
    let text = '';
    if (typeof item === 'string') text = item;
    else if (item && typeof item === 'object') {
      text = String(item.text || item.body || item.content || item.action || item.title || '');
    }
    const cleaned = stripTags(text).replace(/^[\d]+[.、)]\s*/, '').trim();
    if (cleaned) out.push(cleaned);
  }
  return out.slice(0, 5);
}

/* 未完成報告偵測：模型反過來跟使用者要資料時，不可以當成品 */
const INCOMPLETE_HARD = [
  '請提供七步',
  '七步答案',
  '缺少關鍵',
  '需要您補充',
  '需要你補充',
  '請依序提供',
  '請提供以下',
  '無法完成解讀',
  '資料不足',
  '資訊不足'
];

const INCOMPLETE_TITLE = ['請提供', '請補充', '請告訴我', '缺少', '無法解讀'];

/* 報告合約寫死四段：段數不足代表模型沒照骨架寫（llama 沒有 JSON 模式時常整段吐純文字） */
const REQUIRED_SECTIONS = 4;
/* 一段少於這個字數就是敷衍，不是報告 */
const SECTION_MIN_BODY = 40;

/* 建設性建議的最低門檻：三條、每條夠長、彼此不重複、也不能直接抄內文 */
export const REQUIRED_ACTIONS = 3;
const ACTION_MIN_LEN = 18;

/** 把 sections 收成 [{heading, body}]，給報告頁分段排版用 */
export function extractSections(raw) {
  if (!raw || typeof raw !== 'object') return [];
  const list = Array.isArray(raw.sections) ? raw.sections : [];
  const out = [];
  for (const section of list) {
    if (!section || typeof section !== 'object') continue;
    const heading = stripTags(section.heading || section.title || '');
    const body = stripTags(section.body || section.content || section.text || '');
    if (!heading && !body) continue;
    out.push({ heading, body });
  }
  return out;
}

function normalizeAction(text) {
  return String(text || '').replace(/[\s，。、；：!！?？~～．・…]/g, '');
}

/* 模稜兩可的空話：出現在內文就是沒有真的針對這個人講話 */
const VAGUE_PHRASES = [
  '順其自然', '時間到了', '自然會好', '自然就會', '因人而異', '見仁見智',
  '保持正面', '放寬心', '平常心', '一切都會好', '船到橋頭', '隨遇而安',
  '多加留意', '適時調整', '凡事都有', '未來會更好', '船到橋頭自然直'
];

/* 建議裡的軟釘子：講了等於沒講 */
const HEDGE_WORDS = ['盡量', '儘量', '適時', '適度', '多加', '不妨', '試著看看', '再看看情況', '視情況'];

/* 可執行＝講得出什麼時候做 */
const TIME_ANCHORS = [
  '今天', '今晚', '今早', '明天', '後天', '本週', '這週', '這禮拜', '這星期',
  '週末', '周末', '下週', '下星期', '三天', '五天', '七天', '一週', '兩週',
  '每天', '每週', '月底', '下個月', '這個月', '睡前', '起床'
];

/** 內文出現空話就回 true */
export function hasVagueBody(raw) {
  const bodyText = formatAdviceFromReport(raw);
  return VAGUE_PHRASES.some((phrase) => bodyText.includes(phrase));
}

/** 建議不合格就回 true：這是報告能不能交付的硬門檻，不是加分項 */
export function hasWeakActions(raw) {
  const actions = extractActions(raw);
  if (actions.length < REQUIRED_ACTIONS) return true;

  const picked = actions.slice(0, REQUIRED_ACTIONS);
  if (picked.some((item) => item.length < ACTION_MIN_LEN)) return true;

  const unique = new Set(picked.map(normalizeAction));
  if (unique.size < REQUIRED_ACTIONS) return true;

  // 軟釘子：一條裡出現「盡量」「適時」這種字就等於沒給做法
  if (picked.some((item) => HEDGE_WORDS.some((word) => item.includes(word)))) return true;

  // 三條裡至少兩條要講得出什麼時候做，否則只是方向不是行動
  const anchored = picked.filter((item) => TIME_ANCHORS.some((word) => item.includes(word)));
  if (anchored.length < 2) return true;

  // 建議直接抄內文原句就不算建議
  const bodyText = normalizeAction(formatAdviceFromReport(raw));
  return picked.some((item) => bodyText.includes(normalizeAction(item)));
}

export function isIncompleteReport(raw) {
  if (!raw) return true;
  const report = (typeof raw === 'object' && !Array.isArray(raw)) ? raw : { summary: String(raw || '') };
  const title = stripTags(report.title || '');
  const bodyText = formatAdviceFromReport(report);

  if (INCOMPLETE_TITLE.some((word) => title.includes(word))) return true;

  const dump = `${title}\n${bodyText}`;
  if (INCOMPLETE_HARD.some((word) => dump.includes(word))) return true;

  if (!bodyText.trim()) return true;

  const sections = Array.isArray(report.sections) ? report.sections : [];
  const filled = sections.filter((section) => {
    if (!section || typeof section !== 'object') return false;
    const body = typeof section.body === 'string' ? section.body : (typeof section.content === 'string' ? section.content : '');
    return body.trim().length >= SECTION_MIN_BODY;
  });
  return filled.length < REQUIRED_SECTIONS;
}
