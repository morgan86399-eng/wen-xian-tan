# Zenasker · 咖啡時光（掌紋解碼）完整專案交接說明書

本專案已包含完整原始碼、各項靜態素材、前後端 Functions、單元測試、以及**所有正式環境與本機開發所需金鑰（`.dev.vars` 與 `.env`）**。

---

## 快速上手（本機啟動）

### 1. 環境需求
- **Node.js**: 建議 v18 或 v20 以上
- **npm**: 隨 Node.js 安裝

### 2. 啟動專案
因為本專案的後端 API（AI 推論、登入、金流）運行於 Cloudflare Pages Functions，建議直接使用 Wrangler 本機模擬器啟動：

```bash
# 若需重新安裝依賴
npm install

# 啟動本機開發伺服器（同時啟用前端與 Functions API，自動載入 .dev.vars 金鑰）
npx wrangler pages dev . --port 3000 --compatibility-flags="nodejs_compat"

# 或直接使用 npm script
npm run dev
```

啟動後瀏覽器打開：`http://localhost:3000` 即可進行完整測試與體驗！

---

## 包含金鑰與配置說明

本專案目錄下的 `.dev.vars` 與 `.env` 已經配置妥當，可直接使用：

| 設定檔 / 變數 | 說明與用途 |
| :--- | :--- |
| **`.dev.vars`** | Cloudflare Pages 本機與部署密鑰設定檔 |
| `GEMINI_API_KEY` | Google Gemini API 金鑰，負責掌紋視覺辨識分析與深層命理剖析 |
| `GROQ_API_KEY` / `_2` | Groq 高速推論引擎（Llama 3.3 70B Versatile），負責極速對話與算命流式推論 |
| `GOOGLE_CLIENT_ID` / `_SECRET` | Google OAuth 2.0 登入金鑰，供使用者以 Google 帳號一鍵登入 |
| `LINE_CHANNEL_ID` / `_SECRET` | LINE Login 登入金鑰，供台灣用戶直接以 LINE 帳號登入 |
| `RESEND_API_KEY` | Resend 電子郵件發送服務金鑰，負責寄送驗證碼信與付款成功通知 |
| `PORTALY_API_KEY` / `PORTALY_CALLBACK_SECRET` | 台灣在地金流服務（支援信用卡、LINE Pay、超商條碼繳費） |
| `PORTALY_PRODUCT_ID_*` | 購買方案商品編號（單次解鎖 199 / 三次特惠 499 / 全年無限制 999） |
| **`.env`** | 本機 Node 伺服器與相關環境常數 |

> **提示**：若上傳至 Cloudflare Pages 雲端正式環境，請在 Cloudflare 控制台的 **Settings > Environment Variables** 中將 `.dev.vars` 內的變數逐一設定即可。

---

## 專案架構概覽

```text
wen-xian-tan/
├── .dev.vars                # 【關鍵】完整服務金鑰設定檔
├── .env                     # 環境變數設定
├── index.html               # 核心首頁與互動應用介面
├── wrangler.toml            # Cloudflare Pages 部署配置
├── package.json             # 專案相依套件與指令腳本
├── src/
│   ├── js/
│   │   ├── app.js           # 核心業務邏輯、算命解盤、狀態管理
│   │   ├── data.js          # 命理知識庫、故事案例、運勢演算法
│   │   ├── payment-sdk.js   # 傳送門金流 SDK 與訂單狀態輪詢
│   │   ├── palm_capture.js  # 掌相拍照引導與圖像預處理
│   │   └── member.js        # 會員中心、點數錢包、祈福紀錄
│   └── css/
│       ├── style.css        # 主題視覺與版面佈局樣式
│       └── payment-modal.css# 方案選購獨立彈窗樣式
├── functions/               # Cloudflare Pages Serverless 後端 API
│   ├── api/
│   │   ├── fortune.js       # AI 算命解盤串流介面
│   │   ├── palm-reading.js  # 掌紋深度辨識 API
│   │   ├── auth/            # Google / LINE / Email 驗證 API
│   │   └── payment/         # Portaly 建立訂單與 Webhook 回呼
├── assets/                  # 專案視覺圖片、神祇圖像、故事配圖、音效
├── tests/                   # 自動化單元測試與功能驗證
└── dist/                    # 生產環境打包成品
```

---

## 線上正式環境資訊
- **正式站網址**：`https://www.zenasker.com`
- **架構**：Cloudflare Pages Edge 網路 + D1 Database + Serverless Functions
- **代碼庫維護**：支援 Git CI/CD 自動推播部署
