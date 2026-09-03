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

export function isIncompleteReport(raw) {
  if (!raw) return true;
  const report = (typeof raw === 'object' && !Array.isArray(raw)) ? raw : { summary: String(raw || '') };
  const title = stripTags(report.title || '');
  const bodyText = formatAdviceFromReport(report);

  if (INCOMPLETE_TITLE.some((word) => title.includes(word))) return true;

  const dump = `${title}\n${bodyText}`;
  if (INCOMPLETE_HARD.some((word) => dump.includes(word))) return true;

  return !bodyText.trim();
}
