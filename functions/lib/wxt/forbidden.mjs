/* 禁用詞掃描 W1–W13 與紅線規則 */

const FORBIDDEN_WORDS = [
  '扛', '撐', '纏', '走', '爆', '掉', '卡', '人味', '慘', '愣', '我說',
  '爛', '垃圾', '繞', '斷片', '業配', '打臉', '爽', '身體很誠實', 'V了'
];

const PATTERNS = [
  /\d+(\.\d+)?\s*%/,
  /百分之\s*\d+/,
  /不是[^，。；\n]{1,12}是[^，。；\n]{1,12}/,
  /一定會|保證|必定/,
  /診斷|治療|開藥|處方|療效|根治/
];

const BODY_PERSONIFICATION = /(?:心|肝|胃|腸|腦|身體|細胞|血液)[^，。；\n]{0,6}(?:說|想|哭|鬧|抗議)/;

const REPLACEMENTS = [
  [/扛/g, '承擔'],
  [/撐/g, '支撐'],
  [/爆/g, '突然升高'],
  [/卡/g, '停滯'],
  [/爛/g, '不理想'],
  [/垃圾/g, '不適合'],
  [/爽/g, '順暢'],
  [/V了/g, '完成了'],
  [/\d+(\.\d+)?\s*%/g, ''],
  [/百分之\s*\d+/g, '']
];

export function scanForbidden(text) {
  const value = String(text || '');
  const hits = [];
  for (const word of FORBIDDEN_WORDS) {
    if (value.includes(word)) hits.push(word);
  }
  for (const pattern of PATTERNS) {
    const match = value.match(pattern);
    if (match) hits.push(match[0]);
  }
  if (BODY_PERSONIFICATION.test(value)) hits.push('身體擬人化');
  return [...new Set(hits)];
}

export function replaceForbidden(text) {
  let out = String(text || '');
  for (const [pattern, replacement] of REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out.trim();
}

export const THEME_SKELETONS = {
  love: ['對象輪廓與相處模式', '這段關係目前的節奏', '適合主動或等待的時機', '自身要調整的互動習慣'],
  wealth: ['正財偏財的傾向', '漏財的具體情境', '守財與開源的順序', '大額決策的時機判斷'],
  work: ['現職局勢與位置', '優勢與缺口', '留任或轉換的節奏', '近期可做的下一步'],
  career: ['生意位置與角色', '現金與合夥風險', '本階段可驗證的假設', '停或進的檢核點'],
  family: ['家庭關係位置', '衝突節點', '一次只處理一件事的協調', '需要外人協助的界線'],
  children: ['孩子階段與照顧者角色', '互動調整', '家庭與學校可觀察項', '專業協助警示']
};

export function buildSystemPrompt(themeId) {
  const skeleton = (THEME_SKELETONS[themeId] || THEME_SKELETONS.love).join(' → ');
  return [
    '你是問仙壇的個人化問答解讀顧問，依使用者七步答案產出繁體中文報告。',
    '禁止排紫微八字、禁止百分比與倍數、禁止醫療療效宣稱、禁止絕對化保證。',
    `本篇解讀骨架：${skeleton}。`,
    '若有掌紋客觀描述，僅作參考素材，不可當成醫療診斷。',
    '回傳 JSON：{ "title": "...", "sections": [{"heading":"...","body":"..."}], "summary": "..." }'
  ].join('\n');
}

export function buildUserPrompt({ themeId, answers, palmDescription = '' }) {
  const lines = [
    `篇章：${themeId}`,
    `性別：${answers.gender || ''}`,
    `年齡：${answers.age || ''}`,
    `關係狀態：${answers.relation || ''}`,
    `角色：${answers.role || ''}`,
    `主要問題：${answers.question || ''}`,
    `期望方向：${answers.goal || ''}`
  ];
  if (palmDescription) lines.push(`掌紋線條客觀描述：${palmDescription}`);
  return lines.join('\n');
}
