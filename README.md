# 問仙壇 (Wen Xian Tan)

> 誠心叩問，仙佛指引方向 —— 東方美學主題測算與掌紋解讀服務平台

「問仙壇」是一套融合傳統東方神壇文化美學（黑金底色、硃砂印章、飄渺焚香動畫、仿宣紙求問單）與現代互動體驗的線上測算與掌紋解讀網頁應用。

---

## 🌟 核心功能特色

1. **東方典雅視覺體驗**
   - **黑金神壇主視覺**：深色典雅背景搭配金紅色光暈與動態飄渺香煙 SVG 動畫。
   - **仿宣紙求問單**：紙張質地、暗紅雙線框與硃砂印章效果。
   - **雙主題適配**：原生支援 Light / Dark 深淺色模式切換。
   - **字體美學**：引入《馬善政毛筆體》與《思源宋體》精緻排版。

2. **七大主題測算 (Themes Selection)**
   - 感情（正緣樣貌、相遇年齡）
   - 工作（天賦職缺、升遷轉職）
   - 事業（老闆體質、商業巔峰）
   - 財運（財庫容量、聚財時機）
   - 家庭（置產買房、家宅安泰）
   - 小孩（得子時機、天賦啟蒙）
   - 手相（感情線、智慧線、命運線）
   - 支援即時多選，點擊卡片蓋上「已選」印章。

3. **求問單填寫 (Petition Form)**
   - 祈問對象（本人、伴侶、家人、子女、朋友、其他）
   - 性別與年齡
   - 想請仙佛幫忙的具體問題文字框
   - 可收合之生辰八字（出生日期與時辰）

4. **手相拍照與上傳 (Palmistry Upload)**
   - 支援拖曳上傳與手機相機即時拍照
   - 掌心照片即時預覽與一鍵移除功能
   - 智慧連動：上傳掌紋自動選中「手相」主題

5. **供養方案動態智慧試算 (Pricing & Tiering)**
   - **單項供養**（NT$ 199）：任選 1 項主題
   - **三項供養**（NT$ 499）：任選 3 項主題
   - **全項吃到飽**（NT$ 999 推薦）：7 項主題全開（點擊自動全選）
   - 根據使用者選取項目數量自動切換對應方案，超出時即時提醒。

6. **吸底動態結帳列與求問確認彈窗 (Sticky Summary & Modal)**
   - 吸底狀態列即時顯示所選方案、金額與主題項目。
   - 點擊「前往供養」彈出完整求問資訊摘要（包含上傳之掌紋照片預覽）。

---

## 📁 專案目錄結構

```text
wen-xian-tan/
├── index.html            # 現代模組化主頁面 (Module-based)
├── standalone.html       # 單檔零依賴版本 (可直接雙擊瀏覽器開啟)
├── package.json          # 專案依賴與腳本設定
├── src/
│   ├── css/
│   │   └── style.css     # Design Tokens, 排版, 動畫, 響應式樣式
│   └── js/
│       ├── data.js       # 主題、方案、案例設定資料
│       └── app.js        # 核心互動邏輯與狀態機
└── README.md             # 專案說明文件
```

---

## 🚀 快速開始

### 方法一：直接雙擊開啟（最簡單）
直接使用任何瀏覽器開啟 `standalone.html` 即可完整體驗所有功能。

### 方法二：使用 Node.js / Vite 開發伺服器
```bash
# 1. 進入專案目錄
cd /Users/weiyo/.gemini/antigravity/scratch/wen-xian-tan

# 2. 安裝依賴 (可選)
npm install

# 3. 啟動本機開發伺服器
npm run dev
```

### 方法三：使用 Python 快速架設靜態伺服器
```bash
cd /Users/weiyo/.gemini/antigravity/scratch/wen-xian-tan
python3 -m http.server 3000
```
瀏覽器訪問：`http://localhost:3000`

---

## 🛠️ 技術棧

- **HTML5 & CSS3**（CSS Custom Properties, Flexbox/CSS Grid, Backdrop Filter, SVG Animation）
- **JavaScript (ES6+)**（Custom State Machine, FileReader API, Event Delegation）
- **Web Fonts**（Noto Serif TC, Noto Sans TC, Ma Shan Zheng）
- **Responsive Web Design (RWD)**（完全相容手機、平板與桌面螢幕）
