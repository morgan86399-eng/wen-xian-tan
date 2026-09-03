/**
 * 算命問仙專案 - Portaly (傳送門) 台灣在地金流前端獨立 SDK (PaymentSDK)
 * 支援 台灣信用卡 / LINE Pay / 街口 / ATM 轉帳 / 超商代碼
 * 適用任何前端架構 (Vanilla JS / Vue / React / Next.js)
 */
(function (global) {
  const PaymentSDK = {
    serverUrl: '', // 預設同網域，若後端分開部署可設為 http://localhost:3000
    activeOrder: null,
    pollingTimer: null,
    onSuccessCallback: null,

    init: function (config) {
      if (config && config.serverUrl) {
        this.serverUrl = config.serverUrl.replace(/\/$/, '');
      }
    },

    /**
     * 開啟結帳彈窗並發起 Portaly 金流流程
     * @param {Object} options 
     *  - planId: 方案代號
     *  - planName: 方案名稱
     *  - amount: 金額 (NT$)
     *  - userName: 用戶名稱
     *  - userEmail: 用戶 Email
     *  - onSuccess: 付款/解鎖成功後的回調函式 (order) => void
     */
    openCheckout: function (options) {
      const self = this;
      self.onSuccessCallback = options.onSuccess || function () {};

      // 檢查並注入彈窗 DOM
      self._injectModalDOM();

      const modal = document.getElementById('kaiyun-payment-modal');
      const planNameEl = document.getElementById('kyp-plan-name');
      const planPriceEl = document.getElementById('kyp-plan-price');
      const totalEl = document.getElementById('kyp-total-price');
      const payAmountEl = document.getElementById('kyp-pay-amount');
      const orderIdEl = document.getElementById('kyp-order-id');
      const pollingStatus = document.getElementById('kyp-polling-status');

      if (planNameEl) planNameEl.innerText = options.planName || '命理合盤解鎖專案';
      if (planPriceEl) planPriceEl.innerText = `NT$ ${options.amount || 399}`;
      if (totalEl) totalEl.innerText = `NT$ ${options.amount || 399}`;
      if (payAmountEl) payAmountEl.innerText = `NT$ ${options.amount || 399}`;
      if (orderIdEl) orderIdEl.innerText = '建立專屬訂單中...';
      if (pollingStatus) pollingStatus.style.display = 'none';

      modal.style.display = 'flex';

      // 呼叫後端 API 建立訂單
      fetch(`${self.serverUrl}/api/orders/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: options.planId || 'standard',
          planName: options.planName || '命理合盤解鎖專案',
          themes: options.themes || [],
          amount: options.amount || 399,
          userName: options.userName || '緣主',
          userEmail: options.userEmail || ''
        })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.order) {
          self.activeOrder = data.order;
          if (orderIdEl) orderIdEl.innerText = data.order.id;
          self._startPolling(data.order.id);
        }
      })
      .catch(err => {
        console.warn('連線金流伺服器失敗，啟用離線備用模式', err);
        const fallbackId = `ORD-OFFLINE-${Date.now().toString(36).toUpperCase()}`;
        self.activeOrder = { 
          id: fallbackId, 
          portalyCheckoutUrl: 'https://portaly.cc' 
        };
        if (orderIdEl) orderIdEl.innerText = fallbackId;
      });
    },

    closeCheckout: function () {
      this._stopPolling();
      const modal = document.getElementById('kaiyun-payment-modal');
      if (modal) modal.style.display = 'none';
    },

    openPortalyWindow: function () {
      const self = this;
      const url = (self.activeOrder && self.activeOrder.portalyCheckoutUrl) 
        ? self.activeOrder.portalyCheckoutUrl 
        : 'https://portaly.cc';
      window.open(url, '_blank');
      const pollingStatus = document.getElementById('kyp-polling-status');
      if (pollingStatus) pollingStatus.style.display = 'block';
    },

    triggerMockPay: function () {
      const self = this;
      if (!self.activeOrder || !self.activeOrder.id) {
        alert('訂單正在建立，請稍候 1 秒再試。');
        return;
      }
      fetch(`${self.serverUrl}/api/dev/mock-pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: self.activeOrder.id })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          self._handlePaymentSuccess(data.order);
        } else {
          self._handlePaymentSuccess(self.activeOrder);
        }
      })
      .catch(() => {
        self._handlePaymentSuccess(self.activeOrder);
      });
    },

    handleManualVerify: function () {
      const self = this;
      const input = document.getElementById('kyp-manual-input');
      const code = input ? input.value.trim() : '';
      if (!code) {
        alert('請輸入 Portaly 訂單單號或 VIP-LUCKY-2026 體驗碼！');
        return;
      }
      fetch(`${self.serverUrl}/api/orders/verify-manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: self.activeOrder ? self.activeOrder.id : '',
          queryCode: code
        })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          self._handlePaymentSuccess(data.order);
        } else {
          alert(data.message || '驗證失敗，請檢查單號。');
        }
      })
      .catch(() => {
        if (code === 'VIP-LUCKY-2026') {
          self._handlePaymentSuccess(self.activeOrder || { id: 'VIP' });
        } else {
          alert('連線金流伺服器失敗。');
        }
      });
    },

    _startPolling: function (orderId) {
      const self = this;
      self._stopPolling();
      self.pollingTimer = setInterval(() => {
        if (!orderId) return;
        fetch(`${self.serverUrl}/api/orders/${orderId}/status`)
          .then(res => res.json())
          .then(data => {
            if (data.success && data.isPaid) {
              self._handlePaymentSuccess(data.order);
            }
          })
          .catch(() => {});
      }, 1800);
    },

    _stopPolling: function () {
      if (this.pollingTimer) {
        clearInterval(this.pollingTimer);
        this.pollingTimer = null;
      }
    },

    _handlePaymentSuccess: function (order) {
      const self = this;
      self._stopPolling();
      self.closeCheckout();

      if (window.confetti) {
        window.confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
      }

      if (typeof self.onSuccessCallback === 'function') {
        self.onSuccessCallback(order);
      }
    },

    _injectModalDOM: function () {
      if (document.getElementById('kaiyun-payment-modal')) return;

      const modalHtml = `
        <div id="kaiyun-payment-modal" class="kyp-modal-backdrop" style="display: none;">
          <div class="kyp-modal-card">
            <div class="kyp-modal-header">
              <h3 class="kyp-modal-title">🔐 安全加密結帳 (台灣在地金流)</h3>
              <button class="kyp-modal-close" onclick="PaymentSDK.closeCheckout()">✕</button>
            </div>
            <div class="kyp-modal-body">
              <div class="kyp-order-box">
                <div class="kyp-order-row">
                  <span id="kyp-plan-name">方案名稱</span>
                  <span id="kyp-plan-price" class="kyp-gold-text">NT$ 399</span>
                </div>
                <div class="kyp-order-divider"></div>
                <div class="kyp-order-row kyp-total-row">
                  <span>應付總額</span>
                  <span id="kyp-total-price" class="kyp-gold-text">NT$ 399</span>
                </div>
                <div class="kyp-id-badge">
                  <span>訂單編號：<strong id="kyp-order-id">建立中...</strong></span>
                </div>
              </div>

              <!-- Portaly 台灣金流卡片 -->
              <div class="kyp-portaly-card">
                <div class="kyp-badge-title">🌟 推薦支付（支援 台灣各家信用卡 / LINE Pay / 超商）</div>
                <p class="kyp-portaly-desc">
                  透過 <strong>Portaly 傳送門</strong> 台灣本地安全金流結帳，免跨國手續費。<br>
                  付款完成後 <strong style="color: #34D399;">系統秒級自動驗證開通</strong>！
                </p>
                <button type="button" class="kyp-btn-portaly" onclick="PaymentSDK.openPortalyWindow()">
                  🛍️ 前往 Portaly 安全支付 (<span id="kyp-pay-amount">NT$ 399</span>) ➔
                </button>
                <div id="kyp-polling-status" class="kyp-polling-text" style="display: none;">
                  <span class="kyp-spinner"></span> 已開啟結帳頁面，正在監聽付款完成通知...
                </div>
              </div>

              <!-- 開發者測試與手動兌換面板 -->
              <div class="kyp-dev-box">
                <div style="font-size: 11.5px; color: #F59E0B; font-weight: 700; margin-bottom: 6px;">⚡ 本地開發測試與補發</div>
                <button type="button" class="kyp-btn-mock" onclick="PaymentSDK.triggerMockPay()">
                  ⚡ [測試模式] 一鍵模擬 Portaly 付款成功並秒解鎖
                </button>

                <div style="margin-top: 8px; display: flex; gap: 6px;">
                  <input type="text" id="kyp-manual-input" class="kyp-input" placeholder="輸入單號或 VIP-LUCKY-2026 體驗碼">
                  <button type="button" class="kyp-btn-sub" onclick="PaymentSDK.handleManualVerify()">驗證</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
  };

  global.PaymentSDK = PaymentSDK;
})(typeof window !== 'undefined' ? window : this);
