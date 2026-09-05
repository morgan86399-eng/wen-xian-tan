# 問仙壇（Wen Xian Tan）專案開發規範與避坑指南

> **最後更新日期**：2026-09-06
> **適用範圍**：所有參與「問仙壇」前端、後端、樣式改版之 AI 助理與工程師。

---

## ⚠️ 【最高優先級 UI 避坑鐵則】Hero 卡片文字與中線防切規範

### 1. 致命問題成因（Pitfall Root Cause）
* 在 `.app-hero--editorial::before` 樣式中，卡片中央約 **48% 位置** 繪製了一條微光的**「垂直分割直線」**（`linear-gradient` 分割線）。
* 當左側文字區塊（`.hero-description` 或標題）過長、或者沒有強制換行時，文字最右端會直接橫跨並切到中央直線，造成極難看的視覺 Bug（文字被直線截斷/穿刺）。

### 2. 嚴格執行規範（Strict Rules）
1. **強制跳行（`<br>`）**：
   - Hero 區塊的副標題描述文字，在語義第一分句（如「感情節奏、」）後方，**必須加上 `<br class="hero-break-desktop">` 強制跳行**！
   - 第二分句（如「跳槽加薪時機與發財年份...」）必須完整折到第二行，絕對禁止任一行的字尾逼近或碰到中央直線！
2. **CSS 寬度與安全內距防禦（Defensive Width & Padding）**：
   - `.hero-description` 的 `max-width` **嚴格限制在 `28rem`（約 440px）以內**（嚴禁改回 `35rem` 或 `570px`）。
   - 必須保有 `padding-right: clamp(12px, 2.5vw, 32px)`，確保文字右邊界與 48% 中線永遠有足夠的呼吸緩衝空間。
   - 保留 `.hero-keep-together { white-space: nowrap; }` 在核心名詞（如「跳槽加薪時機」），防止生硬的單字截斷。
3. **改動後必驗證**：
   - 凡是有改動到首頁 Hero 區塊標題（`hero-main-title`）或描述（`hero-description`）時，必須在桌面寬度（1024px ~ 1440px）進行視覺檢核，確保文字末端與中央直線保持至少 **24px 以上** 安全距離。

---

## 🎨 品牌視覺資產規範
1. **頂部導覽列 Logo**：
   - 預設採用「純陽 1：乾元九陽天日（☰）」（`assets/logo_chunyang_sun.svg`）。
   - 其他純陽款式（七星劍、混元金葫）與仙道款式均完整備份於 `assets/` 目錄中，並可透過 `logo_preview.html` 進行即時切換。
2. **黑金神壇色調**：
   - 統一遵循黑金漸層（`--gold-gradient`）、深紫宵暗底（`#0C0A1C`）與純陽真火光暈（`#F59E0B`、`#DC2626`）。

---

## 🚀 部署與測試流程
1. **構建驗證**：任何改動必須通過 `npm run build`（Vite 打包與靜態資源拷貝）。
2. **單元與整合測試**：執行 `npm test`（必須 100% 通過 57 項後端與安全測試）。
3. **Cloudflare Pages 部署**：
   ```bash
   npx wrangler pages deploy dist --commit-dirty=true
   git push origin main
   ```
