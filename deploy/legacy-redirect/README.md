# 舊網域退役用的導轉站

這個目錄只部署到 Cloudflare Pages 專案 `wen-xian-tan-morgan86399`，
用來讓兩個舊網址 301 回正式站：

- `wen-xian-tan-morgan86399.pages.dev`
- `wenxiantan.taoyuanyangxintuina.shop`

正式站是 `www.zenasker.com`（Pages 專案 `wen-xian-tan`，本專案根目錄的 `dist/`）。

部署指令：

```bash
npx wrangler pages deploy deploy/legacy-redirect --project-name wen-xian-tan-morgan86399
```

舊專案原本掛著同一個 D1 資料庫與整套 Functions（含尚未修補的付款回呼），
換成純靜態導轉站之後，那批舊 API 就不再對外開放。
