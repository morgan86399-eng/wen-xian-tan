/* 禁用詞掃描 W1–W13 與紅線規則 */

const FORBIDDEN_WORDS = [
  '扛', '撐', '纏', '走', '爆', '掉', '卡', '人味', '慘', '愣', '我說',
  '爛', '垃圾', '繞', '斷片', '業配', '打臉', '爽', '身體很誠實', 'V了',
  // 本站不提供任何人像產出，也不做外貌描述：模型吐出這幾個字一律攔下重寫
  '肖像', '長相', '樣貌', '容貌', '五官'
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
  [/正緣模擬肖像/g, '正緣指引'],
  [/肖像/g, '解析'],
  [/長相|樣貌|容貌|五官/g, '性格特質'],
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


/* 六篇各自的四段骨架：heading 逐字給模型，禁止增減改名 */
export const THEME_SKELETONS = {
  love: ['對象輪廓與相處模式', '這段關係目前的節奏', '適合主動或等待的時機', '自身要調整的互動習慣'],
  work: ['現職局勢與您的位置', '天賦優勢與明顯缺口', '留任或轉換的節奏', '近期可驗證的下一步'],
  career: ['事業定位與您的角色', '現金流與合夥風險', '本階段要驗證的假設', '收手或加碼的檢核點'],
  wealth: ['正財偏財的傾向', '財務外流的具體情境', '守成與開源的先後順序', '大額決策的時機判斷'],
  family: ['家庭關係裡的位置', '衝突節點與觸發情境', '一次處理一件事的協調順序', '需要外人協助的界線'],
  children: ['孩子的階段與照顧者角色', '互動方式的調整', '家庭與學校可觀察的項目', '需要專業協助的警訊']
};

export const THEME_NAMES = {
  love: '感情篇',
  work: '工作篇',
  career: '事業篇',
  wealth: '財運篇',
  family: '家庭篇',
  children: '小孩篇'
};

/* 重試用的加硬指令：只有偵測到模型反過來要資料時才附加 */
export const HARDENED_RETRY_HINT = [
  '',
  '【重試指令】上一次的輸出向使用者索取資料或列出待補清單，這是不合格的輸出。',
  '本次禁止任何索取、反問、待補清單、流程說明，直接用上面已有的資料寫滿四段內文與三條行動建議。'
].join('\n');

/* 建議不合格時的重試指令：只在三條建議缺漏、太短、重複或抄內文時附加 */
export const WEAK_ACTIONS_RETRY_HINT = [
  '',
  '【重試指令】上一次的 actions 不合格：可能少於三條、太短、彼此重複，或直接抄了內文句子。',
  '本次請重寫三條互不重複的建議，每條 30 到 60 字，各自寫出「什麼時候、對誰、具體做什麼」，',
  '而且要扣住使用者填寫的主要問題，不可以只寫心態或口號。'
].join('\n');

function themeKey(themeId) {
  return THEME_SKELETONS[themeId] ? themeId : 'love';
}

export function buildSystemPrompt(themeId) {
  const key = themeKey(themeId);
  const skeleton = THEME_SKELETONS[key];
  const headings = skeleton.map((item, index) => `${index + 1}. ${item}`).join('\n');
  return [
    `你是問仙壇的${THEME_NAMES[key]}解讀顧問，為信眾產出繁體中文的完整解讀報告。`,
    '',
    '【資料狀態】使用者的七步問答已經全部完成，下方就是本次可用的全部資料。',
    '欄位標示「未指定」代表使用者選擇不填，請依既有資料與常見情境自行推演，不因此停下。',
    '',
    '【最高禁令】',
    '1. 嚴禁向使用者索取任何補充資料，嚴禁輸出「需要您補充的資訊」「請提供」「請依序提供」這類清單。',
    '2. 嚴禁反問使用者，嚴禁表示自己缺少關鍵資訊、資料不足或無法完成解讀。',
    '3. 嚴禁把待補清單、作業流程、步驟說明當成報告內容。',
    '4. 本次一定要輸出一份可以直接閱讀的完整報告。',
    '',
    `【固定骨架】依序寫滿以下四段，heading 逐字使用，不可增減、不可改名：\n${headings}`,
    '每段 body 至少 120 字，用一般人聽得懂的白話，扣住使用者填寫的問題與狀態，寫出具體情境與可以觀察的跡象。',
    '',
    '【貼合本人】這份報告只寫給這一位使用者：',
    '1. 內文至少一次直接扣住他填寫的「本次主要問題」，用他自己的說法，不要換成籠統的代稱。',
    '2. 依他的年齡、目前狀態與稱謂關係調整語氣和舉例，年輕人與長輩的例子不可以互換。',
    '3. 嚴禁寫成任何人都適用的通用範本，也不要複述題目。',
    '',
    '【建設性建議】actions 必須剛好三條，每條 30 到 60 字，是使用者這一週就能自己開始做的具體行動。',
    '每一條都要寫出「什麼時候、對誰、具體做什麼」，三條之間不可以重複，',
    '也不可以整句照抄四段內文，更不要只寫心態口號。',
    '',
    '【紅線】不排紫微八字、不出現百分比與倍數、不做醫療診斷或療效宣稱、不用一定會或保證這類絕對用語。',
    '掌紋描述只當參考素材，不可當成醫療診斷。',
    '',
    '【輸出格式】只回傳 JSON，前後不要任何額外文字：',
    '{"title":"一句話標題","sections":[{"heading":"...","body":"..."}],"actions":["...","...","..."],"summary":"120 字以內的總結"}'
  ].join('\n');
}

const GENDER_FALLBACK = {
  female: '女性',
  male: '男性',
  other: '不透露'
};

function firstText(...values) {
  for (const value of values) {
    const text = String(value == null ? '' : value).trim();
    if (text) return text;
  }
  return '';
}

export function buildUserPrompt({ themeId, answers, palmDescription = '' }) {
  const data = (answers && typeof answers === 'object') ? answers : {};
  const key = themeKey(themeId);

  const gender = firstText(data.genderLabel, data.genderCustom, GENDER_FALLBACK[data.gender]) || '未指定';
  const age = firstText(data.ageLabel, data.ageCustom, data.age) || '未指定';
  const relation = firstText(data.relationLabel, data.relationCustom) || '未指定';
  const role = firstText(data.roleLabel, data.roleCustom) || '未指定';
  const question = firstText(data.question) || '未指定，請就本篇最常見的處境給出解讀';

  const rawGoal = firstText(data.goalLabel, data.goalCustom);
  const skipped = !rawGoal || rawGoal === '略過' || data.goal === 'skip';
  const goal = skipped ? '未指定，請全方位推演' : rawGoal;

  const lines = [
    `篇章：${THEME_NAMES[key]}`,
    '七步問答結果（已完整，這是本次的全部資料）：',
    `1. 性別：${gender}`,
    `2. 年齡：${age}`,
    `3. 稱謂／對象關係：${relation}`,
    `4. 目前狀態：${role}`,
    `5. 本次主要問題：${question}`,
    `6. 期望方向：${goal}`,
    `7. 掌紋：${palmDescription ? '已提供，客觀描述如下' : '本次未提供，改以前六項推演'}`
  ];
  if (palmDescription) lines.push(`掌紋線條客觀描述：${palmDescription}`);

  // 問卷若有其他自訂輸入，一併送進去，不要讓個人細節在這裡消失
  const KNOWN = new Set([
    'gender', 'genderLabel', 'genderCustom', 'age', 'ageLabel', 'ageCustom',
    'relation', 'relationLabel', 'relationCustom', 'role', 'roleLabel', 'roleCustom',
    'question', 'goal', 'goalLabel', 'goalCustom', 'palmDataUrl', 'palmImageBase64'
  ]);
  const extras = [];
  for (const [field, value] of Object.entries(data)) {
    if (KNOWN.has(field)) continue;
    const text = String(value == null ? '' : value).trim();
    if (!text || text.length > 200) continue;
    extras.push(`- ${field}：${text}`);
  }
  if (extras.length) {
    lines.push('');
    lines.push('補充填寫內容：');
    lines.push(...extras.slice(0, 10));
  }

  lines.push('');
  lines.push('以上七步資料已齊，請直接輸出完整報告，不得要求補充任何資料，不得反問使用者。');
  return lines.join('\n');
}
