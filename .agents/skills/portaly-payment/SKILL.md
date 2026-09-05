---
name: portaly-payment
version: 0.11.2
metadata:
  version: "0.11.2"
description: Help users integrate Portaly Payment hosted checkout, including merchant setup, subscription plans (monthly, yearly with 12-month deferred disbursement, one-time), checkout sessions, recurring renewal callbacks, and callback verification. Trigger when the user mentions Portaly Payment, creator subscription, or wants to add subscription-based checkout to their application.
---

# Portaly Payment Integration for 問仙壇 (zenasker.com)

本 Skill 提供問仙壇專案與 Portaly Payment 整合之完整規範與指南。

## 核心端點與架構

1. **Webhook 通知接收**：
   - URL: `https://www.zenasker.com/api/portaly/webhook`
   - 檔案位置：`functions/api/portaly/webhook.js`
   - 支援數位簽章：`x-portaly-signature`（HMAC-SHA256）、`x-portaly-timestamp`（5分鐘防重放容限）。
   - 自動處理入帳：自動查找對應訂單，原子更新 `orders` 狀態為 `PAID`，並在 `credits` 與 `credit_ledger` 核發各篇額度。

2. **結帳 Session 建立**：
   - URL: `POST /api/orders/create`
   - 檔案位置：`functions/api/orders/create.js`
   - 依據 `PAYMENT_PROVIDER` 環境變數切換 `portaly` 或 `ecpay`。
   - 支援帶入會員 Email、暱稱與 metadata 建立安全跳轉網址。

3. **簽名驗證與工具函式**：
   - 檔案位置：`functions/lib/wxt/portaly.mjs`
   - 包含符合 Portaly 官方規範之 `stableJson`（`localeCompare` 鍵值排序）與 WebCrypto 驗證演算法。
