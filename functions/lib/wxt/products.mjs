/* 商品目錄（伺服器決定價格與額度） */

import { isThemeId } from './http.mjs';

/* 各篇報告篇幅不同，配給的測算次數也不同；三種方案共用同一張表 */
export const CREDITS_BY_THEME = {
  love: 4,
  wealth: 4,
  career: 3,
  work: 3,
  family: 2,
  children: 2
};

export const PRODUCTS = {
  single: { id: 'single', label: '單項體驗方案', amount: 199, themeCount: 1 },
  triple: { id: 'triple', label: '三項超值方案', amount: 499, themeCount: 3 },
  all: { id: 'all', label: '六項全包圓滿方案', amount: 999, themeCount: 6 }
};

export const THEME_LABELS = {
  love: '感情篇',
  work: '工作篇',
  career: '事業篇',
  wealth: '財運篇',
  family: '家庭篇',
  children: '小孩篇'
};

export function creditsForTheme(themeId) {
  return CREDITS_BY_THEME[themeId] || 0;
}

export function getProduct(productId) {
  return PRODUCTS[String(productId || '')] || null;
}

export function normalizeThemeKeys(themeKeys) {
  const keys = Array.isArray(themeKeys) ? themeKeys : [];
  const unique = [...new Set(keys.map((k) => String(k || '').trim()).filter(isThemeId))];
  unique.sort();
  return unique;
}

export function validateOrderInput(productId, themeKeys) {
  const product = getProduct(productId);
  if (!product) return { ok: false, error: '無效的商品方案' };
  const themes = normalizeThemeKeys(themeKeys);
  if (themes.length !== product.themeCount) {
    return { ok: false, error: `需選擇 ${product.themeCount} 個篇章` };
  }
  return { ok: true, product, themes };
}
