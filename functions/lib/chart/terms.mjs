/* 報告與節奏檔禁止出現的命理專有名詞。每次掃描都 new RegExp，避免 /g lastIndex 殘留。 */

export const CHART_TERM_SOURCE = [
  '紫微斗數', '紫微', '八字命盤', '八字', '命宮', '身宮', '四化', '十神',
  '天干地支', '天干', '地支', '星曜', '宮位', '流年', '大限', '坤造', '乾造',
  '貪狼', '巨門', '廉貞', '破軍', '武曲', '天府', '天相', '天梁', '天同', '太陰',
  '七殺', '七杀', '擎羊', '陀羅', '陀罗', '鈴星', '禄存', '祿存',
  '化祿', '化权', '化權', '化科', '化忌', '日主', '食神', '正官', '偏官',
  '比肩', '劫財', '傷官', '正印', '偏印', '納音', '大運', '流月', '流日',
  '子時', '丑時', '寅時', '卯時', '辰時', '巳時', '午時', '未時', '申時', '酉時', '戌時', '亥時'
].join('|');

export function chartTermRegex() {
  return new RegExp(CHART_TERM_SOURCE, 'g');
}

export function scanChartTerms(text) {
  const hits = String(text || '').match(chartTermRegex()) || [];
  return [...new Set(hits)];
}

export function stripChartTerms(text) {
  return String(text || '')
    .replace(chartTermRegex(), '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
