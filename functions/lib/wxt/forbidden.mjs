/* 禁用詞掃描 W1–W13 與紅線規則 */

/* 一律禁：這些詞沒有合法用法，出現就是違規 */
const FORBIDDEN_WORDS = [
  '纏', '人味', '慘', '愣', '我說', '垃圾', '繞', '斷片', '業配', '打臉',
  '身體很誠實', 'V了',
  // 本站不提供任何人像產出，也不做外貌描述：模型吐出這幾個字一律攔下重寫
  '肖像', '長相', '樣貌', '容貌', '五官'
];

/* 依詞組禁：這些字本身有合法用法（信用卡、走路、掉眼淚），
   照單字掃會把正常句子判成違規，也會被替換成亂碼。
   規則總表本來就寫明「具體動作（掉淚、掉東西）可用」，這裡照那個意思實作。 */
const FORBIDDEN_PHRASES = [
  /扛不住|扛下來|扛起|扛著/,
  /撐不住|撐不下去|硬撐/,
  /引爆|爆發|爆炸|爆滿|爆紅/,
  /卡住|卡關|卡在/,
  /爛攤子|很爛|太爛|超爛|爛透/,
  /爽快|很爽|好爽|超爽/,
  /走成|走向|走下去|走上坡|走下坡/,
  /往下掉|狀態在掉|一直掉/
];

const PATTERNS = [
  /\d+(\.\d+)?\s*%/,
  /百分之\s*\d+/,
  /不是[^，。；\n]{1,12}是[^，。；\n]{1,12}/,
  /一定會|保證|必定/,
  /診斷|治療|開藥|處方|療效|根治/
];

const BODY_PERSONIFICATION = /(?:心|肝|胃|腸|腦|身體|細胞|血液)[^，。；\n]{0,6}(?:說|想|哭|鬧|抗議)/;

/* 替換一律用詞組，不用單字。
   單字全域替換會把「引爆→引突然升高」「垃圾桶→不適合桶」「信用卡→信用停滯」改成亂碼，
   而那是直接送到付費使用者眼前的正文。長詞組必須排在短詞組前面。 */
const REPLACEMENTS = [
  [/正緣模擬肖像/g, '正緣指引'],
  [/肖像/g, '解析'],
  [/長相|樣貌|容貌|五官/g, '性格特質'],

  [/扛不住/g, '承受不了'],
  [/扛下來/g, '承擔下來'],
  [/扛起/g, '承擔起'],
  [/扛著/g, '承擔著'],

  [/撐不下去/g, '難以維持'],
  [/撐不住/g, '支持不住'],
  [/硬撐/g, '勉強維持'],

  [/突然爆發/g, '突然升高'],
  [/引爆/g, '引發'],
  [/爆發/g, '突然發生'],
  [/爆炸/g, '劇烈起伏'],
  [/爆滿/g, '額滿'],
  [/爆紅/g, '迅速受到注意'],

  [/卡住/g, '停滯'],
  [/卡關/g, '停滯'],
  [/卡在/g, '停留在'],

  [/爛攤子/g, '難以收拾的局面'],
  [/很爛|太爛|超爛/g, '很不理想'],

  [/垃圾桶/g, '回收桶'],
  [/垃圾話/g, '難聽的話'],
  [/垃圾食物/g, '空熱量食物'],
  [/垃圾/g, '不需要的東西'],

  [/爽快/g, '乾脆'],
  [/很爽|好爽|超爽/g, '很順暢'],

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
  for (const phrase of FORBIDDEN_PHRASES) {
    const match = value.match(phrase);
    if (match) hits.push(match[0]);
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
  love: ['這段關係真正卡住的地方', '對方沒有說出來的那一面', '適合主動或等待的時機', '這一步你可以怎麼做'],
  work: ['你現在最該注意的事', '你的優勢與還沒補上的那一塊', '這一段路的節奏建議', '可以馬上開始執行的下一步'],
  career: ['目前局勢的關鍵判斷', '金流與合作關係的隱憂', '這個階段最優先要做的事', '這個月內可以執行的具體動作'],
  wealth: ['你的正財與偏財傾向', '錢最容易流掉的地方', '守成與開源的先後順序', '這筆錢該怎麼處理的操作步驟'],
  family: ['這件事的核心矛盾在哪', '衝突最常被觸發的原因', '一次處理一件事的優先順序', '現在就可以開始做的事'],
  children: ['孩子目前最需要的是什麼', '互動方式要調整的地方', '家庭與學校可以觀察的項目', '家長現在可以開始調整的做法']
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

/* 內文寫成空話時的重試指令 */
export const VAGUE_RETRY_HINT = [
  '',
  '【重試指令】上一次的內文出現「順其自然」「保持正面」「時間到了自然會好」這類任何人都適用的空話，這是不合格的輸出。',
  '本次每一段都要寫出：這個人現在的具體情境、他接下來會看到的可觀察跡象、以及大概什麼時候會發生。',
  '不要用模稜兩可的說法收尾，該說會怎樣就說會怎樣，說不準的地方要講清楚是哪一個變數還沒確定。'
].join('\n');

/* 建議不合格時的重試指令：只在三條建議缺漏、太短、重複或抄內文時附加 */
export const WEAK_ACTIONS_RETRY_HINT = [
  '',
  '【重試指令】上一次的 actions 不合格：可能少於三條、太短、彼此重複、用時間詞當開頭，或直接抄了內文句子。',
  '本次請重寫三條互不重複的建議，每條 30 到 60 字，各自寫出「什麼時候、對誰、具體做什麼」，',
  '時間要放在句子中間，不可以用時間詞當開頭，三條的句型結構也不可以相同，',
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
    `你是Zenasker的${THEME_NAMES[key]}解讀顧問，為會員產出繁體中文的完整解讀報告。`,
    '',
    '【這份報告的核心原則：直白、直接、不廢話】',
    '使用者付費是為了拿到明確的判斷與方向，不是聽故事。',
    '不要重述他已經知道的事（他的角色、職位、背景），他自己填的資料他都知道。',
    '直接切入分析，給出你的判斷、風險評估、與行動方向。',
    '',
    '【最重要的一件事：扣住他自己填的問題】',
    '他填的「本次主要問題」是整份報告的軸心，四段裡至少要有兩段直接扣住它。',
    '第一段必須把他問題裡的具體名詞逐字用進去：他寫合夥人就寫合夥人，寫房貸就寫房貸，寫店面就寫店面，',
    '不可以換成「家人」「財務狀況」「事業」這種籠統代稱。',
    '嚴禁把他的問題改寫成抽象說法。',
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
    '四段合計至少 600 字，單段不少於 100 字。四段長度不要平均，該多寫的段落就多寫。',
    '',
    '【文風：直白不迂迴】',
    '1. 不要描述情境、不要編故事、不要寫「這幾天你可能會看到...」這種虛構場景，更不要編造辦公室對話與心跳劇情。',
    '2. 不要複述使用者已經知道的背景（他的身分、角色、處境、目前職位），他自己填的自己都知道，直接講分析結論。',
    '3. 開場第一句就切入核心問題的判斷，不要鋪陳。',
    '4. 每段的重心是你的專業分析、風險評估與具體策略建議，不是情境描寫。',
    '5. 講清楚「該怎麼做」「風險在哪」「什麼時候要注意」，而不是「你可能會感到...」。',
    '6. 嚴禁用「在一個...的場景中」「想像一下」「你走進辦公室」這類敘事手法。',
    '7. 嚴禁寫成任何人都適用的通用範本，必須直接針對他的具體提問與真實痛點給出直接犀利的判斷。',
    '',
    '【每一段都要有這三樣】',
    '1. 明確判斷：直接講你的結論，不要用「可能」「或許」帶過。',
    '2. 具體風險或機會：點出他會遇到什麼問題、或可以把握什麼機會。',
    '3. 可執行的方向：每段結束前都要講清楚這一步該怎麼做。',
    '',
    '【第四段是重中之重：具體操作步驟】',
    '第四段必須寫出使用者現在就能執行的做法，要精確到「找誰、做什麼、怎麼開始」。',
    '舉例：',
    '- 買房就要講「先去哪幾家銀行問利率、準備什麼文件、頭期款怎麼算」。',
    '- 感情就要講「用什麼方式開口、什麼時機點講、避免哪些地雷句」。',
    '- 事業就要講「先跟誰約談、要確認哪幾個數字、底線怎麼設」。',
    '- 工作就要講「履歷先改哪裡、先投哪個管道、面試前準備什麼」。',
    '- 財運就要講「這筆錢先放哪、要不要拆成幾份、什麼時候再動」。',
    '- 小孩就要講「今天回家先做什麼、跟老師怎麼溝通、觀察紀錄怎麼開始」。',
    '嚴禁只寫「觀察」「留意」「注意」而不給實際做法。',
    '嚴禁用「建議諮詢專業人士」這種把球踢回去的空話收尾。',
    '',
    '【禁止模稜兩可】',
    '1. 嚴禁「順其自然」「保持正面」「放寬心」「時間到了自然會好」「因人而異」這類空話。',
    '2. 該下判斷的地方就下判斷。真的說不準時，要指名是哪一個變數還沒確定。',
    '3. 每段至少要出現一次時間感：這幾天、這個月、下一季，讓他知道在講哪一段時間。',
    '',
    '【行文】',
    '用一般人講話的方式寫，不要條列，不要在內文裡再開小標題。',
    '四段的開頭句型不可以相同，也不要每段都用同一個字詞起頭。',
    '',
    '【紅線】不排紫微八字、不出現百分比與倍數、不做醫療診斷或療效宣稱、不用一定會或保證這類絕對用語。',
    '掌紋描述只當參考素材，不可當成醫療診斷。',
    '',
    '【輸出格式】只回傳 JSON，前後不要任何額外文字：',
    '{"title":"一句話標題","sections":[{"heading":"...","body":"..."}],"summary":"120 字以內的總結"}'
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
