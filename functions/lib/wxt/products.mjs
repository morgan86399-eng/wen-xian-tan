/* 商品目錄（伺服器決定價格與額度） */

import { isThemeId } from './http.mjs';

export const PRODUCTS = {
  single: { id: 'single', label: '單篇方案', amount: 199, themeCount: 1, creditsPerTheme: 3 },
  triple: { id: 'triple', label: '三篇方案', amount: 499, themeCount: 3, creditsPerTheme: 3 },
  six: { id: 'six', label: '六篇方案', amount: 999, themeCount: 6, creditsPerTheme: 3 }
};

export const THEME_LABELS = {
  love: '感情篇',
  work: '工作篇',
  career: '事業篇',
  wealth: '財運篇',
  family: '家庭篇',
  children: '小孩篇'
};

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
