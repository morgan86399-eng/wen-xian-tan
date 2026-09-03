/**
 * 問仙壇 · 綠界 ECPay 結帳（只建單，不模擬付款、不收體驗碼）
 */
(function (global) {
  function readJson(res) {
    return res.json().catch(() => ({}));
  }

  function isPaidOrder(data) {
    if (!data || typeof data !== 'object') return false;
    if (data.error) return false;
    const order = data.order || data;
    const status = String(order.status || data.status || '').toUpperCase();
    return status === 'PAID' || data.isPaid === true || order.isPaid === true;
  }

  function submitEcpayForm(action, fields) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = action;
    form.style.display = 'none';
    Object.entries(fields || {}).forEach(([key, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = value == null ? '' : String(value);
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  }

  const PaymentSDK = {
    serverUrl: '',
    activeOrder: null,
    pollingTimer: null,
    onSuccessCallback: null,

    init: function (config) {
      if (config && config.serverUrl) {
        this.serverUrl = String(config.serverUrl).replace(/\/$/, '');
      }
    },

    openCheckout: function (options) {
      const self = this;
      self.onSuccessCallback = options.onSuccess || function () {};
      self._injectModalDOM();

      const modal = document.getElementById('kaiyun-payment-modal');
      const planNameEl = document.getElementById('kyp-plan-name');
      const planPriceEl = document.getElementById('kyp-plan-price');
      const totalEl = document.getElementById('kyp-total-price');
      const orderIdEl = document.getElementById('kyp-order-id');
      const statusEl = document.getElementById('kyp-polling-status');
      const errorEl = document.getElementById('kyp-error');

      if (planNameEl) planNameEl.textContent = options.planName || '問仙壇方案';
      if (planPriceEl) planPriceEl.textContent = `NT$ ${options.displayPrice || ''}`;
      if (totalEl) totalEl.textContent = `NT$ ${options.displayPrice || ''}`;
      if (orderIdEl) orderIdEl.textContent = '建立訂單中...';
      if (statusEl) statusEl.style.display = 'none';
      if (errorEl) {
        errorEl.style.display = 'none';
        errorEl.textContent = '';
      }
      if (modal) modal.style.display = 'flex';

      fetch(`${self.serverUrl}/api/orders/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          productId: options.productId || options.planId,
          themeKeys: options.themeKeys || options.themes || []
        })
      })
        .then(async (res) => {
          const data = await readJson(res);
          if (res.status === 401 || data.error === 'UNAUTHENTICATED') {
            throw new Error('UNAUTHENTICATED');
          }
          if (!res.ok || data.ok === false) {
            throw new Error(data.error || data.message || '建單失敗');
          }
          return data;
        })
        .then((data) => {
          const order = data.order || data;
          const orderId = order.id || order.orderId || data.orderId || data.merchantTradeNo;
          self.activeOrder = { id: orderId, ...order };

          if (orderIdEl) orderIdEl.textContent = orderId || '已建立';

          const action = data.action || data.ecpayAction || order.action;
          const fields = data.fields || data.ecpayFields || order.fields;
          const checkoutUrl = data.url || data.checkoutUrl || order.checkoutUrl || order.url;

          if (action && fields) {
            submitEcpayForm(action, fields);
            return;
          }
          if (checkoutUrl) {
            window.location.assign(checkoutUrl);
            return;
          }
          if (orderId) {
            if (statusEl) statusEl.style.display = 'block';
            self._startPolling(orderId);
            return;
          }
          throw new Error('伺服器未回傳結帳資訊');
        })
        .catch((err) => {
          if (errorEl) {
            errorEl.style.display = 'block';
            errorEl.textContent = err && err.message === 'UNAUTHENTICATED'
              ? '請先登入再結帳'
              : ((err && err.message) || '目前無法建立訂單');
          }
          if (typeof options.onError === 'function') options.onError(err);
        });
    },

    closeCheckout: function () {
      this._stopPolling();
      const modal = document.getElementById('kaiyun-payment-modal');
      if (modal) modal.style.display = 'none';
    },

    _startPolling: function (orderId) {
      const self = this;
      self._stopPolling();
      self.pollingTimer = setInterval(() => {
        if (!orderId) return;
        fetch(`${self.serverUrl}/api/orders/${encodeURIComponent(orderId)}`, {
          credentials: 'include'
        })
          .then(async (res) => {
            if (res.status === 404) return null;
            const data = await readJson(res);
            if (!res.ok) return null;
            return data;
          })
          .then((data) => {
            if (isPaidOrder(data)) {
              self._handlePaymentSuccess(data.order || data);
            }
          })
          .catch(() => {});
      }, 2500);
    },

    _stopPolling: function () {
      if (this.pollingTimer) {
        clearInterval(this.pollingTimer);
        this.pollingTimer = null;
      }
    },

    _handlePaymentSuccess: function (order) {
      this._stopPolling();
      this.closeCheckout();
      if (typeof this.onSuccessCallback === 'function') {
        this.onSuccessCallback(order);
      }
    },

    _injectModalDOM: function () {
      if (document.getElementById('kaiyun-payment-modal')) return;
      const modal = document.createElement('div');
      modal.id = 'kaiyun-payment-modal';
      modal.className = 'kyp-modal-backdrop';
      modal.style.display = 'none';

      const card = document.createElement('div');
      card.className = 'kyp-modal-card';

      const header = document.createElement('div');
      header.className = 'kyp-modal-header';
      const title = document.createElement('h3');
      title.className = 'kyp-modal-title';
      title.textContent = '綠界安全結帳';
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'kyp-modal-close';
      closeBtn.textContent = '✕';
      closeBtn.addEventListener('click', () => PaymentSDK.closeCheckout());
      header.appendChild(title);
      header.appendChild(closeBtn);

      const body = document.createElement('div');
      body.className = 'kyp-modal-body';

      const nameRow = document.createElement('div');
      const nameLabel = document.createElement('span');
      nameLabel.id = 'kyp-plan-name';
      nameLabel.textContent = '方案名稱';
      const priceLabel = document.createElement('span');
      priceLabel.id = 'kyp-plan-price';
      priceLabel.className = 'kyp-gold-text';
      nameRow.appendChild(nameLabel);
      nameRow.appendChild(priceLabel);

      const totalRow = document.createElement('div');
      const totalText = document.createElement('span');
      totalText.textContent = '應付總額';
      const totalPrice = document.createElement('span');
      totalPrice.id = 'kyp-total-price';
      totalPrice.className = 'kyp-gold-text';
      totalRow.appendChild(totalText);
      totalRow.appendChild(totalPrice);

      const orderBadge = document.createElement('div');
      orderBadge.className = 'kyp-id-badge';
      const orderSpan = document.createElement('span');
      orderSpan.textContent = '訂單編號：';
      const orderStrong = document.createElement('strong');
      orderStrong.id = 'kyp-order-id';
      orderStrong.textContent = '建立中...';
      orderSpan.appendChild(orderStrong);
      orderBadge.appendChild(orderSpan);

      const hint = document.createElement('p');
      hint.className = 'kyp-checkout-desc';
      hint.textContent = '將導向綠界付款頁。付款完成後，點數由伺服器入帳，不會依網址參數加點。';

      const status = document.createElement('div');
      status.id = 'kyp-polling-status';
      status.className = 'kyp-polling-text';
      status.style.display = 'none';
      status.textContent = '已建立訂單，正在向伺服器確認付款狀態...';

      const error = document.createElement('div');
      error.id = 'kyp-error';
      error.style.display = 'none';
      error.style.color = '#F87171';
      error.style.fontSize = '0.85rem';

      body.appendChild(nameRow);
      body.appendChild(totalRow);
      body.appendChild(orderBadge);
      body.appendChild(hint);
      body.appendChild(status);
      body.appendChild(error);

      card.appendChild(header);
      card.appendChild(body);
      modal.appendChild(card);
      document.body.appendChild(modal);
    }
  };

  global.PaymentSDK = PaymentSDK;
})(typeof window !== 'undefined' ? window : this);
