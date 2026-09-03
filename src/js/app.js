import {
  THEMES,
  PLANS,
  GENDER_OPTIONS,
  AGE_OPTIONS,
  THEME_RELATION_CONFIG,
  THEME_ROLE_CONFIG,
  ROLE_OPTIONS,
  DESIRED_OUTCOMES,
  MANIFESTATION_STORIES
} from './data.js';
import { WalletManager } from './wallet.js';
import { MemberManager } from './member.js';
import { openCamera, openFilePicker, ensurePalmCaptureDom } from './palm_capture.js';
import { showLegalModal } from './legal.js';
import '../css/payment-modal.css';
import './payment-sdk.js';

/**
 * 問仙壇 · 掌心解碼 App - 核心應用邏輯與白話問卷引導引擎
 */
document.addEventListener('DOMContentLoaded', () => {
  // ============ Application State ============
  const state = {
    currentTab: 'hub',       // 'hub' | 'member' | 'stories' | 'history'
    selectedPlanId: 'triple',// 預設推薦三項方案
    customChosenThemes: new Set(['love', 'career', 'wealth']), // 預設所選之 3 項
    selectedStoriesCategory: 'all',

    // Multi-Step Guided Wizard State (7 步逐步問卷：性別 -> 年齡 -> 關係稱謂 -> 狀態現況 -> 問題 -> 期望 -> 掌相)
    wizard: {
      activeThemeId: null,
      currentStep: 1,
      totalSteps: 7,
      answers: {
        gender: 'female',
        genderCustom: '',
        age: '25-34',
        ageCustom: '',
        relation: 'self_love',
        relationCustom: '',
        role: 'single',
        roleCustom: '',
        question: '',
        goal: 'skip',
        goalCustom: '',
        palmDataUrl: null
      },
      isSubmitting: false,
      decodeToken: 0
    }
  };

  // ============ DOM Selectors ============
  const headerTabBtns = document.querySelectorAll('.app-tab-btn');
  const bottomTabBtns = document.querySelectorAll('.app-bottom-tab');
  const appViews = document.querySelectorAll('.app-view');
  const userTopBarBtn = document.getElementById('userTopBarBtn');
  const heroLiveCountEl = document.getElementById('heroLiveCount');

  // Hub Grid
  const themesMatrixGrid = document.getElementById('themesMatrixGrid');

  // Member Center & Wallet Breakdown
  const memberProfileContainer = document.getElementById('memberProfileContainer');
  const memberThemesQuotaGrid = document.getElementById('memberThemesQuotaGrid');

  // Pricing & Checkout inside Member View
  const pricingCardsGrid = document.getElementById('pricingCardsGrid');
  const pickerCheckboxesList = document.getElementById('pickerCheckboxesList');
  const themePickerCountEl = document.getElementById('themePickerCount');
  const checkoutSummaryPlan = document.getElementById('checkoutSummaryPlan');
  const checkoutSummaryPrice = document.getElementById('checkoutSummaryPrice');
  const checkoutSummarySelected = document.getElementById('checkoutSummarySelected');
  const confirmPurchaseBtn = document.getElementById('confirmPurchaseBtn');
  const celestialPurchaseTransition = document.getElementById('celestialPurchaseTransition');
  const celestialTransitionSkip = document.getElementById('celestialTransitionSkip');
  let celestialTransitionTimer = null;
  let finishCelestialTransition = null;

  // Reading / Wizard Modal
  const readingModalBackdrop = document.getElementById('readingModalBackdrop');
  const readingModalCard = document.getElementById('readingModalCard');
  const modalCloseFixedBtn = document.getElementById('modalCloseFixedBtn');
  modalCloseFixedBtn?.addEventListener('click', () => {
    state.wizard.decodeToken += 1; // 讓還沒跑完的解析報告 timeout 失效，不再覆蓋關閉後的彈窗內容
    readingModalBackdrop.classList.remove('show', 'active');
  });

  // Stories View
  const storiesFilterGroup = document.getElementById('storiesFilterGroup');
  const storiesGrid = document.getElementById('storiesGrid');

  // History Reports View
  const historyReportsGrid = document.getElementById('historyReportsGrid');

  // ============ 1. Live Online Simulation ============
  function updateLiveCount() {
    if (!heroLiveCountEl) return;
    const base = 85;
    const delta = Math.floor(Math.random() * 9) - 4;
    heroLiveCountEl.textContent = Math.max(68, base + delta);
  }
  setInterval(updateLiveCount, 4000);

  // ============ 1.5 Purchase Transition ============
  function startCelestialPurchaseTransition(onComplete) {
    if (!celestialPurchaseTransition) {
      onComplete();
      return;
    }

    const finishTransition = () => {
      if (!finishCelestialTransition) return;
      finishCelestialTransition = null;
      window.clearTimeout(celestialTransitionTimer);
      celestialPurchaseTransition.classList.remove('is-visible');
      celestialPurchaseTransition.classList.add('is-leaving');
      window.setTimeout(() => {
        celestialPurchaseTransition.classList.remove('is-leaving');
        celestialPurchaseTransition.setAttribute('aria-hidden', 'true');
        onComplete();
      }, 900);
    };

    celestialPurchaseTransition.classList.remove('is-leaving');
    celestialPurchaseTransition.classList.add('is-visible');
    celestialPurchaseTransition.setAttribute('aria-hidden', 'false');
    window.clearTimeout(celestialTransitionTimer);
    finishCelestialTransition = finishTransition;
    celestialTransitionTimer = window.setTimeout(finishTransition, 4100);
  }

  celestialTransitionSkip?.addEventListener('click', () => finishCelestialTransition?.());

  // ============ 2. App Tab Switching ============
  function switchTab(tabId) {
    state.currentTab = tabId;

    headerTabBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    bottomTabBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    appViews.forEach((view) => {
      view.classList.toggle('active', view.id === `view-${tabId}`);
    });

    if (tabId === 'auth') {
      renderAuthPage();
    } else if (tabId === 'member') {
      renderMemberCenter();
    } else if (tabId === 'history') {
      renderHistoryReports();
    } else if (tabId === 'stories') {
      renderStoriesFeed();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  headerTabBtns.forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  bottomTabBtns.forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.querySelectorAll('[data-goto-tab]').forEach((el) => {
    el.addEventListener('click', () => switchTab(el.dataset.gotoTab));
  });

  // ============ 3. Top Right Bar (Auth / Profile Button) ============
  function updateTopBarUserStatus() {
    if (!userTopBarBtn) return;
    const user = MemberManager.getCurrentUser();
    const wallet = WalletManager.getPoints();
    let totalPoints = 0;
    Object.values(wallet).forEach((pts) => { totalPoints += pts; });

    if (user) {
      userTopBarBtn.className = 'user-topbar-btn';
      userTopBarBtn.innerHTML = `
        <span class="user-avatar-circle">${user.avatar ? `<img src="${user.avatar}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : user.name.slice(0, 1)}</span>
        <span>${user.name} ｜ 🪙 剩餘：<strong style="color:#FFF;">${totalPoints}</strong> 次</span>
      `;
      userTopBarBtn.title = '點擊跳轉至使用者登入/註冊頁面 (可切換帳號)';
      userTopBarBtn.onclick = () => switchTab('auth');
    } else {
      userTopBarBtn.className = 'user-topbar-btn unlogged';
      userTopBarBtn.innerHTML = `
        <span class="user-avatar-circle" style="background:rgba(245, 158, 11, 0.25);color:var(--gold-bright);">👤</span>
        <span>登入 / 註冊</span>
      `;
      userTopBarBtn.title = '點擊跳轉至使用者登入/註冊頁面 (支援 LINE · Google)';
      userTopBarBtn.onclick = () => switchTab('auth');
    }
  }

  // ============ 4. LINE & Google 快速授權互動視窗 與 Email 6 碼驗證 ============
  let otpCooldownTimer = null;

  function openEmailVerifyDialog(email, purpose = 'login', userName = '') {
    state.wizard.decodeToken += 1;
    const cleanEmail = (email || '').trim().toLowerCase();

    readingModalCard.innerHTML = `
      <div class="otp-dialog-shell">
        <div class="otp-dialog-icon">✉️</div>
        <h3 class="otp-dialog-title">信士仙緣安全驗證</h3>
        <p class="otp-dialog-subtitle">
          仙壇已向信箱 <span class="otp-target-email-badge">${cleanEmail}</span> 發出 6 位數安全驗證碼
        </p>

        <div id="otpStatusLoading" style="padding: 16px 0; color: var(--gold-bright); font-size: 0.9rem;">
          <div style="width: 24px; height: 24px; margin: 0 auto 10px; border: 2px solid rgba(212,175,55,0.2); border-top-color: var(--gold-bright); border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
          正在通傳仙壇發送信件，請稍候...
        </div>

        <form id="otpVerifyForm" style="display:none;">
          <div class="otp-inputs-grid" id="otpInputsGrid">
            <input type="text" maxlength="1" inputmode="numeric" pattern="[0-9]*" class="otp-digit-field" data-index="0" autofocus>
            <input type="text" maxlength="1" inputmode="numeric" pattern="[0-9]*" class="otp-digit-field" data-index="1">
            <input type="text" maxlength="1" inputmode="numeric" pattern="[0-9]*" class="otp-digit-field" data-index="2">
            <input type="text" maxlength="1" inputmode="numeric" pattern="[0-9]*" class="otp-digit-field" data-index="3">
            <input type="text" maxlength="1" inputmode="numeric" pattern="[0-9]*" class="otp-digit-field" data-index="4">
            <input type="text" maxlength="1" inputmode="numeric" pattern="[0-9]*" class="otp-digit-field" data-index="5">
          </div>

          <div class="otp-resend-bar">
            <span>驗證碼效期：5分鐘</span>
            <div>
              <span id="otpCountdownBox">重發倒數：<strong class="otp-countdown-tag" id="otpTimerCount">60</strong> 秒</span>
              <button type="button" class="otp-btn-resend" id="otpResendBtn" style="display:none;">重新獲取驗證碼</button>
            </div>
          </div>

          <div id="otpErrorAlert" style="display:none; color: #EF4444; font-size: 0.85rem; margin-bottom: 12px;"></div>

          <div style="display:flex; gap:10px;">
            <button type="submit" class="btn btn-gold" id="otpSubmitBtn" style="flex:1;">
              ⚡ 立即驗證並登入仙壇
            </button>
            <button type="button" class="btn btn-outline" id="otpCancelBtn" style="width:84px;">
              取消
            </button>
          </div>

          <!-- 仙壇真言靈函 (即時信匣預覽，確保即使無外設 SMTP 亦能無阻礙完成驗證) -->
          <div class="celestial-letter-drawer" id="celestialLetterDrawer" style="display:none;">
            <div class="celestial-letter-header">
              <span>📜 仙壇靈函信匣：</span>
              <span id="letterSendStatus" style="font-size:0.75rem; color:#34D399;">已生成</span>
            </div>
            <div class="celestial-letter-body">
              <div>信士您好，您的 6 位數安全驗證碼為：</div>
              <div style="margin: 8px 0; display:flex; align-items:center;">
                <span class="celestial-letter-code-pill" id="letterCodePill">------</span>
                <button type="button" class="btn btn-gold btn-sm" id="letterAutofillBtn" style="padding: 3px 10px; font-size:0.75rem;">
                  一鍵帶入此碼
                </button>
              </div>
              <div style="font-size:0.72rem; color:var(--text-muted);">
                💡 此驗證信函已同步備份於本機安全信匣，若信件稍有延遲，可直接點擊帶入驗證。
              </div>
            </div>
          </div>
        </form>
      </div>
    `;

    readingModalBackdrop.classList.add('show');

    let currentToken = '';
    let currentCode = '';

    const startCountdown = () => {
      let timeLeft = 60;
      const countEl = document.getElementById('otpTimerCount');
      const boxEl = document.getElementById('otpCountdownBox');
      const resendBtn = document.getElementById('otpResendBtn');
      if (!countEl || !boxEl || !resendBtn) return;

      boxEl.style.display = 'inline';
      resendBtn.style.display = 'none';

      if (otpCooldownTimer) clearInterval(otpCooldownTimer);
      otpCooldownTimer = setInterval(() => {
        timeLeft -= 1;
        if (countEl) countEl.textContent = timeLeft;
        if (timeLeft <= 0) {
          clearInterval(otpCooldownTimer);
          boxEl.style.display = 'none';
          resendBtn.style.display = 'inline';
        }
      }, 1000);
    };

    const sendOtp = async () => {
      const loadingEl = document.getElementById('otpStatusLoading');
      const formEl = document.getElementById('otpVerifyForm');
      const errorEl = document.getElementById('otpErrorAlert');
      const drawerEl = document.getElementById('celestialLetterDrawer');
      const letterCodePill = document.getElementById('letterCodePill');
      const letterSendStatus = document.getElementById('letterSendStatus');

      if (loadingEl) loadingEl.style.display = 'block';
      if (formEl) formEl.style.display = 'none';

      const res = await MemberManager.requestEmailVerificationCode(cleanEmail, purpose);

      if (loadingEl) loadingEl.style.display = 'none';
      if (formEl) formEl.style.display = 'block';

      if (res.success) {
        currentToken = res.token;
        currentCode = res.preview?.code || '';

        if (drawerEl && currentCode) {
          drawerEl.style.display = 'block';
          if (letterCodePill) letterCodePill.textContent = currentCode;
          if (letterSendStatus) {
            letterSendStatus.textContent = res.emailSent ? '信件已送達信箱' : '靈函備妥';
          }
        }

        startCountdown();

        const firstInput = document.querySelector('.otp-digit-field[data-index="0"]');
        if (firstInput) setTimeout(() => firstInput.focus(), 50);
      } else {
        if (errorEl) {
          errorEl.textContent = res.message || '發送失敗，請稍後重試';
          errorEl.style.display = 'block';
        }
      }
    };

    sendOtp();

    const inputs = document.querySelectorAll('.otp-digit-field');
    inputs.forEach((input, idx) => {
      input.addEventListener('input', (e) => {
        const val = e.target.value.replace(/[^0-9]/g, '');
        e.target.value = val ? val.slice(-1) : '';
        e.target.classList.toggle('filled', Boolean(e.target.value));

        if (e.target.value && idx < inputs.length - 1) {
          inputs[idx + 1].focus();
        }
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && idx > 0) {
          inputs[idx - 1].focus();
        }
      });

      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
        if (text) {
          const digits = text.slice(0, 6).split('');
          digits.forEach((d, i) => {
            if (inputs[i]) {
              inputs[i].value = d;
              inputs[i].classList.add('filled');
            }
          });
          const nextIdx = Math.min(digits.length, 5);
          inputs[nextIdx].focus();
        }
      });
    });

    document.getElementById('letterAutofillBtn')?.addEventListener('click', () => {
      if (!currentCode) return;
      currentCode.split('').forEach((d, i) => {
        if (inputs[i]) {
          inputs[i].value = d;
          inputs[i].classList.add('filled');
        }
      });
      document.getElementById('otpSubmitBtn')?.focus();
    });

    document.getElementById('otpResendBtn')?.addEventListener('click', () => {
      sendOtp();
    });

    document.getElementById('otpCancelBtn')?.addEventListener('click', () => {
      if (otpCooldownTimer) clearInterval(otpCooldownTimer);
      readingModalBackdrop.classList.remove('show');
    });

    document.getElementById('otpVerifyForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const codeArr = Array.from(inputs).map(i => i.value);
      const fullCode = codeArr.join('');
      const errorEl = document.getElementById('otpErrorAlert');

      if (fullCode.length < 6) {
        inputs.forEach(i => {
          if (!i.value) {
            i.classList.add('error');
            setTimeout(() => i.classList.remove('error'), 400);
          }
        });
        if (errorEl) {
          errorEl.textContent = '請輸入完整 6 位數驗證碼';
          errorEl.style.display = 'block';
        }
        return;
      }

      const submitBtn = document.getElementById('otpSubmitBtn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ 正在驗證仙緣憑證...';
      }

      const verifyRes = await MemberManager.verifyEmailCode(cleanEmail, fullCode, currentToken, userName);

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '⚡ 立即驗證並登入仙壇';
      }

      if (verifyRes.success) {
        if (otpCooldownTimer) clearInterval(otpCooldownTimer);
        readingModalBackdrop.classList.remove('show');
        if (typeof window.confetti === 'function') {
          window.confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
        }
        updateTopBarUserStatus();
        switchTab('member');
      } else {
        inputs.forEach(i => {
          i.classList.add('error');
          setTimeout(() => i.classList.remove('error'), 400);
        });
        if (errorEl) {
          errorEl.textContent = verifyRes.message || '驗證碼錯誤，請重新確認';
          errorEl.style.display = 'block';
        }
      }
    });
  }

  // LINE Login v2.1 授權跳轉與彈窗
  async function openLineAuthDialog() {
    state.wizard.decodeToken += 1;
    let lineChannelId = '2006888888';
    try {
      const cfgRes = await fetch('/api/config');
      const cfg = await cfgRes.json();
      if (cfg && cfg.lineChannelId) lineChannelId = cfg.lineChannelId;
    } catch (e) {}

    const redirectUri = window.location.origin + window.location.pathname;
    const stateVal = 'line_csrf_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
    sessionStorage.setItem('line_oauth_state', stateVal);

    const lineAuthUrl = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${lineChannelId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${stateVal}&scope=profile%20openid%20email`;

    readingModalCard.innerHTML = `
      <div style="max-width:440px;margin:0 auto;text-align:center;">
        <div style="width:58px;height:58px;border-radius:16px;background:#06C755;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;box-shadow:0 8px 24px rgba(6,199,85,0.35);">
          <svg style="width:34px;height:34px;fill:#FFF;" viewBox="0 0 24 24"><path d="M24 10.304c0-5.369-5.383-9.738-12-9.738-6.616 0-12 4.369-12 9.738 0 4.814 4.269 8.846 10.019 9.577.39.084.922.258 1.057.592.121.303.079.777.039 1.085l-.171 1.027c-.053.303-.242 1.186 1.039.646 1.281-.54 6.911-4.069 9.428-6.967 1.739-1.907 2.589-3.838 2.589-5.962z"/></svg>
        </div>

        <h3 style="color:#FFF;font-size:1.35rem;margin-bottom:6px;font-family:'Noto Serif TC',serif;font-weight:800;">LINE 快速授權登入 / 註冊</h3>
        <p style="font-size:0.86rem;color:var(--text-muted);margin-bottom:18px;line-height:1.5;">
          點選下方按鈕將前往 LINE 官方授權中心，許可後自動綁定您的命盤與測算次數：
        </p>

        <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:14px;text-align:left;margin-bottom:18px;font-size:0.85rem;display:flex;flex-direction:column;gap:8px;">
          <div style="color:#34D399;display:flex;align-items:center;gap:6px;">
            <span>✓</span> <span>讀取 LINE 顯示名稱與個人頭像</span>
          </div>
          <div style="color:#34D399;display:flex;align-items:center;gap:6px;">
            <span>✓</span> <span>安全驗證用戶身分，永久保存測算紀錄</span>
          </div>
          <div style="color:var(--text-muted);font-size:0.75rem;margin-top:2px;">
            回調網址：<code>${redirectUri}</code>
          </div>
        </div>

        <div style="display:grid;gap:10px;">
          <a href="${lineAuthUrl}" class="btn btn-primary" style="background:#06C755;border-color:#06C755;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:8px;font-size:1rem;padding:12px 20px;">
            <svg style="width:20px;height:20px;fill:#FFF;" viewBox="0 0 24 24"><path d="M24 10.304c0-5.369-5.383-9.738-12-9.738-6.616 0-12 4.369-12 9.738 0 4.814 4.269 8.846 10.019 9.577.39.084.922.258 1.057.592.121.303.079.777.039 1.085l-.171 1.027c-.053.303-.242 1.186 1.039.646 1.281-.54 6.911-4.069 9.428-6.967 1.739-1.907 2.589-3.838 2.589-5.962z"/></svg>
            <span>前往 LINE 官方授權登入</span>
          </a>

          <button type="button" class="btn btn-outline btn-sm" id="lineLocalMockBtn" style="color:var(--gold-bright);border-color:rgba(212,175,55,0.4);">
            ⚡ 快捷測試授權 (免跳轉快速體驗)
          </button>

          <button type="button" class="btn btn-outline btn-sm" id="lineModalCancelBtn">
            取消
          </button>
        </div>
      </div>
    `;

    document.getElementById('lineModalCancelBtn')?.addEventListener('click', () => {
      readingModalBackdrop.classList.remove('show');
    });

    document.getElementById('lineLocalMockBtn')?.addEventListener('click', () => {
      MemberManager.loginWithLine({
        displayName: 'LINE 結緣信士',
        userId: 'U_demo_' + Date.now()
      });
      readingModalBackdrop.classList.remove('show');
      if (typeof window.confetti === 'function') {
        window.confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
      }
      updateTopBarUserStatus();
      switchTab('member');
    });

    readingModalBackdrop.classList.add('show');
  }

  // Google Identity Services (GSI) 授權與彈窗
  async function openGoogleAuthDialog() {
    state.wizard.decodeToken += 1;
    let googleClientId = '1029384756-wenxiantan.apps.googleusercontent.com';
    try {
      const cfgRes = await fetch('/api/config');
      const cfg = await cfgRes.json();
      if (cfg && cfg.googleClientId) googleClientId = cfg.googleClientId;
    } catch (e) {}

    readingModalCard.innerHTML = `
      <div style="max-width:440px;margin:0 auto;text-align:center;">
        <div style="width:58px;height:58px;border-radius:16px;background:#FFF;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;box-shadow:0 8px 24px rgba(255,255,255,0.25);">
          <svg style="width:32px;height:32px;" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/><path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/></svg>
        </div>

        <h3 style="color:#FFF;font-size:1.35rem;margin-bottom:6px;font-family:'Noto Serif TC',serif;font-weight:800;">Google 帳號快速登入 / 註冊</h3>
        <p style="font-size:0.86rem;color:var(--text-muted);margin-bottom:16px;line-height:1.5;">
          使用 Google 官方 Identity Services 快速驗證授權，安全綁定個人命盤：
        </p>

        <div class="google-gsi-container">
          <div id="googleModalGsiBtnSlot" class="google-gsi-btn-slot"></div>
        </div>

        <div style="border-top:1px dashed rgba(255,255,255,0.12);margin:16px 0 14px;padding-top:14px;">
          <button type="button" class="btn btn-outline btn-sm" id="googleQuickMockBtn" style="width:100%;margin-bottom:8px;color:var(--gold-bright);border-color:rgba(212,175,55,0.4);">
            ⚡ 快捷測試授權 (免跳轉快速體驗)
          </button>
          <button type="button" class="btn btn-outline btn-sm" id="googleModalCancelBtn" style="width:100%;">
            取消
          </button>
        </div>
      </div>
    `;

    readingModalBackdrop.classList.add('show');

    renderGoogleButton('googleModalGsiBtnSlot', googleClientId);

    document.getElementById('googleModalCancelBtn')?.addEventListener('click', () => {
      readingModalBackdrop.classList.remove('show');
    });

    document.getElementById('googleQuickMockBtn')?.addEventListener('click', () => {
      MemberManager.loginWithGoogle({
        name: 'Google 結緣信士',
        email: `google_${Date.now().toString(36)}@gmail.com`,
        sub: 'mock_sub_' + Date.now()
      });
      readingModalBackdrop.classList.remove('show');
      if (typeof window.confetti === 'function') {
        window.confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
      }
      updateTopBarUserStatus();
      switchTab('member');
    });
  }

  function renderGoogleButton(containerId, clientId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (window.google && window.google.accounts && window.google.accounts.id) {
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (res) => {
            const loginRes = MemberManager.loginWithGoogleCredential(res.credential);
            if (loginRes.success) {
              readingModalBackdrop.classList.remove('show');
              if (typeof window.confetti === 'function') {
                window.confetti({ particleCount: 50, spread: 60 });
              }
              updateTopBarUserStatus();
              switchTab('member');
            } else {
              alert(loginRes.message || 'Google 登入失敗');
            }
          }
        });
        window.google.accounts.id.renderButton(container, {
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          text: 'signin_with',
          locale: 'zh_TW',
          width: 280
        });
      } catch (err) {
        console.warn('Google GSI render error:', err);
      }
    } else {
      loadGoogleGsiScript(() => renderGoogleButton(containerId, clientId));
    }
  }

  function loadGoogleGsiScript(callback) {
    if (document.getElementById('google-gsi-client-script')) {
      if (callback) callback();
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-gsi-client-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => { if (callback) callback(); };
    document.head.appendChild(script);
  }

  // 登入彈窗相容接口 (任何調用直接導向 auth 頁面或彈窗)
  function openAuthModal() {
    switchTab('auth');
  }

  // ============ 5. Render User Auth Page (專屬登入/註冊頁面) ============
  function renderAuthPage(formMode = 'login') {
    const authPageContainer = document.getElementById('authPageContainer');
    if (!authPageContainer) return;

    const currentUser = MemberManager.getCurrentUser();
    const wallet = WalletManager.getPoints();
    let totalPoints = 0;
    Object.values(wallet).forEach((pts) => { totalPoints += pts; });

    authPageContainer.innerHTML = `
      <div class="auth-page-header">
        <h2>🔮 仙壇結緣 ｜ 信士登入 / 註冊</h2>
        <p>一鍵登入仙壇帳號，永久保存您的各篇掌紋解讀報告、正緣肖像與測算次數</p>
      </div>

      ${currentUser ? `
        <!-- 當前已登入狀態卡片 -->
        <div class="auth-current-user-card">
          <div class="auth-current-user-header">
            <div class="auth-current-user-info">
              <div class="auth-current-user-avatar">${currentUser.avatar ? `<img src="${currentUser.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : currentUser.name.slice(0, 1)}</div>
              <div>
                <div style="font-weight:800;font-size:1.05rem;color:#FFF;display:flex;align-items:center;gap:6px;">
                  <span>${currentUser.name}</span>
                  <span class="member-tier-badge" style="font-size:0.75rem;">✨ ${currentUser.tier || '結緣信士'}</span>
                </div>
                <div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px;">
                  ${currentUser.provider === 'line' ? '🟢 LINE 綁定帳號' : currentUser.provider === 'google' ? '🌐 Google 綁定帳號' : '✉️ 信箱帳號'} ｜ ${currentUser.email}
                </div>
              </div>
            </div>
            <div style="font-size:0.85rem;color:var(--gold-bright);font-weight:700;">
              剩餘 <strong>${totalPoints}</strong> 次測算
            </div>
          </div>

          <div style="display:flex;gap:10px;margin-top:4px;">
            <button type="button" class="btn btn-gold btn-sm" id="authGoToMemberBtn" style="flex:1;">
              👉 進入會員中心查看額度與購買方案
            </button>
            <button type="button" class="btn btn-outline btn-sm" id="authLogoutBtn">
              登出當前帳號
            </button>
          </div>
          <div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">
            💡 若需改用其他身分，可直接點選下方 LINE、Google 或輸入其他帳號登入，系統將自動為您切換。
          </div>
        </div>
      ` : ''}

      <!-- 第三方快速登入 (LINE & Google) -->
      <div class="social-auth-container">
        <button type="button" class="btn-social-auth btn-line-auth" id="lineAuthBtn">
          <svg class="social-auth-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M24 10.304c0-5.369-5.383-9.738-12-9.738-6.616 0-12 4.369-12 9.738 0 4.814 4.269 8.846 10.019 9.577.39.084.922.258 1.057.592.121.303.079.777.039 1.085l-.171 1.027c-.053.303-.242 1.186 1.039.646 1.281-.54 6.911-4.069 9.428-6.967 1.739-1.907 2.589-3.838 2.589-5.962z"/></svg>
          <span>使用 LINE 帳號快速登入 / 註冊</span>
        </button>

        <button type="button" class="btn-social-auth btn-google-auth" id="googleAuthBtn">
          <svg class="social-auth-icon" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/><path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/></svg>
          <span>使用 Google 帳號快速登入 / 註冊</span>
        </button>
      </div>

      <div class="auth-divider">
        <span>或使用 Email 認證信 / 密碼</span>
      </div>

      <!-- 傳統信箱密碼 Tab 表單 -->
      <div class="auth-tabs-row">
        <button type="button" class="auth-tab-btn ${formMode === 'login' ? 'active' : ''}" id="authPageTabLogin">信士登入</button>
        <button type="button" class="auth-tab-btn ${formMode === 'register' ? 'active' : ''}" id="authPageTabRegister">免費註冊</button>
      </div>

      <form id="authPageForm" style="display:grid;gap:14px;">
        ${formMode === 'register' ? `
          <div class="auth-form-group">
            <label class="auth-form-label">信士尊姓大名：</label>
            <input type="text" id="pageAuthNameInput" class="auth-form-input" placeholder="例如：王信士" required value="王信士">
          </div>
        ` : ''}

        <div class="auth-form-group">
          <label class="auth-form-label">電子信箱：</label>
          <input type="email" id="pageAuthEmailInput" class="auth-form-input" placeholder="name@example.com" required value="seeker@example.com">
        </div>

        <div class="auth-form-group">
          <label class="auth-form-label">密碼（選填，支援免密碼 Email 驗證）：</label>
          <input type="password" id="pageAuthPasswordInput" class="auth-form-input" placeholder="請輸入密碼（留空走 Email 驗證碼）" value="123456">
        </div>

        <div style="display:flex;gap:10px;">
          <button type="submit" class="btn btn-gold" style="flex:1;">
            ${formMode === 'login' ? '登入仙壇 (發送 Email 驗證碼)' : '發送 Email 驗證碼註冊'}
          </button>
        </div>
      </form>

      <!-- 一鍵示範體驗 -->
      <div class="auth-demo-box">
        <button type="button" class="btn btn-outline btn-sm" id="pageDemoLoginBtn" style="width:100%;">
          ⚡ 一鍵免密碼體驗登入 (信士示範帳號)
        </button>
      </div>

      <div class="auth-guarantee-badge">
        <span>🔒</span>
        <span>仙壇嚴格保障每位信士隱私，掌紋及個資不作商業轉售</span>
      </div>
    `;

    // 事件綁定
    document.getElementById('lineAuthBtn')?.addEventListener('click', openLineAuthDialog);
    document.getElementById('googleAuthBtn')?.addEventListener('click', openGoogleAuthDialog);

    document.getElementById('authPageTabLogin')?.addEventListener('click', () => renderAuthPage('login'));
    document.getElementById('authPageTabRegister')?.addEventListener('click', () => renderAuthPage('register'));

    document.getElementById('authGoToMemberBtn')?.addEventListener('click', () => switchTab('member'));
    document.getElementById('authLogoutBtn')?.addEventListener('click', () => {
      MemberManager.logout();
      updateTopBarUserStatus();
      renderAuthPage();
    });

    document.getElementById('pageDemoLoginBtn')?.addEventListener('click', () => {
      MemberManager.loginDemo();
      updateTopBarUserStatus();
      if (typeof window.confetti === 'function') {
        window.confetti({ particleCount: 40, spread: 50 });
      }
      switchTab('member');
    });

    document.getElementById('authPageForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('pageAuthEmailInput').value.trim();
      const pwd = document.getElementById('pageAuthPasswordInput')?.value || '';

      // 檢查是否為測試帳號
      if ((email.toLowerCase() === 'user' || email.toLowerCase() === 'user@example.com') && pwd === 'user123') {
        MemberManager.login(email, pwd);
        WalletManager.ensureTestPoints && WalletManager.ensureTestPoints();
        updateTopBarUserStatus();
        switchTab('member');
        return;
      }

      const name = document.getElementById('pageAuthNameInput')?.value.trim() || '';
      // 發起 Email 6 碼驗證彈窗流程
      openEmailVerifyDialog(email, formMode, name);
    });
  }

  // ============ 6. Render Member Dashboard & Wallet Center (白話化) ============
  function renderMemberCenter() {
    const user = MemberManager.getCurrentUser();
    const wallet = WalletManager.getPoints();
    let totalPoints = 0;
    Object.values(wallet).forEach((pts) => { totalPoints += pts; });

    // 1. Render Profile Card
    if (memberProfileContainer) {
      if (!user) {
        memberProfileContainer.innerHTML = `
          <div class="member-profile-card" style="text-align:center;padding:28px 20px;">
            <div style="font-size:2.2rem;margin-bottom:8px;">👤</div>
            <h3 style="color:var(--gold-bright);margin-bottom:8px;">您尚未登入仙壇帳號</h3>
            <p style="font-size:0.88rem;color:var(--text-muted);margin-bottom:18px;max-width:480px;margin-left:auto;margin-right:auto;">
              登入仙壇帳號後，系統將為您永久保存六大主題的測算次數、正緣模擬肖像與掌紋解讀報告。
            </p>
            <button type="button" class="btn btn-primary" id="memberGoAuthBtn">
              👉 前往使用者登入 / 免費註冊 (支援 LINE · Google)
            </button>
          </div>
        `;
        document.getElementById('memberGoAuthBtn')?.addEventListener('click', () => switchTab('auth'));
      } else {
        memberProfileContainer.innerHTML = `
          <div class="member-profile-card">
            <div class="member-avatar-block">
              <div class="member-large-avatar">${user.avatar ? `<img src="${user.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : user.name.slice(0, 1)}</div>
              <div class="member-info-col">
                <h3>
                  <span>${user.name}</span>
                  <span class="member-tier-badge">✨ ${user.tier || '有緣信士'}</span>
                </h3>
                <div class="member-email-text">${user.email} ｜ 加入日期：${user.joinedAt || '2026-08-31'}</div>
              </div>
            </div>

            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
              <div class="member-points-summary-box">
                <span style="font-size:0.85rem;color:var(--text-muted);">總剩餘測算次數</span>
                <span class="member-total-points-num">${totalPoints}</span>
                <span style="font-size:0.85rem;color:var(--gold-bright);">次</span>
              </div>

              <button type="button" class="btn btn-gold btn-sm" id="memberGoToAuthPageBtn" title="前往登入/註冊頁切換帳號">
                👤 登入 / 註冊頁
              </button>
              <button type="button" class="btn btn-outline btn-sm" id="memberLogoutBtn" title="登出當前帳號">
                登出
              </button>
            </div>
          </div>
        `;

        document.getElementById('memberGoToAuthPageBtn')?.addEventListener('click', () => {
          switchTab('auth');
        });

        document.getElementById('memberLogoutBtn')?.addEventListener('click', () => {
          MemberManager.logout();
          updateTopBarUserStatus();
          renderMemberCenter();
        });
      }
    }


    // 2. Render Independent Per-Theme Quota Matrix (白話清楚)
    if (memberThemesQuotaGrid) {
      memberThemesQuotaGrid.innerHTML = '';

      THEMES.forEach((theme) => {
        const quota = wallet[theme.id] || 0;
        const card = document.createElement('div');
        card.className = 'theme-quota-card';
        card.innerHTML = `
          <div class="theme-quota-card-header">
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="width:28px;height:28px;border-radius:6px;background:rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;color:${theme.color};">
                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;">${theme.icon}</svg>
              </div>
              <strong style="font-size:1rem;color:#FFF;">${theme.name}</strong>
            </div>
            <div class="theme-quota-card-balance ${quota === 0 ? 'zero' : ''}">
              ${quota > 0 ? `✨ 剩餘 ${quota} 次` : `🔒 尚無次數`}
            </div>
          </div>

          <div style="font-size:0.78rem;color:var(--text-gold);">${theme.title}</div>
          <div style="font-size:0.8rem;color:var(--text-muted);">${theme.desc}</div>

          <div style="display:flex;gap:8px;margin-top:6px;">
            ${quota > 0 ? `
              <button type="button" class="btn btn-primary btn-sm" style="width:100%;" data-action="quick-read" data-theme-id="${theme.id}">
                ⚡ 開始測算 (剩 ${quota} 次)
              </button>
            ` : `
              <button type="button" class="btn btn-outline btn-sm" style="width:100%;" data-action="quick-recharge" data-theme-id="${theme.id}">
                🛒 購買開通此項目
              </button>
            `}
          </div>
        `;

        const quickReadBtn = card.querySelector('[data-action="quick-read"]');
        if (quickReadBtn) {
          quickReadBtn.addEventListener('click', () => {
            startGuidedWizard(theme.id);
          });
        }

        const quickRechargeBtn = card.querySelector('[data-action="quick-recharge"]');
        if (quickRechargeBtn) {
          quickRechargeBtn.addEventListener('click', () => {
            startCelestialPurchaseTransition(() => {
              state.customChosenThemes.clear();
              state.customChosenThemes.add(theme.id);
              state.selectedPlanId = 'single';
              renderPricingPlans();
              renderThemePicker();
              document.getElementById('pricingSectionAnchor')?.scrollIntoView({ behavior: 'smooth' });
            });
          });
        }

        memberThemesQuotaGrid.appendChild(card);
      });
    }

    renderPricingPlans();
    renderThemePicker();
    updateTopBarUserStatus();
  }

  // ============ 6. Render Themes Hub Grid ============
  function renderThemesHub() {
    if (!themesMatrixGrid) return;
    themesMatrixGrid.innerHTML = '';

    const wallet = WalletManager.getPoints();

    THEMES.forEach((theme) => {
      const quota = wallet[theme.id] || 0;

      const card = document.createElement('div');
      card.className = 'theme-hub-card';
      card.dataset.id = theme.id;
      card.dataset.theme = theme.id;

      card.innerHTML = `
        <div class="theme-card-art" aria-hidden="true"></div>
        <div class="theme-card-top">
          <div class="theme-icon-box" style="color:${theme.color};">
            <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${theme.icon}</svg>
          </div>
          <div class="theme-quota-pill ${quota > 0 ? 'has-points' : 'zero-points'}">
            <span>${quota > 0 ? '✨ 剩餘 ' + quota + ' 次' : '🔒 點擊開通'}</span>
          </div>
        </div>
        
        <div>
          <span class="theme-tag">${theme.title}</span>
          <h3>${theme.name}</h3>
        </div>
        
        <p>${theme.desc}</p>
        
        <div class="theme-card-actions">
          <button type="button" class="btn ${quota > 0 ? 'btn-primary' : 'btn-outline'} btn-sm" style="width:100%;" data-action="start-reading" data-theme-id="${theme.id}">
            ${quota > 0 ? '⚡ 開始測算 (扣 1 次)' : '🛒 購買開通此項目'}
          </button>
        </div>
      `;

      card.querySelector('[data-action="start-reading"]').addEventListener('click', (e) => {
        e.stopPropagation();
        handleThemeClick(theme.id);
      });

      card.addEventListener('click', () => {
        handleThemeClick(theme.id);
      });

      themesMatrixGrid.appendChild(card);
    });

    updateTopBarUserStatus();
  }

  function handleThemeClick(themeId) {
    const quota = WalletManager.getThemePoints(themeId);
    if (quota > 0) {
      startGuidedWizard(themeId);
    } else {
      startCelestialPurchaseTransition(() => {
        state.customChosenThemes.clear();
        state.customChosenThemes.add(themeId);
        state.selectedPlanId = 'single';
        switchTab('member');
        setTimeout(() => {
          document.getElementById('pricingSectionAnchor')?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      });
    }
  }

  // ============ 7. Render Pricing Plans ($199 / $499 / $999) ============
  function renderPricingPlans() {
    if (!pricingCardsGrid) return;
    pricingCardsGrid.innerHTML = '';

    PLANS.forEach((plan) => {
      const card = document.createElement('div');
      card.className = `plan-card ${state.selectedPlanId === plan.id ? 'active' : ''}`;
      card.dataset.id = plan.id;

      card.innerHTML = `
        ${plan.ribbon ? `<div class="plan-ribbon">${plan.ribbon}</div>` : ''}
        <div class="plan-title">${plan.label}</div>
        
        <div class="plan-price-row">
          <div class="plan-price"><sup>NT$</sup>${plan.price}</div>
          <div class="plan-old-price">原價 $${plan.oldPrice}</div>
        </div>
        
        <div class="plan-desc-note">${plan.desc}</div>
        
        <ul class="plan-bullets">
          ${plan.bullets.map((b) => `<li>${b}</li>`).join('')}
        </ul>
        
        <button type="button" class="btn ${state.selectedPlanId === plan.id ? 'btn-gold' : 'btn-outline'}" style="width:100%;margin-top:10px;">
          ${state.selectedPlanId === plan.id ? '✓ 當前選擇此方案' : '選擇此方案'}
        </button>
      `;

      card.addEventListener('click', () => {
        state.selectedPlanId = plan.id;
        if (plan.id === 'all') {
          THEMES.forEach((t) => state.customChosenThemes.add(t.id));
        } else if (plan.id === 'single') {
          if (state.customChosenThemes.size !== 1) {
            const first = Array.from(state.customChosenThemes)[0] || 'love';
            state.customChosenThemes = new Set([first]);
          }
        } else if (plan.id === 'triple') {
          if (state.customChosenThemes.size !== 3) {
            state.customChosenThemes = new Set(['love', 'career', 'wealth']);
          }
        }
        renderPricingPlans();
        renderThemePicker();
      });

      pricingCardsGrid.appendChild(card);
    });

    updateCheckoutSummary();
  }

  // ============ 8. Theme Picker for Custom Plan Selection ============
  function renderThemePicker() {
    if (!pickerCheckboxesList) return;
    pickerCheckboxesList.innerHTML = '';

    THEMES.forEach((theme) => {
      const isChecked = state.customChosenThemes.has(theme.id);
      const pill = document.createElement('div');
      pill.className = `theme-check-pill ${isChecked ? 'checked' : ''}`;
      pill.innerHTML = `
        <span>${isChecked ? '☑' : '☐'}</span>
        <span>${theme.name}</span>
      `;

      pill.addEventListener('click', () => {
        if (state.selectedPlanId === 'all') return;

        if (state.selectedPlanId === 'single') {
          state.customChosenThemes.clear();
          state.customChosenThemes.add(theme.id);
        } else if (state.selectedPlanId === 'triple') {
          if (state.customChosenThemes.has(theme.id)) {
            if (state.customChosenThemes.size > 1) {
              state.customChosenThemes.delete(theme.id);
            }
          } else {
            if (state.customChosenThemes.size < 3) {
              state.customChosenThemes.add(theme.id);
            } else {
              const arr = Array.from(state.customChosenThemes);
              arr.shift();
              arr.push(theme.id);
              state.customChosenThemes = new Set(arr);
            }
          }
        }

        renderThemePicker();
        updateCheckoutSummary();
      });

      pickerCheckboxesList.appendChild(pill);
    });

    updateCheckoutSummary();
  }

  function updateCheckoutSummary() {
    const plan = PLANS.find((p) => p.id === state.selectedPlanId);
    if (!plan) return;

    if (checkoutSummaryPlan) checkoutSummaryPlan.textContent = plan.label;
    if (checkoutSummaryPrice) checkoutSummaryPrice.textContent = `NT$ ${plan.price}`;

    const names = Array.from(state.customChosenThemes).map((id) => {
      const found = THEMES.find((t) => t.id === id);
      return found ? found.name : id;
    });

    if (checkoutSummarySelected) {
      checkoutSummarySelected.textContent = names.length
        ? `所選項目（各獲 3 次測算機會）：${names.join('、')}`
        : '尚未選定欲購買的主題';
    }

    const isValid = state.customChosenThemes.size === plan.requiredCount;
    if (confirmPurchaseBtn) {
      confirmPurchaseBtn.disabled = !isValid;
      confirmPurchaseBtn.textContent = isValid
        ? `前往安全支付 (Portaly) NT$ ${plan.price} →`
        : `請先選滿 ${plan.requiredCount} 個主題（目前已選 ${state.customChosenThemes.size} 項）`;
    }

    if (themePickerCountEl) {
      themePickerCountEl.textContent = `（已選 ${state.customChosenThemes.size} 項／需要 ${plan.requiredCount} 項）`;
    }
  }

  // ============ 9. Portaly (傳送門) 台灣在地金流發起與確認 ============
  if (typeof window !== 'undefined' && window.PaymentSDK) {
    window.PaymentSDK.init({ serverUrl: '' });
  }

  function triggerPortalyCheckout(plan, chosenThemes, onCustomSuccess) {
    const themeTitles = chosenThemes
      .map((id) => THEMES.find((t) => t.id === id)?.name || id)
      .join('、');

    if (!window.PaymentSDK) {
      alert('金流模組載入中，請稍候重試');
      return;
    }

    PaymentSDK.openCheckout({
      planId: plan.id,
      planName: `問仙壇 · ${plan.label} (${themeTitles})`,
      amount: plan.price,
      userName: '求問信眾',
      themes: chosenThemes,
      onSuccess: (order) => {
        console.log('[Portaly 付款/驗證成功]', order);

        // 1. 存入所選篇章的測算點數 (每篇各存入 pointsReward 次)
        WalletManager.addPointsToThemes(chosenThemes, plan.pointsReward || 3);

        // 2. 記錄訂單
        WalletManager.recordOrder({
          tradeNo: order.id,
          planId: plan.id,
          themes: chosenThemes,
          amount: plan.price,
          status: 'paid',
          paymentMethod: order.paymentMethod || 'Portaly 台灣在地金流'
        });

        // 3. 畫面即時重新渲染
        renderThemesHub();
        renderMemberCenter();

        // 4. 自訂回調或顯示成功彈窗
        if (typeof onCustomSuccess === 'function') {
          onCustomSuccess(order);
        } else {
          showPortalySuccessModal(plan, chosenThemes, order);
        }
      }
    });
  }

  function showPortalySuccessModal(plan, chosenThemes, order) {
    const backdrop = document.getElementById('readingModalBackdrop');
    const card = document.getElementById('readingModalCard');
    if (!backdrop || !card) return;

    const themeTitles = chosenThemes
      .map((id) => THEMES.find((t) => t.id === id)?.name || id)
      .join('、');

    card.innerHTML = `
      <div class="wizard-header" style="border-bottom:1px solid var(--border-gold);padding-bottom:14px;margin-bottom:16px;">
        <div class="wizard-title-row">
          <h3 style="display:flex;align-items:center;gap:8px;color:#34D399;font-size:1.25rem;">
            <span>🎉</span> 結緣供養成功！
          </h3>
          <button type="button" class="btn btn-outline btn-sm" id="closePortalySuccessBtn" style="padding:4px 10px;">✕ 關閉</button>
        </div>
      </div>

      <div style="text-align:center;padding:10px 0 20px;">
        <div style="font-size:3.2rem;margin-bottom:10px;">🧧</div>
        <h4 style="color:var(--gold-bright);font-size:1.25rem;margin-bottom:8px;">誠心叩問，福澤圓滿</h4>
        <p style="color:var(--text-secondary);font-size:0.92rem;line-height:1.6;max-width:440px;margin:0 auto 16px;">
          感謝您的結緣支持！系統已成功開通 <strong>${themeTitles}</strong>，所選篇章各自存入 <strong>${plan.pointsReward || 3} 次</strong> 深度命理與掌紋解析次數！
        </p>
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:var(--radius-sm);padding:10px 16px;font-size:0.8rem;color:var(--text-muted);display:inline-block;">
          訂單單號：<span style="color:#FFFFFF;font-family:monospace;">${order.id || '已完成'}</span> ｜ 付款方式：<span style="color:#10B981;">${order.paymentMethod || 'Portaly 台灣金流'}</span>
        </div>
        <div style="margin-top:24px;display:flex;gap:12px;justify-content:center;">
          <button type="button" class="btn btn-gold btn-lg" id="startReadingNowPortalyBtn" style="box-shadow:0 0 20px rgba(212,168,83,0.4);">🔮 立即前往測算</button>
        </div>
      </div>
    `;

    const closeSuccess = () => {
      backdrop.classList.remove('show', 'active');
    };

    card.querySelector('#closePortalySuccessBtn')?.addEventListener('click', closeSuccess);
    card.querySelector('#startReadingNowPortalyBtn')?.addEventListener('click', () => {
      closeSuccess();
      switchTab('hub');
    });

    backdrop.classList.add('show', 'active');
  }

  if (confirmPurchaseBtn) {
    confirmPurchaseBtn.addEventListener('click', () => {
      const agreeCheckbox = document.getElementById('agreeTermsCheckbox');
      if (agreeCheckbox && !agreeCheckbox.checked) {
        alert('請先閱讀並勾選同意《服務條款》與《隱私權政策》');
        agreeCheckbox.focus();
        return;
      }

      const plan = PLANS.find((p) => p.id === state.selectedPlanId);
      if (!plan) return;

      const chosenArray = Array.from(state.customChosenThemes);
      if (chosenArray.length !== plan.requiredCount) {
        alert(`請先選滿 ${plan.requiredCount} 個主題（目前已選 ${chosenArray.length} 項）\n請在上方勾選您要開通的主題項目`);
        document.getElementById('themePickerContainer')?.scrollIntoView({ behavior: 'smooth' });
        return;
      }

      triggerPortalyCheckout(plan, chosenArray);
    });
  }

  // ============ 10. Intelligent Story Matcher Engine ============
  function matchStoriesForReport(themeId, userQuestion = '') {
    const qLower = (userQuestion || '').toLowerCase();

    const scored = MANIFESTATION_STORIES.map((story) => {
      let score = 0;

      if (story.themeId === themeId) score += 50;

      if (qLower && story.keywords) {
        story.keywords.forEach((kw) => {
          if (qLower.includes(kw.toLowerCase())) score += 25;
        });
      }

      if (themeId === 'work' && story.themeId === 'career') score += 15;
      if (themeId === 'career' && story.themeId === 'work') score += 15;
      if (themeId === 'family' && story.themeId === 'children') score += 15;
      if (themeId === 'children' && story.themeId === 'family') score += 15;

      return { story, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 2).map((item) => item.story);
  }

  // ============ 11. 7-Step Multi-Page Wizard Engine (自適應 7 步問卷引導) ============
  function renderOptionCards(options, selectedValue, customValue = '', customFieldName = '') {
    return options.map((opt) => {
      const isSelected = selectedValue === opt.id;
      if (opt.isCustom) {
        return `
          <div class="wizard-option-card has-custom-input ${isSelected ? 'selected' : ''}" data-value="${opt.id}" data-is-custom="true" data-custom-field="${customFieldName}">
            <div class="wizard-option-card-top-row">
              <div class="wizard-option-card-left">
                <span class="wizard-option-icon">${opt.icon}</span>
                <div>
                  <div class="wizard-option-text">${opt.label}</div>
                  <div class="wizard-option-desc">${opt.desc}</div>
                </div>
              </div>
              <div class="wizard-option-check">✓</div>
            </div>
            <div class="wizard-custom-input-box">
              <input type="text" class="wizard-custom-text-input" placeholder="${opt.placeholder || '請在此輸入自訂內容...'}" value="${customValue || ''}" data-custom-input-for="${customFieldName}">
            </div>
          </div>
        `;
      }
      return `
        <div class="wizard-option-card ${isSelected ? 'selected' : ''}" data-value="${opt.id}">
          <div class="wizard-option-card-left">
            <span class="wizard-option-icon">${opt.icon}</span>
            <div>
              <div class="wizard-option-text">${opt.label}</div>
              <div class="wizard-option-desc">${opt.desc}</div>
            </div>
          </div>
          <div class="wizard-option-check">✓</div>
        </div>
      `;
    }).join('');
  }

  function startGuidedWizard(themeId) {
    const relConf = THEME_RELATION_CONFIG[themeId] || THEME_RELATION_CONFIG.love;
    const roleConf = THEME_ROLE_CONFIG[themeId] || THEME_ROLE_CONFIG.love;

    state.wizard.activeThemeId = themeId;
    state.wizard.currentStep = 1;
    state.wizard.totalSteps = 7;
    state.wizard.answers = {
      gender: 'female',
      genderCustom: '',
      age: '25-34',
      ageCustom: '',
      relation: relConf.defaultRelation || relConf.options[0]?.id || 'self_love',
      relationCustom: '',
      role: roleConf.defaultRole || roleConf.options[0]?.id || 'single',
      roleCustom: '',
      question: '',
      goal: 'skip',
      goalCustom: '',
      palmDataUrl: null
    };

    renderWizardStep();
    readingModalBackdrop.classList.add('show');
  }

  function renderWizardStep() {
    const { activeThemeId, currentStep, totalSteps, answers } = state.wizard;
    const theme = THEMES.find((t) => t.id === activeThemeId);
    const quota = WalletManager.getThemePoints(activeThemeId);
    const progressPercent = Math.round((currentStep / totalSteps) * 100);

    let stepContentHtml = '';

    // Step 1: 性別 (Gender)
    if (currentStep === 1) {
      stepContentHtml = `
        <div class="wizard-step-body">
          <div>
            <div class="wizard-question-title">1. 請選擇您的性別</div>
            <div class="wizard-question-sub">男女手相看法不同，選定後能更精準分析您的手相與命格</div>
          </div>
          <div class="wizard-options-grid">
            ${renderOptionCards(GENDER_OPTIONS, answers.gender, answers.genderCustom, 'genderCustom')}
          </div>
        </div>
      `;
    }

    // Step 2: 年齡階段 (Age)
    else if (currentStep === 2) {
      stepContentHtml = `
        <div class="wizard-step-body">
          <div>
            <div class="wizard-question-title">2. 請選擇您的年齡階段</div>
            <div class="wizard-question-sub">幫助精確算出您幾歲會轉運、幾歲遇到正緣或事業升遷</div>
          </div>
          <div class="wizard-options-grid">
            ${renderOptionCards(AGE_OPTIONS, answers.age, answers.ageCustom, 'ageCustom')}
          </div>
        </div>
      `;
    }

    // Step 3: 關係稱謂 (Relationship Title - 篇章自適應)
    else if (currentStep === 3) {
      const relConf = THEME_RELATION_CONFIG[activeThemeId] || THEME_RELATION_CONFIG.love;
      const relOptions = relConf.options || [];

      if (!relOptions.some(opt => opt.id === answers.relation)) {
        answers.relation = relConf.defaultRelation || relOptions[0]?.id || 'self_love';
      }

      stepContentHtml = `
        <div class="wizard-step-body">
          <div>
            <div class="wizard-question-title">${relConf.title}</div>
            <div class="wizard-question-sub">${relConf.sub}</div>
          </div>
          <div class="wizard-options-grid cols-2">
            ${renderOptionCards(relOptions, answers.relation, answers.relationCustom, 'relationCustom')}
          </div>
        </div>
      `;
    }

    // Step 4: 情境狀態 (Role / Contextual State - 篇章自適應)
    else if (currentStep === 4) {
      const roleConf = THEME_ROLE_CONFIG[activeThemeId] || THEME_ROLE_CONFIG.love;
      const roleOptions = roleConf.options || [];

      if (!roleOptions.some(opt => opt.id === answers.role)) {
        answers.role = roleConf.defaultRole || roleOptions[0]?.id || 'single';
      }

      stepContentHtml = `
        <div class="wizard-step-body">
          <div>
            <div class="wizard-question-title">${roleConf.title}</div>
            <div class="wizard-question-sub">${roleConf.sub}</div>
          </div>
          <div class="wizard-options-grid cols-2">
            ${renderOptionCards(roleOptions, answers.role, answers.roleCustom, 'roleCustom')}
          </div>
        </div>
      `;
    }

    // Step 5: 請示問題 (Question Textarea)
    else if (currentStep === 5) {
      const promptPills = theme.promptPills || [];
      const currentLen = (answers.question || '').length;
      stepContentHtml = `
        <div class="wizard-step-body">
          <div>
            <div class="wizard-question-title">5. 您目前遇到什麼煩惱或想了解什麼？</div>
            <div class="wizard-question-sub">描述越清楚，給您的建議與時機點就會越精準（建議詳盡填寫您的煩惱）</div>
          </div>
          <div>
            <textarea id="wizardQuestionTextarea" class="app-textarea" rows="4" maxlength="500" placeholder="例如：想了解近期換工作跳槽的最佳月份、或與伴侶之間的未來相處...">${answers.question}</textarea>
            
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
              <span style="font-size:0.75rem;color:var(--text-muted);">💡 點擊下方常用問題快速填入：</span>
              <span id="wizardCharCounter" style="font-size:0.78rem;font-weight:800;color:${currentLen >= 500 ? '#EF4444' : 'var(--text-gold)'};">
                ${currentLen} / 500 字
              </span>
            </div>

            <div class="prompt-tags-list">
              ${promptPills.map((pill) => `
                <button type="button" class="prompt-tag-btn" data-prompt-text="${pill}">+ ${pill}</button>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }

    // Step 6: 期望結果 (Desired Goal)
    else if (currentStep === 6) {
      stepContentHtml = `
        <div class="wizard-step-body">
          <div>
            <div class="wizard-question-title">6. 您最希望獲得怎樣的幫助與結果？</div>
            <div class="wizard-question-sub">點選自訂輸入期望，或直接點選略過</div>
          </div>
          <div class="wizard-options-grid">
            ${renderOptionCards(DESIRED_OUTCOMES, answers.goal, answers.goalCustom, 'goalCustom')}
          </div>
        </div>
      `;
    }

    // Step 7: 手相拍照上傳（選填/可略過）(Palm Upload)
    else if (currentStep === 7) {
      const targetHand = answers.gender === 'female' ? 'right' : 'left';
      const handText = targetHand === 'right' ? '右手（女性看右手天賦）' : '左手（男性看左手天賦）';

      stepContentHtml = `
        <div class="wizard-step-body">
          <div>
            <div class="wizard-question-title">7. 拍照上傳手相照片（選填）</div>
            <div class="wizard-question-sub">
              💡 提示：只要拍手掌，不用拍臉！建議拍攝${handText}。有拍照會多為您分析感情線、智慧線、事業線，內容會更完整。若不方便拍照也可以直接略過！
            </div>
          </div>
          
          <div class="wizard-upload-box" id="wizardPalmTriggerBox">
            ${answers.palmDataUrl ? `
              <div style="display:flex;flex-direction:column;align-items:center;gap:10px;">
                <img src="${answers.palmDataUrl}" class="wizard-upload-preview" alt="手相預覽">
                <div style="font-size:0.86rem;color:#34D399;font-weight:800;display:flex;align-items:center;gap:6px;">
                  <span>✓</span> 掌心照片已辨識就緒（只拍掌心，不存雲端）
                </div>
                <div style="display:flex;gap:8px;margin-top:4px;">
                  <button type="button" class="btn btn-outline btn-sm" id="wizardRetakePalmBtn">
                    📷 重新啟動相機
                  </button>
                  <button type="button" class="btn btn-outline btn-sm" id="wizardChangeAlbumBtn">
                    🖼️ 從相簿重選
                  </button>
                </div>
              </div>
            ` : `
              <div style="font-size:2.6rem;margin-bottom:8px;">✋</div>
              <div style="font-weight:800;color:var(--gold-bright);font-size:1.1rem;">點擊開啟相機 · 掌心輪廓對齊辨識</div>
              <div style="font-size:0.82rem;color:var(--text-muted);margin-top:6px;max-width:400px;margin-left:auto;margin-right:auto;">
                開啟鏡頭將掌心放入金色引導輪廓內，系統將自動對焦並拍照辨識
              </div>
              <div style="display:flex;gap:12px;justify-content:center;margin-top:16px;flex-wrap:wrap;">
                <button type="button" class="btn btn-gold btn-sm" id="wizardOpenCameraBtn">
                  📷 啟動相機拍攝
                </button>
                <button type="button" class="btn btn-outline btn-sm" id="wizardOpenAlbumBtn">
                  🖼️ 從相簿選擇照片
                </button>
              </div>
            `}
          </div>
        </div>
      `;
    }

    // Render Full Wizard Template
    readingModalCard.innerHTML = `
      <div class="wizard-header">
        <div class="wizard-title-row">
          <h3 style="display:flex;align-items:center;gap:8px;color:${theme.color};">
            <span>🔮</span> ${theme.name} · 命理解析
          </h3>
          <span class="theme-quota-pill has-points">剩餘測算次數：${quota} 次</span>
        </div>
        
        <div class="wizard-stepper-meta">
          <span>題目 ${currentStep} / ${totalSteps}</span>
          <span>完成進度 ${progressPercent}%</span>
        </div>
        <div class="wizard-progress-track">
          <div class="wizard-progress-bar" style="width:${progressPercent}%;"></div>
        </div>
      </div>

      ${stepContentHtml}

      <div class="wizard-footer">
        <button type="button" class="btn btn-outline btn-sm" id="wizardBackBtn">
          ${currentStep === 1 ? '取消' : '← 上一步'}
        </button>

        <div style="display:flex;gap:8px;">
          ${currentStep === 7 ? `
            <button type="button" class="btn btn-outline btn-sm" id="wizardSkipPalmBtn">
              ⏩ 略過拍照，直接看報告（不建議）
            </button>
            <button type="button" class="btn btn-gold btn-sm" id="wizardSubmitBtn">
              ⚡ 產生完整解析報告 (扣 1 次)
            </button>
          ` : `
            <button type="button" class="btn btn-gold btn-sm" id="wizardNextBtn">
              下一步 →
            </button>
          `}
        </div>
      </div>
    `;

    bindWizardStepEvents(currentStep);
  }

  function isCurrentStepAnswered(currentStep) {
    const { answers, activeThemeId } = state.wizard;
    const relConf = THEME_RELATION_CONFIG[activeThemeId] || THEME_RELATION_CONFIG.love;
    const roleConf = THEME_ROLE_CONFIG[activeThemeId] || THEME_ROLE_CONFIG.love;

    const stepConfig = {
      1: { options: GENDER_OPTIONS, value: answers.gender, custom: answers.genderCustom },
      2: { options: AGE_OPTIONS, value: answers.age, custom: answers.ageCustom },
      3: { options: relConf.options || [], value: answers.relation, custom: answers.relationCustom },
      4: { options: roleConf.options || [], value: answers.role, custom: answers.roleCustom },
      6: { options: DESIRED_OUTCOMES, value: answers.goal, custom: answers.goalCustom }
    }[currentStep];

    if (!stepConfig) return true;

    const selectedOpt = stepConfig.options.find((o) => o.id === stepConfig.value);
    if (selectedOpt && selectedOpt.isCustom) {
      return (stepConfig.custom || '').trim().length > 0;
    }
    return true;
  }

  function bindWizardStepEvents(currentStep) {
    const { answers } = state.wizard;

    const updateNextBtnState = () => {
      const btn = document.getElementById('wizardNextBtn');
      if (btn) btn.disabled = !isCurrentStepAnswered(currentStep);
    };

    readingModalCard.querySelectorAll('.wizard-option-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        const isInput = e.target.classList.contains('wizard-custom-text-input');
        const val = card.dataset.value;
        const isCustom = card.dataset.isCustom === 'true';

        if (currentStep === 1) answers.gender = val;
        else if (currentStep === 2) answers.age = val;
        else if (currentStep === 3) answers.relation = val;
        else if (currentStep === 4) answers.role = val;
        else if (currentStep === 6) answers.goal = val;

        readingModalCard.querySelectorAll('.wizard-option-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');

        if (isCustom) {
          const input = card.querySelector('.wizard-custom-text-input');
          if (input && !isInput) {
            input.focus();
          }
          updateNextBtnState();
        } else {
          updateNextBtnState();
          setTimeout(() => {
            advanceWizardStep(1);
          }, 180);
        }
      });
    });

    readingModalCard.querySelectorAll('.wizard-custom-text-input').forEach((input) => {
      const fieldName = input.dataset.customInputFor;
      input.addEventListener('input', (e) => {
        if (fieldName && answers[fieldName] !== undefined) {
          answers[fieldName] = e.target.value;
        }
        updateNextBtnState();
      });
      input.addEventListener('click', (e) => {
        e.stopPropagation();
        const parentCard = input.closest('.wizard-option-card');
        if (parentCard) {
          readingModalCard.querySelectorAll('.wizard-option-card').forEach((c) => c.classList.remove('selected'));
          parentCard.classList.add('selected');
          const val = parentCard.dataset.value;
          if (currentStep === 1) answers.gender = val;
          else if (currentStep === 2) answers.age = val;
          else if (currentStep === 3) answers.relation = val;
          else if (currentStep === 4) answers.role = val;
          else if (currentStep === 6) answers.goal = val;
        }
        updateNextBtnState();
      });
    });

    if (currentStep === 5) {
      const textarea = document.getElementById('wizardQuestionTextarea');
      const counter = document.getElementById('wizardCharCounter');

      const updateCounter = () => {
        if (!textarea) return;
        const len = textarea.value.length;
        if (counter) {
          counter.textContent = `${len} / 500 字`;
          counter.style.color = len >= 500 ? '#EF4444' : 'var(--text-gold)';
        }
      };

      if (textarea) {
        textarea.addEventListener('input', (e) => {
          answers.question = e.target.value;
          updateCounter();
        });
      }

      readingModalCard.querySelectorAll('[data-prompt-text]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const text = btn.dataset.promptText;
          if (textarea) {
            textarea.value = text.slice(0, 500);
            answers.question = textarea.value;
            updateCounter();
          }
        });
      });
    }

    if (currentStep === 7) {
      const targetHand = answers.gender === 'female' ? 'right' : 'left';

      document.getElementById('wizardOpenCameraBtn')?.addEventListener('click', () => {
        openCamera(targetHand);
      });

      document.getElementById('wizardOpenAlbumBtn')?.addEventListener('click', () => {
        openFilePicker(targetHand);
      });

      document.getElementById('wizardRetakePalmBtn')?.addEventListener('click', () => {
        openCamera(targetHand);
      });

      document.getElementById('wizardChangeAlbumBtn')?.addEventListener('click', () => {
        openFilePicker(targetHand);
      });

      const skipBtn = document.getElementById('wizardSkipPalmBtn');
      if (skipBtn) {
        skipBtn.addEventListener('click', () => {
          answers.palmDataUrl = null;
          executeDecodingFlow();
        });
      }

      const submitBtn = document.getElementById('wizardSubmitBtn');
      if (submitBtn) {
        submitBtn.addEventListener('click', () => {
          executeDecodingFlow();
        });
      }
    }

    const backBtn = document.getElementById('wizardBackBtn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (currentStep === 1) {
          readingModalBackdrop.classList.remove('show');
        } else {
          advanceWizardStep(-1);
        }
      });
    }

    const nextBtn = document.getElementById('wizardNextBtn');
    if (nextBtn) {
      updateNextBtnState();
      nextBtn.addEventListener('click', () => {
        if (!isCurrentStepAnswered(currentStep)) {
          const emptyInput = readingModalCard.querySelector('.wizard-custom-text-input');
          if (emptyInput) emptyInput.focus();
          return;
        }
        advanceWizardStep(1);
      });
    }
  }

  function advanceWizardStep(direction) {
    const next = state.wizard.currentStep + direction;
    if (next >= 1 && next <= state.wizard.totalSteps) {
      state.wizard.currentStep = next;
      renderWizardStep();
    }
  }

  // ============ 12. Execute Decoding & Show Report (白話溫暖) ============
  function executeDecodingFlow() {
    if (state.wizard.isSubmitting) return;
    state.wizard.isSubmitting = true;

    const { activeThemeId, answers } = state.wizard;
    const myDecodeToken = ++state.wizard.decodeToken;

    try {
      const consumeRes = WalletManager.consumePoint(activeThemeId, 1);
      if (!consumeRes.success) {
        state.wizard.isSubmitting = false;
        const themeObj = THEMES.find((t) => t.id === activeThemeId);
        const themeName = themeObj ? themeObj.name : '此主題';

        if (window.PaymentSDK) {
          triggerPortalyCheckout(
            { id: 'single', label: `單項供養方案【${themeName}】`, price: 199, pointsReward: 3 },
            [activeThemeId],
            () => {
              // 付款/模擬成功後，自動延續解析報告流程！
              executeDecodingFlow();
            }
          );
        } else {
          alert(`您的【${themeName}】測算次數不足，請先至會員中心開通點數！`);
        }
        renderWizardStep();
        return;
      }

      renderThemesHub();
      renderMemberCenter();

      // Show Decoding Animation
      readingModalCard.innerHTML = `
        <div class="decoding-stage">
          <div class="decoding-spinner-ring"></div>
          <h3 style="color:var(--gold-bright);">正在為您深入解析命盤與手相...</h3>
          <p style="color:var(--text-muted);font-size:0.85rem;">正在智能比對命理時機、手相紋路特徵與真實見證案例</p>
          
          <div class="decoding-progress-bar">
            <div class="decoding-progress-fill" id="decodingProgress"></div>
          </div>
        </div>
      `;

      function finishDecoding() {
        const stillCurrent = state.wizard.decodeToken === myDecodeToken;
        try {
          showDecodedReport(activeThemeId, answers, stillCurrent);
          state.wizard.isSubmitting = false;
        } catch (err) {
          console.error('產生報告失敗，已退回本次測算次數', err);
          WalletManager.addPointsToThemes([activeThemeId], 1);
          state.wizard.isSubmitting = false;
          if (stillCurrent) {
            alert('產生失敗，已退回本次測算次數，請重試');
            renderWizardStep();
          }
        }
      }

      const fill = document.getElementById('decodingProgress');
      let progress = 10;
      const interval = setInterval(() => {
        if (state.wizard.decodeToken !== myDecodeToken) {
          clearInterval(interval);
          finishDecoding();
          return;
        }
        progress += 30;
        if (fill) fill.style.width = `${progress}%`;
        if (progress >= 100) {
          clearInterval(interval);
          setTimeout(finishDecoding, 500);
        }
      }, 400);
    } catch (err) {
      console.error('扣點或產生報告流程發生錯誤，已退回本次測算次數', err);
      WalletManager.addPointsToThemes([activeThemeId], 1);
      state.wizard.isSubmitting = false;
      if (state.wizard.decodeToken === myDecodeToken) {
        alert('產生失敗，已退回本次測算次數，請重試');
        renderWizardStep();
      }
    }
  }

  function generateDeepReportAnalysis(themeId, answers, genderLabel, ageLabel, relationLabel, roleLabel, goalLabel, theme) {
    const q = (answers.question || '').trim();

    // 1. 關鍵流年轉折 (動態依年齡計算)
    let turnaroundYear = '今年秋冬至明年初 · 關鍵轉化期';
    if (answers.age === '18-24') {
      turnaroundYear = '22 ~ 25 歲 · 青年啟蒙與天賦奠定轉折';
    } else if (answers.age === '25-34') {
      turnaroundYear = '28 ~ 32 歲 · 適婚立業黃金翻轉期';
    } else if (answers.age === '35-44') {
      turnaroundYear = '39 ~ 43 歲 · 中流天花板突破與財祿高峰';
    } else if (answers.age === '45-54') {
      turnaroundYear = '48 ~ 53 歲 · 資產穩固與家運豐盛吉期';
    } else if (answers.age === '55+') {
      turnaroundYear = '58 ~ 65 歲 · 德澤安康與晚運圓滿期';
    } else if (answers.ageCustom) {
      turnaroundYear = `針對 ${answers.ageCustom} · 未來三至六個月關鍵樞紐`;
    }

    // 2. 貴人特徵與方位
    let nobleGuide = '正南方 · 處事溫和細心之命定貴人';
    if (/債|欠款|工程款|借貸|賠償|官司|法院|倒帳/.test(q)) {
      nobleGuide = '正北方 · 懂法規契約的嚴謹女性 / 專業法務調解者';
    } else if (/兒|女|孩子|小孩|叛逆|結婚|相親|催婚|念書|考/.test(q)) {
      nobleGuide = '正東方 · 具同理心之長輩良師 / 溫暖慈祥長者';
    } else if (/創業|融資|合夥|股權|老闆|投資|商機|SaaS/.test(q)) {
      nobleGuide = '東北方 · 具產業資源的資深出資方 / 穩健合夥人';
    } else if (/主管|換工作|跳槽|離職|實習|裁員|升遷|同事|架構|考考/.test(q)) {
      nobleGuide = '西北方 · 具實權之長官前輩 / 踏實技術同儕';
    } else if (/前任|復合|正緣|暗戀|曖昧|伴侶|夫妻|冷戰|離婚/.test(q)) {
      nobleGuide = '東南方 · 溫和沉穩、性格互補之正緣善士';
    } else if (/買房|新屋|頭期款|房貸|長輩|生病|身體|開刀/.test(q)) {
      nobleGuide = '西南方 · 踏實房產專家 / 家族有福德之醫師長者';
    }

    // 3. 手相印證
    let palmFeature = '吉星照會 · 氣場聚集生輝';
    if (answers.palmDataUrl) {
      if (themeId === 'love') palmFeature = '✋ 感情線末端向上延伸 · 正緣磁場清明';
      else if (themeId === 'work') palmFeature = '✋ 智慧線深長無阻 · 天賦潛力即將啟動';
      else if (themeId === 'career') palmFeature = '✋ 事業命運線貫穿掌心 · 商業巔峰可期';
      else if (themeId === 'wealth') palmFeature = '✋ 水星丘飽滿微凸 · 先天財庫聚財有力';
      else if (themeId === 'family') palmFeature = '✋ 金星丘厚實紅潤 · 家宅地基平穩祥和';
      else if (themeId === 'children') palmFeature = '✋ 小指基部子女紋清晰 · 天賦靈性相生';
    }

    // 4. 深度病灶透視、具體破局之法、行動方向
    let diagnosis = '';
    let method = '';
    let direction = '';

    if (/兒|女|孩子|小孩|叛逆|催婚|不結婚|甩門|冷戰/.test(q)) {
      diagnosis = '【因果病灶透視】：親密關係中的邊界感模糊，長年「以愛為名」的過度操心與催逼，在孩子心中形成了沉重的心理防衛與雙重束縛。越是急切想抓住對方的行蹤與婚配進度，越容易將至親推向沉默反鎖與冷戰對立的死結。';
      method = '【破局化解方法】：實施「非暴力界線退後法」——第一，即刻停止言語催婚、說教或刺探私生活，給予彼此 3～6 個月的心理緩衝期；第二，將關心化為無條件的溫暖實質照顧（如準備其愛吃的飯菜或留簡短便箋，不帶說教尾巴）；第三，把注意力收回自身的生活與身心調養，當您自身的焦慮氣場平靜下來，家庭磁場自會轉向和諧。';
      direction = '【轉折吉時方向】：今年農曆冬季至明年立春，為親子溝通破冰的關鍵契機。屆時以平輩朋友姿態溫和探問，對方的心防必將融化，迎來深度理解。';
    } else if (/欠款|倒帳|工程款|借貸|還錢|賠償|官司|法院/.test(q)) {
      diagnosis = '【因果病灶透視】：財庫因果受阻，昔日基於信任或江湖情義未立嚴謹書面防線，導致自身承受巨大債務反噬與催款高壓。若一味深陷情緒憤恨或私下爭吵，反而容易落入對方脫產與拖延戰術之陷阱。';
      method = '【破局化解方法】：採取「法理雙軌止血法」——第一，立即將所有出入單據、匯款明細、對話紀錄與合約完整造冊，切忌意氣用事；第二，透過鄉鎮市調解委員會或專業律師發出存證信函，以「階段性還款協議 + 法律本票保全」建立防線，給對方階梯下的同時鎖定資產；第三，自身財庫採取絕對保守防禦，嚴禁病急亂投醫盲目借貸補洞。';
      direction = '【轉折吉時方向】：農曆九月、十月為重要法律調解與財帛回流吉月，正北方將有法務或公信人士相助，有望打破僵局追回重要資金。';
    } else if (/架構|技術|主管|換工作|跳槽|離職|裁員|試用期|實習|新鮮人|同事|小人|外銷|履歷/.test(q)) {
      diagnosis = '【因果病灶透視】：身處職場新舊更替或階級夾心層的焦慮風暴中心。過度將精力內耗於非自身能控制的長官偏見、辦公室政治或年齡危機，忽視了自身核心天賦資產的深層變現價值。';
      method = '【破局化解方法】：啟動「雙軌價值防禦網」——第一，在現職落實「量化留痕法」，將自身架構貢獻或日常執行成效轉化為白紙黑字的商業產出指標，不捲入口舌紛爭；第二，暗中啟動外部網絡，整理代表性成果作品集，在離職前盤點至少 2～3 個替代機會；第三，新人實習者切莫自我矮化，主動向資深前輩請益標準流程，將恐懼轉化為筆記習慣。';
      direction = '【轉折吉時方向】：今年秋季末為蓄勢期，明年開春農曆正月至三月，西北方將出現貴人引路，迎來轉職高就或升遷轉正之關鍵良機。';
    } else if (/合夥|融資|創業|Pre-A|MVP|SaaS|股權|老闆|營業額/.test(q)) {
      diagnosis = '【因果病灶透視】：事業版圖擴張過猛遇上外在景氣寒冬，合夥人之間權責利益未徹底切割，導致現金流陷入過橋風險。此時若僅靠賭性硬撐，極易因合夥反目而重創基業。';
      method = '【破局化解方法】：執行「精實造血與股權停損法」——第一，立即盤點近三個月真實現金流跑道（Runway），砍除非核心開銷，優先啟動自體造血營收模式；第二，對於意圖退場之合夥人，儘速依合理估值簽署分期股權回購或稀釋協議，避免決策癱瘓；第三，引進新外部資源時，著重具備產業落地的策略夥伴，而非單純財務投機方。';
      direction = '【轉折吉時方向】：今年秋季中下旬（農曆八、九月）將迎來轉折契機，東北方將有懂您商業價值的實業貴人接洽，商業巔峰大運將在明年逐步鋪展。';
    } else if (/簽字|合規|審計|稅務|異常|違規|法律責任/.test(q)) {
      diagnosis = '【因果病灶透視】：體制灰色地帶試圖將系統性責任轉嫁予個人，面臨職業良知與飯碗生存的劇烈拉扯。任何妥協或抱持僥倖簽字，都將成為日後不可承受之連帶風險。';
      method = '【破局化解方法】：落實「合規書面三防線」——第一，所有關鍵指示必須堅持以正式電子郵件或公文簽呈留痕存檔，不接受任何純口頭承諾；第二，針對疑慮交易啟動內部合規備忘錄（Memo），如實記載客觀事實與法規風險；第三，諮詢外部獨立法律或會計顧問，以合法專業之客觀報告作為自身職務免責的堅固盾牌。';
      direction = '【轉折吉時方向】：堅持正道必得神明暗中庇佑，年底前組織內部人事將迎來自然更替洗牌，危機將化解於無形，保全自身令名與前途。';
    } else if (/學姐|暗戀|曖昧|工具人|備胎|正緣|長相|復合|前任|冷戰|離婚/.test(q)) {
      diagnosis = '【因果病灶透視】：情感磁場陷入「自我價值過度依附對方反饋」的失衡狀態。將自身幸福寄託於忽冷忽熱的曖昧對象或已逝舊情，導致自身靈魂頻率散亂、感情線受阻。';
      method = '【破局化解方法】：實踐「自性圓滿吸引法則」——第一，立刻停止卑微討好或頻繁查看對方動態，收回投射在對方身上的過度關注；第二，重塑生活節奏與外在形象，在事業與興趣中找回自信光芒；第三，若處於伴侶冷戰中，嘗試以「我感到困頓脆弱」取代「你總是忽視我」的指責話術，開啟柔軟對話。';
      direction = '【轉折吉時方向】：東南方將迎來紅鸞善星照耀，今年秋冬至明年初將迎來真正的正緣轉折——若為良緣則深層破冰，若為錯緣則清爽放下、迎來真正相知相惜的天命正緣。';
    } else if (/出國|留學|OPT|H1B|簽證|海拒|異鄉|學貸/.test(q)) {
      diagnosis = '【因果病灶透視】：文化拔根之生存焦慮與學貸重壓，讓靈魂處於高壓驚恐狀態。將短期政策或簽證困頓等同於整個人生的成敗，造成視野收窄與心力透支。';
      method = '【破局化解方法】：採取「多維度身分與技能備案」——第一，擴大求職半徑，不限於單一特定產業，靈活運用跨國外包、學術研究或遠端職缺過渡身分；第二，主動向海外校友會與同鄉善士尋求推薦內推；第三，心態上接納「歸鄉亦是廣闊天地」，將留學歷練化為不可替代之雙語優勢，退路亦是進路。';
      direction = '【轉折吉時方向】：未來三個月內西方與西北方將浮現轉機，貴人指引將為您打開一扇意料之外的門，順應因果必有立錐之地。';
    } else if (/關在房間|不敢出門|外送|憂鬱|活著好累|社交恐懼|退縮/.test(q)) {
      diagnosis = '【因果病灶透視】：心靈承受外界評價過載與存在性羞恥，啟動了極端的自我封閉防護罩。此時任何外界催逼都會加劇恐慌，您需要的不是立刻大步奔跑，而是靈魂深度的休養與接納。';
      method = '【破局化解方法】：實施「微量生活錨定法」——第一，接納當下疲憊的自己，每天只設定一個極微小的目標（如開窗曬太陽 5 分鐘、喝一杯溫水），不評價自己的好壞；第二，不與任何人比較生活進度，阻絕外界雜音；第三，若需要求助，透過文字而非面對面方式尋求心理諮詢或信任之社福支持，仙佛永遠包容接納您的存在。';
      direction = '【轉折吉時方向】：深冬過後必有暖陽，目前正處於蓄積生命能量之谷底修復期，明年開春氣場將逐步回溫，必能找回前行的微光與勇氣。';
    } else if (/買房|新成屋|頭期款|房貸|置產/.test(q)) {
      diagnosis = '【因果病灶透視】：購屋置產乃家宅立基之大計，過度焦慮於通膨與房價飆漲，容易在長輩期望與自身承受力之間陷入天人交戰，稍有不慎恐造成長年現金流緊繃。';
      method = '【破局化解方法】：落實「精準壓力測試與分期置產心法」——第一，嚴格以家庭實質月收入之 35%～40% 為房貸上限，守住生活品質防線；第二，挑選具備實質交通軌道與抗跌剛需之成熟生活圈，不盲目追高重劃區炒作；第三，家宅合約嚴格載明驗屋與瑕疵擔保，謀定而後動。';
      direction = '【轉折吉時方向】：西南方與正西方有吉星拱照，明後兩年市場將迎來絕佳之議價與挑選窗口，心儀良宅必將有緣結契。';
    } else {
      diagnosis = `【因果局勢透視】：信士（${genderLabel} · ${ageLabel} · 稱謂：${relationLabel} · 狀態：${roleLabel}）當前所處環境正值氣場重整之際。您所掛心的核心問題，表層雖為現實人事阻礙，實則為靈魂迎向下一階段躍遷之磨練課題。`;
      method = `【破局化解之法】：第一，釐清主客觀界線，聚焦於自身能掌控之行動；第二，廣結善緣、心存正念，遇事不躁進，順應易學陰陽之道化剛為柔；第三，保持每日清心靜定，誠心向仙佛祈請智慧指引。`;
      direction = `【前進方向與轉折】：關鍵轉折將在未來關鍵月份（尤其是今年秋末至明年初）開展，把握南方與身邊之善緣貴人，必能守得雲開見月明！`;
    }

    const formattedAdvice = `
      <div class="report-deep-analysis">
        <div class="advice-block-item">
          <div style="color:var(--gold-bright);font-weight:800;font-size:0.96rem;margin-bottom:4px;">🔍 因果局勢與核心病灶透視：</div>
          <div style="color:var(--text-secondary);line-height:1.75;margin-bottom:12px;">${diagnosis}</div>
        </div>
        
        <div class="advice-block-item" style="border-top:1px dashed rgba(212,168,83,0.25);padding-top:10px;margin-top:10px;">
          <div style="color:#34D399;font-weight:800;font-size:0.96rem;margin-bottom:4px;">🛠️ 仙佛指引：具體破局之法（心法＋實戰行動）：</div>
          <div style="color:var(--text-secondary);line-height:1.75;margin-bottom:12px;">${method}</div>
        </div>

        <div class="advice-block-item" style="border-top:1px dashed rgba(212,168,83,0.25);padding-top:10px;margin-top:10px;">
          <div style="color:var(--gold-gradient);font-weight:800;font-size:0.96rem;margin-bottom:4px;">🧭 前進方向與轉折吉時：</div>
          <div style="color:var(--text-secondary);line-height:1.75;margin-bottom:12px;">${direction}</div>
        </div>

        <div class="advice-block-item" style="background:rgba(212,168,83,0.08);border-left:3px solid var(--gold-bright);padding:8px 12px;border-radius:4px;margin-top:12px;">
          <strong style="color:var(--gold-bright);font-size:0.85rem;">✦ 手相命脈靈犀印證：</strong>
          <span style="color:var(--text-gold);font-size:0.85rem;">${palmFeature}。信士誠心所至，仙佛自然作主護佑！</span>
        </div>
      </div>
    `;

    return {
      turnaroundYear,
      nobleGuide,
      palmFeature,
      diagnosis,
      method,
      direction,
      formattedAdvice
    };
  }

  function showDecodedReport(themeId, answers, renderIntoModal = true) {
    const theme = THEMES.find((t) => t.id === themeId);

    const matchedStories = matchStoriesForReport(themeId, answers.question);

    const relConf = THEME_RELATION_CONFIG[themeId] || THEME_RELATION_CONFIG.love;
    const roleConf = THEME_ROLE_CONFIG[themeId] || THEME_ROLE_CONFIG.love;

    const genderLabel = (answers.gender === 'custom_gender' && answers.genderCustom)
      ? answers.genderCustom
      : (GENDER_OPTIONS.find(g => g.id === answers.gender)?.label || '不透露');

    const ageLabel = (answers.age === 'custom_age' && answers.ageCustom)
      ? `${answers.ageCustom}`
      : (AGE_OPTIONS.find(a => a.id === answers.age)?.label || '25-34歲');

    const relationLabel = (answers.relation === 'custom_relation' && answers.relationCustom)
      ? answers.relationCustom
      : (relConf.options.find(r => r.id === answers.relation)?.label || answers.relation || '本人自身');

    const roleLabel = (answers.role === 'custom_state' && answers.roleCustom)
      ? answers.roleCustom
      : (roleConf.options.find(r => r.id === answers.role)?.label || answers.role || '一般狀態');

    const goalLabel = (answers.goal === 'custom_goal' && answers.goalCustom)
      ? answers.goalCustom
      : (answers.goal === 'skip' || !answers.goal
          ? '略過（由仙佛全方位推演指引）'
          : (DESIRED_OUTCOMES.find(g => g.id === answers.goal)?.label || '由仙佛全方位推演指引'));

    if (typeof confetti === 'function') {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.5 }
      });
    }

    const deepAnalysis = generateDeepReportAnalysis(
      themeId,
      answers,
      genderLabel,
      ageLabel,
      relationLabel,
      roleLabel,
      goalLabel,
      theme
    );

    const reportData = {
      themeId,
      themeName: theme.name,
      title: theme.title,
      gender: genderLabel,
      age: ageLabel,
      relation: relationLabel,
      role: roleLabel,
      goal: goalLabel,
      question: answers.question || '一般運勢與未來時機指引',
      score: 92 + Math.floor(Math.random() * 7),
      turnaroundYear: deepAnalysis.turnaroundYear,
      nobleGuide: deepAnalysis.nobleGuide,
      palmFeature: deepAnalysis.palmFeature,
      advice: deepAnalysis.formattedAdvice,
      hasPalm: Boolean(answers.palmDataUrl),
      matchedStories
    };

    WalletManager.saveReport(reportData);

    if (!renderIntoModal) return; // 彈窗已經被關閉或換成別的內容：報告仍照存進歷史紀錄，但不能再蓋掉現在畫面上顯示的東西

    readingModalCard.innerHTML = `
      <div class="report-content-box">
        <div class="report-header-badge">
          <span style="font-size:0.75rem;font-weight:800;color:var(--gold-bright);border:1px solid var(--border-gold);padding:3px 10px;border-radius:999px;">
            ✦ 專屬深度解析報告已產出 ✦
          </span>
          <h2 style="margin-top:10px;color:var(--gold-gradient);">${theme.name} · ${theme.title}</h2>
          <div style="font-size:0.8rem;color:var(--text-gold);margin-top:4px;">
            ${reportData.gender} ｜ ${reportData.age} ｜ 稱謂：${reportData.relation} ｜ 狀態：${reportData.role} ｜ ${reportData.hasPalm ? '✋ 已包含手相分析' : '🔮 命理深度推演'}
          </div>
        </div>

        <div class="report-dimension-grid">
          <div class="report-dim-card">
            <div class="report-dim-label">天命靈犀契合度</div>
            <div class="report-dim-val">${reportData.score} %</div>
          </div>
          <div class="report-dim-card">
            <div class="report-dim-label">關鍵流年轉折</div>
            <div class="report-dim-val" style="font-size:0.95rem;">${reportData.turnaroundYear}</div>
          </div>
          <div class="report-dim-card">
            <div class="report-dim-label">貴人特徵與方位</div>
            <div class="report-dim-val" style="font-size:0.88rem;">${reportData.nobleGuide}</div>
          </div>
          <div class="report-dim-card">
            <div class="report-dim-label">手相命脈印證</div>
            <div class="report-dim-val" style="font-size:0.88rem;">${reportData.palmFeature}</div>
          </div>
        </div>

        <div class="report-advice-box">
          <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:8px;border-bottom:1px dashed var(--border);padding-bottom:8px;">
            <div><strong>📌 信士叩問煩惱：</strong> ${reportData.question}</div>
            <div style="margin-top:4px;color:var(--text-gold);"><strong>🎯 核心期待結果：</strong> ${reportData.goal}</div>
          </div>
          <div style="line-height:1.75;">
            ${reportData.advice}
          </div>
        </div>

        <!-- ============ 真實顯化故事 下方欄位 ============ -->
        <div class="report-manifestation-section">
          <div class="manifestation-header">
            <span class="manifestation-tag">✦ 真實見證故事 ✦</span>
            <h4>看看其他信眾的真實經歷（與您的問題最相近）：</h4>
          </div>

          <div class="manifestation-cards-list">
            ${reportData.matchedStories.map((story) => `
              <div class="manifestation-story-card">
                <div class="story-card-meta">
                  <span class="story-card-title">${story.title}</span>
                  <span class="story-card-user">${story.name} · ${story.category}</span>
                </div>
                <div class="story-card-summary">${story.summary}</div>
                <div class="story-card-result-badge">✓ ${story.result}</div>
                <details class="story-full-details">
                  <summary>點擊展開閱讀完整見證故事</summary>
                  <p style="margin-top:8px;font-size:0.84rem;line-height:1.75;color:var(--text-muted);">${story.full.replace(/\n\n/g, '<br><br>')}</p>
                </details>
              </div>
            `).join('')}
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;border-top:1px solid var(--border);padding-top:14px;">
          <button type="button" class="btn btn-outline btn-sm" id="closeReportBtn">返回首頁</button>
          <button type="button" class="btn btn-primary btn-sm" id="viewAllReportsBtn">查看歷史紀錄簿</button>
        </div>
      </div>
    `;

    document.getElementById('closeReportBtn').addEventListener('click', () => {
      readingModalBackdrop.classList.remove('show');
    });

    document.getElementById('viewAllReportsBtn').addEventListener('click', () => {
      readingModalBackdrop.classList.remove('show');
      state.activeTab = 'history';
      updateActiveTab();
    });

    readingModalBackdrop.classList.add('show');
  }

  // ============ 13. Render History Reports ============
  function renderHistoryReports() {
    if (!historyReportsGrid) return;
    historyReportsGrid.innerHTML = '';

    const list = WalletManager.getReports();
    if (list.length === 0) {
      historyReportsGrid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);grid-column:1/-1;">尚無測算紀錄，快去首頁開始您的第一次測算吧！</div>';
      return;
    }

    list.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'theme-hub-card';
      card.innerHTML = `
        <div style="display:flex;gap:12px;align-items:center;">
          <div style="width:48px;height:48px;border-radius:var(--radius-sm);background:rgba(212,168,83,0.15);border:1px solid var(--border-gold);display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0;">
            📜
          </div>
          <div>
            <h4 style="color:var(--gold-bright);">${item.themeName}</h4>
            <span style="font-size:0.75rem;color:var(--text-muted);">${new Date(item.date).toLocaleDateString('zh-TW')}</span>
          </div>
        </div>
        <div style="font-size:0.82rem;color:var(--text-gold);font-weight:700;">想了解的事：${item.question || '一般運勢'}</div>
        <p style="font-size:0.85rem;">${item.advice}</p>
        ${item.matchedStories && item.matchedStories.length ? `
          <div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);font-size:0.78rem;color:var(--text-muted);">
            <span>📖 相關見證故事：</span>
            <span style="color:var(--gold-bright);">${item.matchedStories[0].title}</span>
          </div>
        ` : ''}
      `;
      historyReportsGrid.appendChild(card);
    });
  }

  // ============ 14. Render Stories Feed ============
  function renderStoriesFeed() {
    if (!storiesGrid) return;
    storiesGrid.innerHTML = '';

    const filtered = state.selectedStoriesCategory === 'all'
      ? MANIFESTATION_STORIES
      : MANIFESTATION_STORIES.filter((s) => s.themeId === state.selectedStoriesCategory);

    filtered.forEach((s) => {
      const card = document.createElement('div');
      card.className = 'theme-hub-card';
      card.innerHTML = `
        ${s.imageUrl ? `
          <div class="story-card-banner">
            <img src="${s.imageUrl}" alt="${s.title}" loading="lazy" onerror="this.parentElement.style.display='none'">
            <span class="story-banner-tag">✦ 五路祈福金 ✦</span>
            <span class="story-banner-label">真實顯化見證</span>
          </div>
        ` : ''}
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:2px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:36px;height:36px;border-radius:50%;background:var(--gold-gradient);color:#000;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:0.9rem;flex-shrink:0;">
              ${s.name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div style="font-weight:700;font-size:0.95rem;">${s.name}</div>
              <div style="font-size:0.75rem;color:var(--text-gold);">${s.category}</div>
            </div>
          </div>
          <span style="font-size:0.72rem;background:rgba(255,255,255,0.08);padding:3px 8px;border-radius:4px;color:var(--text-muted);">
            ${THEMES.find(t=>t.id===s.themeId)?.name || '感應見證'}
          </span>
        </div>

        <h4 style="font-size:1.02rem;color:#FFFFFF;margin-top:8px;line-height:1.45;">${s.title}</h4>
        <p style="font-size:0.86rem;color:var(--text-secondary);line-height:1.6;margin:6px 0 10px;">${s.summary}</p>
        
        <div style="display:inline-flex;align-self:flex-start;font-size:0.76rem;color:#34D399;font-weight:800;background:rgba(16,185,129,0.15);padding:3px 8px;border-radius:4px;">
          ✓ ${s.result}
        </div>

        <details class="story-full-details" style="margin-top:10px;">
          <summary>閱讀完整見證始末</summary>
          <p style="margin-top:8px;font-size:0.84rem;line-height:1.75;color:var(--text-muted);">${s.full.replace(/\n\n/g, '<br><br>')}</p>
        </details>
      `;
      storiesGrid.appendChild(card);
    });
  }

  if (storiesFilterGroup) {
    storiesFilterGroup.querySelectorAll('[data-category]').forEach((btn) => {
      btn.addEventListener('click', () => {
        storiesFilterGroup.querySelectorAll('[data-category]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.selectedStoriesCategory = btn.dataset.category;
        renderStoriesFeed();
      });
    });
  }

  // ============ Palm Camera Event Listeners ============
  document.addEventListener('kaiyun-palm-captured', (e) => {
    if (e.detail && e.detail.previewUrl) {
      state.wizard.answers.palmDataUrl = e.detail.previewUrl;
      if (readingModalBackdrop.classList.contains('show') && state.wizard.currentStep === 7) {
        renderWizardStep();
      }
    }
  });

  document.addEventListener('kaiyun-palm-cleared', () => {
    state.wizard.answers.palmDataUrl = null;
    if (readingModalBackdrop.classList.contains('show') && state.wizard.currentStep === 7) {
      renderWizardStep();
    }
  });

  // ============ 11. 綠界支付回導與點數即時入帳處理 ============
  function handlePaymentReturnFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    if (!paymentStatus) return;

    if (paymentStatus === 'success') {
      const tradeNo = urlParams.get('tradeNo');
      const planId = urlParams.get('plan');
      const themesStr = urlParams.get('themes');
      const amount = urlParams.get('amount');

      if (tradeNo && WalletManager.hasProcessedOrder(tradeNo)) {
        console.log('[ECPay] 該筆訂單已核發過點數，防止重複充值');
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }

      const plan = PLANS.find((p) => p.id === planId) || { label: '供養方案', pointsReward: 3, price: amount };
      const themeIds = themesStr ? themesStr.split(',').filter(Boolean) : [];

      if (themeIds.length > 0) {
        // 1. 錢包充值點數
        WalletManager.addPointsToThemes(themeIds, plan.pointsReward || 3);
        
        // 2. 寫入訂單紀錄
        WalletManager.recordOrder({
          tradeNo,
          planId,
          themes: themeIds,
          amount: amount || plan.price,
          status: 'paid',
          date: new Date().toISOString()
        });

        // 3. 畫面即時重新渲染
        renderThemesHub();
        renderMemberCenter();

        // 4. 慶祝彩帶
        if (typeof confetti === 'function') {
          confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
        }

        // 5. 感謝結緣彈窗
        const backdrop = document.getElementById('readingModalBackdrop');
        const card = document.getElementById('readingModalCard');
        if (backdrop && card) {
          const themeTitles = themeIds
            .map((id) => THEMES.find((t) => t.id === id)?.name || id)
            .join('、');

          card.innerHTML = `
            <div class="wizard-header" style="border-bottom:1px solid var(--border-gold);padding-bottom:14px;margin-bottom:16px;">
              <div class="wizard-title-row">
                <h3 style="display:flex;align-items:center;gap:8px;color:#34D399;font-size:1.25rem;">
                  <span>🎉</span> 結緣供養成功！
                </h3>
                <button type="button" class="btn btn-outline btn-sm" id="closeSuccessModalBtn" style="padding:4px 10px;">✕ 關閉</button>
              </div>
            </div>

            <div style="text-align:center;padding:10px 0 20px;">
              <div style="font-size:3.2rem;margin-bottom:10px;">🧧</div>
              <h4 style="color:var(--gold-bright);font-size:1.25rem;margin-bottom:8px;">誠心叩問，福澤圓滿</h4>
              <p style="color:var(--text-secondary);font-size:0.92rem;line-height:1.6;max-width:440px;margin:0 auto 16px;">
                感謝您的結緣支持！系統已成功開通 <strong>${themeTitles}</strong>，所選篇章各自存入 <strong>${plan.pointsReward || 3} 次</strong> 深度命理與掌紋解析次數！
              </p>
              <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:var(--radius-sm);padding:10px 16px;font-size:0.8rem;color:var(--text-muted);display:inline-block;">
                綠界交易單號：<span style="color:#FFFFFF;font-family:monospace;">${tradeNo || '已完成'}</span> ｜ 結算金額：<span style="color:var(--gold-bright);font-weight:700;">NT$ ${amount || plan.price}</span>
              </div>
              <div style="margin-top:24px;display:flex;gap:12px;justify-content:center;">
                <button type="button" class="btn btn-gold btn-lg" id="startReadingNowBtn" style="box-shadow:0 0 20px rgba(212,168,83,0.4);">🔮 立即前往測算</button>
              </div>
            </div>
          `;

          const closeSuccess = () => {
            backdrop.classList.remove('show', 'active');
          };

          card.querySelector('#closeSuccessModalBtn')?.addEventListener('click', closeSuccess);
          card.querySelector('#startReadingNowBtn')?.addEventListener('click', () => {
            closeSuccess();
            switchTab('hub');
          });

          backdrop.classList.add('show', 'active');
        }
      }

      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (paymentStatus === 'failed' || paymentStatus === 'error') {
      const msg = urlParams.get('msg') || '交易未完成或使用者取消';
      alert(`⚠️ 綠界扣款未完成：${decodeURIComponent(msg)}\n如扣款有異常，請隨時聯繫客服信箱 service@wen-xian-tan.com`);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  // 檢查 URL 中的 LINE 授權回傳
  function checkUrlForOAuthCallbacks() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');

    if (code) {
      const redirectUri = window.location.origin + window.location.pathname;
      MemberManager.handleLineCallback(code, redirectUri).then((res) => {
        if (res && res.success) {
          updateTopBarUserStatus();
          switchTab('member');
          if (typeof window.confetti === 'function') {
            window.confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
          }
        }
        window.history.replaceState({}, document.title, window.location.pathname);
      });
    }
  }

  // ============ 12. 全站條款彈窗點擊事件委派 ============
  document.addEventListener('click', (e) => {
    const link = e.target.closest('.legal-link');
    if (link) {
      e.preventDefault();
      const docType = link.dataset.doc || 'terms';
      showLegalModal(docType);
    }
  });

  // ============ Initialization ============
  renderThemesHub();
  updateTopBarUserStatus();
  ensurePalmCaptureDom();
  handlePaymentReturnFromUrl();
  checkUrlForOAuthCallbacks();
  loadGoogleGsiScript();
});
