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
import '../css/sapphire.css';
import './payment-sdk.js';
import { formatAdviceFromReport, pickReportObject } from '../../functions/lib/wxt/report-format.mjs';

/**
 * 問仙壇 · 掌心解碼 App - 核心應用邏輯與白話問卷引導引擎
 */
document.addEventListener('DOMContentLoaded', () => {
  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function createNonce() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `n_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function requireLogin() {
    if (MemberManager.isLoggedIn()) return true;
    switchTab('auth');
    return false;
  }

  async function refreshSessionUi() {
    await MemberManager.refreshMe();
    updateTopBarUserStatus();
    renderThemesHub();
    if (state.currentTab === 'member') renderMemberCenter();
    if (state.currentTab === 'auth') renderAuthPage();
    if (state.currentTab === 'history') renderHistoryReports();
  }

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
        palmDataUrl: null,
        palmImageBase64: '',
        palmConsent: false
      },
      isSubmitting: false,
      decodeToken: 0,
      progressTimer: null
    }
  };

  // ============ DOM Selectors ============
  const headerTabBtns = document.querySelectorAll('.app-tab-btn');
  const bottomTabBtns = document.querySelectorAll('.app-bottom-tab');
  const appViews = document.querySelectorAll('.app-view');
  const userTopBarBtn = document.getElementById('userTopBarBtn');

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
    if (state.wizard.progressTimer) {
      clearInterval(state.wizard.progressTimer);
      state.wizard.progressTimer = null;
    }
    state.wizard.isSubmitting = false;
    readingModalBackdrop.classList.remove('show', 'active');
  });

  // Stories View
  const storiesFilterGroup = document.getElementById('storiesFilterGroup');
  const storiesGrid = document.getElementById('storiesGrid');

  // History Reports View
  const historyReportsGrid = document.getElementById('historyReportsGrid');

  // ============ 1. Sapphire Motion System ============
  function initSapphireMotion() {
    const motionToggle = document.getElementById('motionToggle');
    let motionEnabled = true;
    const applyMotionMode = () => {
      document.documentElement.dataset.motion = motionEnabled ? 'full' : 'reduced';
      motionToggle?.setAttribute('aria-pressed', String(motionEnabled));
      motionToggle?.setAttribute('aria-label', `動畫特效：${motionEnabled ? '開' : '關'}`);
      const label = motionToggle?.querySelector('.motion-toggle__label');
      if (label) label.textContent = motionEnabled ? '動畫：開' : '動畫：關';
    };
    applyMotionMode();
    motionToggle?.addEventListener('click', () => {
      motionEnabled = !motionEnabled;
      applyMotionMode();
    });

    const starfield = document.getElementById('sapphireStarfield');

    if (starfield) {
      const starCount = window.matchMedia('(max-width: 620px)').matches ? 18 : 34;
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < starCount; i += 1) {
        const star = document.createElement('i');
        const size = 1 + Math.random() * 2.4;
        star.style.setProperty('--star-x', `${Math.random() * 100}%`);
        star.style.setProperty('--star-y', `${Math.random() * 100}%`);
        star.style.setProperty('--star-size', `${size}px`);
        star.style.setProperty('--star-delay', `${Math.random() * -8}s`);
        star.style.setProperty('--star-duration', `${5 + Math.random() * 8}s`);
        fragment.appendChild(star);
      }
      starfield.replaceChildren(fragment);
    }

    const heroArt = document.querySelector('[data-sapphire-tilt]');
    if (heroArt && window.matchMedia('(pointer:fine)').matches) {
      let frameId = 0;
      let targetX = 0;
      let targetY = 0;
      const renderTilt = () => {
        frameId = 0;
        heroArt.style.setProperty('--tilt-x', `${targetX.toFixed(2)}deg`);
        heroArt.style.setProperty('--tilt-y', `${targetY.toFixed(2)}deg`);
      };
      heroArt.addEventListener('pointermove', (event) => {
        const rect = heroArt.getBoundingClientRect();
        targetX = ((event.clientY - rect.top) / rect.height - 0.5) * -5;
        targetY = ((event.clientX - rect.left) / rect.width - 0.5) * 7;
        if (!frameId) frameId = window.requestAnimationFrame(renderTilt);
      });
      heroArt.addEventListener('pointerleave', () => {
        targetX = 0;
        targetY = 0;
        if (!frameId) frameId = window.requestAnimationFrame(renderTilt);
      });
    }

    document.getElementById('heroExploreBtn')?.addEventListener('click', () => {
      document.getElementById('themesMatrixGrid')?.scrollIntoView({ behavior: motionEnabled ? 'smooth' : 'auto' });
    });

    document.addEventListener('pointermove', (event) => {
      const target = event.target.closest('.sapphire-cta, .btn-gold, .theme-hub-card');
      if (!target) return;
      const rect = target.getBoundingClientRect();
      target.style.setProperty('--pointer-x', `${event.clientX - rect.left}px`);
      target.style.setProperty('--pointer-y', `${event.clientY - rect.top}px`);
    }, { passive: true });
  }

  initSapphireMotion();

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
        <span class="user-avatar-circle">${user.avatar ? `<img src="${escapeHtml(user.avatar)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : escapeHtml(user.name).slice(0, 1)}</span>
        <span>${escapeHtml(user.name)} ｜ 剩餘：<strong style="color:#FFF;">${totalPoints}</strong> 次</span>
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
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    readingModalCard.innerHTML = `
      <div class="otp-dialog-shell">
        <div class="otp-dialog-icon" aria-hidden="true">✉️</div>
        <h3 class="otp-dialog-title">Email 驗證</h3>

        <ol class="auth-step-bar" aria-label="驗證步驟">
          <li class="auth-step-item done"><span class="auth-step-num">1</span>填信箱</li>
          <li class="auth-step-item active"><span class="auth-step-num">2</span>等信</li>
          <li class="auth-step-item"><span class="auth-step-num">3</span>輸入碼</li>
        </ol>

        <p class="otp-dialog-subtitle">
          驗證碼只會寄到 <span class="otp-target-email-badge">${escapeHtml(cleanEmail)}</span>，請到信箱查看並手動輸入 6 位數字。
        </p>

        <div id="otpStatusLoading" class="otp-status-loading">
          <div class="otp-spinner" aria-hidden="true"></div>
          正在寄送驗證碼，請稍候…
        </div>

        <form id="otpVerifyForm" style="display:none;">
          <div class="otp-inputs-grid" id="otpInputsGrid" role="group" aria-label="6 位數驗證碼">
            <input type="text" maxlength="1" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" class="otp-digit-field" data-index="0" aria-label="第 1 碼" autofocus>
            <input type="text" maxlength="1" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" class="otp-digit-field" data-index="1" aria-label="第 2 碼">
            <input type="text" maxlength="1" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" class="otp-digit-field" data-index="2" aria-label="第 3 碼">
            <input type="text" maxlength="1" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" class="otp-digit-field" data-index="3" aria-label="第 4 碼">
            <input type="text" maxlength="1" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" class="otp-digit-field" data-index="4" aria-label="第 5 碼">
            <input type="text" maxlength="1" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" class="otp-digit-field" data-index="5" aria-label="第 6 碼">
          </div>

          <div class="otp-resend-bar">
            <span>驗證碼效期：10 分鐘</span>
            <div>
              <span id="otpCountdownBox">重發倒數：<strong class="otp-countdown-tag" id="otpTimerCount">60</strong> 秒</span>
              <button type="button" class="otp-btn-resend" id="otpResendBtn" style="display:none;">重新寄送驗證碼</button>
            </div>
          </div>

          <div id="otpErrorAlert" class="otp-error-alert" style="display:none;" role="alert"></div>

          <div style="display:flex; gap:10px;">
            <button type="submit" class="btn btn-gold" id="otpSubmitBtn" style="flex:1;">
              驗證並登入
            </button>
            <button type="button" class="btn btn-outline" id="otpCancelBtn" style="width:84px;">
              取消
            </button>
          </div>

        </form>
      </div>
    `;

    readingModalBackdrop.classList.add('show');

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
      if (loadingEl) loadingEl.style.display = 'block';
      if (formEl) formEl.style.display = 'none';

      const res = await MemberManager.requestEmailVerificationCode(cleanEmail, purpose);

      if (loadingEl) loadingEl.style.display = 'none';
      if (formEl) formEl.style.display = 'block';

      if (res.success || res.ok) {
        startCountdown();
        document.querySelectorAll('.auth-step-item').forEach((el, idx) => {
          el.classList.toggle('done', idx <= 1);
          el.classList.toggle('active', idx === 2);
        });

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
        submitBtn.textContent = '驗證中…';
      }

      const verifyRes = await MemberManager.verifyEmailCode(cleanEmail, fullCode);

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '驗證並登入';
      }

      if (verifyRes.success) {
        if (otpCooldownTimer) clearInterval(otpCooldownTimer);
        readingModalBackdrop.classList.remove('show');
        if (!prefersReducedMotion && typeof window.confetti === 'function') {
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
          errorEl.textContent = verifyRes.message || '驗證碼錯誤或已過期，請重新取得';
          errorEl.style.display = 'block';
        }
      }
    });
  }

  async function openLineAuthDialog() {
    const res = await MemberManager.startLineLogin();
    if (!res.ok) alert(res.message || '無法開始 LINE 登入');
  }

  async function openGoogleAuthDialog() {
    const res = await MemberManager.startGoogleLogin();
    if (!res.ok) alert(res.message || '無法開始 Google 登入');
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

    const devLoginSection = `
      <div class="auth-divider">
        <span>測試帳號登入（開發用）</span>
      </div>

      <form id="devLoginForm" style="display:grid;gap:14px;">
        <div class="auth-form-group">
          <label class="auth-form-label" for="devLoginUsername">帳號：</label>
          <input type="text" id="devLoginUsername" class="auth-form-input" placeholder="帳號" value="user" autocomplete="username">
        </div>
        <div class="auth-form-group">
          <label class="auth-form-label" for="devLoginPassword">密碼：</label>
          <input type="password" id="devLoginPassword" class="auth-form-input" placeholder="密碼" value="user123" autocomplete="current-password">
        </div>
        <div id="devLoginError" style="display:none;color:#EF4444;font-size:0.85rem;"></div>
        <button type="submit" class="btn btn-outline" style="width:100%;">測試帳號登入</button>
      </form>
    `;

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
              <div class="auth-current-user-avatar">${currentUser.avatar ? `<img src="${escapeHtml(currentUser.avatar)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : escapeHtml(currentUser.name).slice(0, 1)}</div>
              <div>
                <div style="font-weight:800;font-size:1.05rem;color:#FFF;display:flex;align-items:center;gap:6px;">
                  <span>${escapeHtml(currentUser.name)}</span>
                </div>
                <div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px;">
                  ${currentUser.provider === 'line' ? 'LINE 帳號' : currentUser.provider === 'google' ? 'Google 帳號' : '信箱帳號'} ｜ ${escapeHtml(currentUser.email)}
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
        <span>或使用 Email 驗證碼登入</span>
      </div>

      <!-- Email OTP 表單 -->
      <div class="auth-tabs-row">
        <button type="button" class="auth-tab-btn ${formMode === 'login' ? 'active' : ''}" id="authPageTabLogin">信士登入</button>
        <button type="button" class="auth-tab-btn ${formMode === 'register' ? 'active' : ''}" id="authPageTabRegister">免費註冊</button>
      </div>

      <ol class="auth-step-bar auth-step-bar--compact" aria-label="登入步驟">
        <li class="auth-step-item active"><span class="auth-step-num">1</span>填信箱</li>
        <li class="auth-step-item"><span class="auth-step-num">2</span>等信</li>
        <li class="auth-step-item"><span class="auth-step-num">3</span>輸入碼</li>
      </ol>

      <form id="authPageForm" style="display:grid;gap:14px;">
        ${formMode === 'register' ? `
          <div class="auth-form-group">
            <label class="auth-form-label" for="pageAuthNameInput">信士尊姓大名：</label>
            <input type="text" id="pageAuthNameInput" class="auth-form-input" placeholder="例如：您的稱呼" required>
          </div>
        ` : ''}

        <div class="auth-form-group">
          <label class="auth-form-label" for="pageAuthEmailInput">電子信箱：</label>
          <input type="email" id="pageAuthEmailInput" class="auth-form-input" placeholder="name@example.com" required>
          <p class="auth-form-hint">送出後，驗證碼只會寄到該信箱，需手動輸入才能登入。</p>
        </div>

        <div style="display:flex;gap:10px;">
          <button type="submit" class="btn btn-gold" style="flex:1;">
            ${formMode === 'login' ? '寄送登入驗證碼' : '寄送註冊驗證碼'}
          </button>
        </div>
      </form>

      ${devLoginSection}

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
    document.getElementById('authLogoutBtn')?.addEventListener('click', async () => {
      await MemberManager.logout();
      updateTopBarUserStatus();
      renderAuthPage();
    });

    document.getElementById('authPageForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('pageAuthEmailInput').value.trim();
      const name = document.getElementById('pageAuthNameInput')?.value.trim() || '';
      openEmailVerifyDialog(email, formMode, name);
    });

    document.getElementById('devLoginForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('devLoginUsername').value.trim();
      const password = document.getElementById('devLoginPassword').value;
      const errorEl = document.getElementById('devLoginError');
      const btn = e.target.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = '登入中…'; }
      const res = await MemberManager.devLogin(username, password);
      if (btn) { btn.disabled = false; btn.textContent = '測試帳號登入'; }
      if (res.success) {
        updateTopBarUserStatus();
        switchTab('member');
      } else {
        if (errorEl) { errorEl.textContent = res.message; errorEl.style.display = 'block'; }
      }
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
              <div class="member-large-avatar">${user.avatar ? `<img src="${escapeHtml(user.avatar)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : escapeHtml(user.name).slice(0, 1)}</div>
              <div class="member-info-col">
                <h3>
                  <span>${escapeHtml(user.name)}</span>
                </h3>
                <div class="member-email-text">${escapeHtml(user.email)}</div>
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
            if (!requireLogin()) return;
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
    if (!requireLogin()) return;
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
    const agreed = Boolean(document.getElementById('agreeTermsCheckbox')?.checked);
    if (confirmPurchaseBtn) {
      confirmPurchaseBtn.disabled = !isValid || !agreed;
      if (!agreed) {
        confirmPurchaseBtn.textContent = '請先勾選同意服務條款與隱私權政策';
      } else if (!isValid) {
        confirmPurchaseBtn.textContent = `請先選滿 ${plan.requiredCount} 個主題（目前已選 ${state.customChosenThemes.size} 項）`;
      } else {
        confirmPurchaseBtn.textContent = `前往綠界安全支付 NT$ ${plan.price} →`;
      }
    }

    if (themePickerCountEl) {
      themePickerCountEl.textContent = `（已選 ${state.customChosenThemes.size} 項／需要 ${plan.requiredCount} 項）`;
    }
  }

  if (typeof window !== 'undefined' && window.PaymentSDK) {
    window.PaymentSDK.init({ serverUrl: '' });
  }

  document.getElementById('agreeTermsCheckbox')?.addEventListener('change', () => {
    updateCheckoutSummary();
  });

  function triggerEcpayCheckout(plan, chosenThemes, onCustomSuccess) {
    if (!requireLogin()) return;

    const themeTitles = chosenThemes
      .map((id) => THEMES.find((t) => t.id === id)?.name || id)
      .join('、');

    if (!window.PaymentSDK) {
      alert('金流模組載入中，請稍候重試');
      return;
    }

    PaymentSDK.openCheckout({
      productId: plan.id,
      planId: plan.id,
      planName: `問仙壇 · ${plan.label} (${themeTitles})`,
      displayPrice: plan.price,
      themeKeys: chosenThemes,
      onSuccess: async (order) => {
        await MemberManager.refreshMe();
        renderThemesHub();
        renderMemberCenter();
        updateTopBarUserStatus();
        if (typeof onCustomSuccess === 'function') {
          onCustomSuccess(order);
        } else {
          showPaymentConfirmModal(order);
        }
      },
      onError: (err) => {
        if (err && err.message === 'UNAUTHENTICATED') switchTab('auth');
      }
    });
  }

  function showPaymentConfirmModal(order) {
    const backdrop = document.getElementById('readingModalBackdrop');
    const card = document.getElementById('readingModalCard');
    if (!backdrop || !card) return;
    const credits = WalletManager.getPoints();
    const total = Object.values(credits).reduce((sum, n) => sum + Number(n || 0), 0);
    card.innerHTML = `
      <div class="wizard-header" style="border-bottom:1px solid var(--border-gold);padding-bottom:14px;margin-bottom:16px;">
        <div class="wizard-title-row">
          <h3 style="display:flex;align-items:center;gap:8px;color:#34D399;font-size:1.25rem;">
            <span>✓</span> 已向伺服器確認點數
          </h3>
          <button type="button" class="btn btn-outline btn-sm" id="closePaymentSuccessBtn" style="padding:4px 10px;">✕ 關閉</button>
        </div>
      </div>
      <div style="text-align:center;padding:10px 0 20px;">
        <p style="color:var(--text-secondary);font-size:0.92rem;line-height:1.6;max-width:440px;margin:0 auto 16px;">
          目前帳號剩餘測算次數合計 <strong>${total}</strong> 次。點數以伺服器為準。
        </p>
        <div style="font-size:0.8rem;color:var(--text-muted);">訂單：${escapeHtml(order && (order.id || order.merchantTradeNo) || '')}</div>
        <div style="margin-top:24px;display:flex;gap:12px;justify-content:center;">
          <button type="button" class="btn btn-gold btn-lg" id="startReadingNowBtn">前往測算</button>
        </div>
      </div>
    `;
    const closeSuccess = () => backdrop.classList.remove('show', 'active');
    card.querySelector('#closePaymentSuccessBtn')?.addEventListener('click', closeSuccess);
    card.querySelector('#startReadingNowBtn')?.addEventListener('click', () => {
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

      if (!requireLogin()) return;
      triggerEcpayCheckout(plan, chosenArray);
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
    if (!requireLogin()) return;
    if (WalletManager.getThemePoints(themeId) < 1) {
      handleThemeClick(themeId);
      return;
    }
    const relConf = THEME_RELATION_CONFIG[themeId] || THEME_RELATION_CONFIG.love;
    const roleConf = THEME_ROLE_CONFIG[themeId] || THEME_ROLE_CONFIG.love;

    state.wizard.activeThemeId = themeId;
    state.wizard.currentStep = 1;
    state.wizard.totalSteps = 7;
    state.wizard.isSubmitting = false;
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
      palmDataUrl: null,
      palmImageBase64: '',
      palmConsent: false
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
          <label style="display:flex;align-items:flex-start;gap:8px;margin-top:14px;font-size:0.82rem;color:var(--text-secondary);line-height:1.55;cursor:pointer;">
            <input type="checkbox" id="wizardPalmConsent" ${answers.palmConsent ? 'checked' : ''} style="margin-top:3px;accent-color:var(--gold-bright);">
            <span>我同意將掌紋影像送 AI 分析，分析完成後不保存原圖。未勾選不能上傳或送出照片；略過拍照仍可繼續。</span>
          </label>
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

    if (currentStep === 5) {
      return String(answers.question || '').trim().length > 0;
    }

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
          updateNextBtnState();
        });
      }

      readingModalCard.querySelectorAll('[data-prompt-text]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const text = btn.dataset.promptText;
          if (textarea) {
            textarea.value = text.slice(0, 500);
            answers.question = textarea.value;
            updateCounter();
            updateNextBtnState();
          }
        });
      });
    }

    if (currentStep === 7) {
      const targetHand = answers.gender === 'female' ? 'right' : 'left';
      const consentBox = document.getElementById('wizardPalmConsent');
      if (consentBox) {
        consentBox.checked = Boolean(answers.palmConsent);
        consentBox.addEventListener('change', () => {
          answers.palmConsent = consentBox.checked;
        });
      }

      const requirePalmConsent = () => {
        answers.palmConsent = Boolean(document.getElementById('wizardPalmConsent')?.checked);
        if (answers.palmConsent) return true;
        alert('要上傳或送出掌紋照片，請先勾選同意將影像送 AI 分析。若不想拍照，請改點略過。');
        return false;
      };

      document.getElementById('wizardOpenCameraBtn')?.addEventListener('click', () => {
        if (!requirePalmConsent()) return;
        openCamera(targetHand);
      });

      document.getElementById('wizardOpenAlbumBtn')?.addEventListener('click', () => {
        if (!requirePalmConsent()) return;
        openFilePicker(targetHand);
      });

      document.getElementById('wizardRetakePalmBtn')?.addEventListener('click', () => {
        if (!requirePalmConsent()) return;
        openCamera(targetHand);
      });

      document.getElementById('wizardChangeAlbumBtn')?.addEventListener('click', () => {
        if (!requirePalmConsent()) return;
        openFilePicker(targetHand);
      });

      const skipBtn = document.getElementById('wizardSkipPalmBtn');
      if (skipBtn) {
        skipBtn.addEventListener('click', () => {
          answers.palmDataUrl = null;
          answers.palmImageBase64 = '';
          executeDecodingFlow({ skipPalm: true });
        });
      }

      const submitBtn = document.getElementById('wizardSubmitBtn');
      if (submitBtn) {
        submitBtn.addEventListener('click', () => {
          if (answers.palmDataUrl || answers.palmImageBase64) {
            if (!requirePalmConsent()) return;
          }
          executeDecodingFlow({ skipPalm: false });
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

  function executeDecodingFlow(options = {}) {
    if (state.wizard.isSubmitting) return;
    if (!requireLogin()) {
      state.wizard.isSubmitting = false;
      return;
    }

    const { activeThemeId, answers } = state.wizard;
    const themeObj = THEMES.find((t) => t.id === activeThemeId) || THEMES[0];
    const themeName = themeObj.name;
    const skipPalm = Boolean(options.skipPalm);
    const liveBase64 = window.KaiyunPalmCapture && window.KaiyunPalmCapture.lastBase64;
    if (liveBase64) answers.palmImageBase64 = liveBase64;

    const sendPalm = !skipPalm && Boolean(answers.palmConsent) && Boolean(answers.palmImageBase64);
    if (!skipPalm && (answers.palmDataUrl || answers.palmImageBase64) && !answers.palmConsent) {
      alert('要送出掌紋照片，請先勾選同意。若不想送出，請改點略過拍照。');
      return;
    }
    if (WalletManager.getThemePoints(activeThemeId) < 1) {
      triggerEcpayCheckout(
        { id: 'single', label: `單項方案【${themeName}】`, price: 199, requiredCount: 1 },
        [activeThemeId]
      );
      return;
    }

    state.wizard.isSubmitting = true;
    const myDecodeToken = ++state.wizard.decodeToken;
    const hasPalm = sendPalm;

    try {
      const themeObj = THEMES.find((t) => t.id === activeThemeId) || THEMES[0];
      const themeName = themeObj.name;

      readingModalCard.innerHTML = `
        <div class="ritual-stage-container">
          <div class="ritual-orb" aria-hidden="true">
            <div class="ritual-orb-ring"></div>
            <span class="ritual-censer-icon">${hasPalm ? '✋' : '🔮'}</span>
          </div>
          <h3 class="ritual-title" id="ritualStageTitle">開壇定壇 · 仙佛降臨</h3>
          <p class="ritual-subtitle" id="ritualStageSub">恭請仙佛降臨壇前，調閱信士生辰因果簿...</p>

          <div class="ritual-stepper" role="list" aria-label="測算進度">
            <div class="ritual-step-node active" id="ritualStep1" role="listitem">
              <div class="ritual-step-circle">1</div>
              <span class="ritual-step-label">開壇調閱</span>
            </div>
            <div class="ritual-step-node" id="ritualStep2" role="listitem">
              <div class="ritual-step-circle">2</div>
              <span class="ritual-step-label">${hasPalm ? '掌紋對照' : '問答解析'}</span>
            </div>
            <div class="ritual-step-node" id="ritualStep3" role="listitem">
              <div class="ritual-step-circle">3</div>
              <span class="ritual-step-label">靈犀解構</span>
            </div>
            <div class="ritual-step-node" id="ritualStep4" role="listitem">
              <div class="ritual-step-circle">4</div>
              <span class="ritual-step-label">天書顯化</span>
            </div>
          </div>

          <div class="ritual-progress-meta">
            <span>目前進度</span>
            <span id="decodingProgressLabel" aria-live="polite">18%</span>
          </div>
          <div class="decoding-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="18">
            <div class="decoding-progress-fill" id="decodingProgress" style="width:18%;"></div>
          </div>
        </div>
      `;

      const ritualTitle = document.getElementById('ritualStageTitle');
      const ritualSub = document.getElementById('ritualStageSub');
      const progressFill = document.getElementById('decodingProgress');
      const progressLabel = document.getElementById('decodingProgressLabel');
      const progressBar = readingModalCard.querySelector('.decoding-progress-bar');
      const step1 = document.getElementById('ritualStep1');
      const step2 = document.getElementById('ritualStep2');
      const step3 = document.getElementById('ritualStep3');
      const step4 = document.getElementById('ritualStep4');

      const ritualStages = [
        {
          pct: 22,
          title: '開壇定壇 · 仙佛降臨',
          sub: '恭請仙佛降臨壇前，調閱信士生辰因果簿...',
          activate: [step1]
        },
        {
          pct: 48,
          title: hasPalm ? `掌心對照 · 【${themeName}】` : `問答解析 · 【${themeName}】`,
          sub: hasPalm
            ? `正在把掌紋影像送出分析...`
            : `正在依您填寫的問答整理解析...`,
          activate: [step1, step2]
        },
        {
          pct: 68,
          title: '靈犀感知 · 剖析叩問煩惱',
          sub: `深度透視信士所求之因果病灶與轉折契機...`,
          activate: [step1, step2, step3]
        },
        {
          pct: 100,
          title: '天書顯化 · 專屬 AI 報告生成',
          sub: '專屬解惑指引已排盤完畢，即將為信士揭曉天機...',
          activate: [step1, step2, step3, step4]
        }
      ];

      let waitTick = null;
      function setProgressPct(pct) {
        const shown = Math.max(0, Math.min(100, Math.round(pct)));
        if (progressFill) progressFill.style.width = `${shown}%`;
        if (progressLabel) progressLabel.textContent = `${shown}%`;
        if (progressBar) progressBar.setAttribute('aria-valuenow', String(shown));
      }

      function setStage(idx) {
        if (!ritualStages[idx]) return;
        const s = ritualStages[idx];
        if (ritualTitle) ritualTitle.textContent = s.title;
        if (ritualSub) ritualSub.textContent = s.sub;
        setProgressPct(s.pct);
        [step1, step2, step3, step4].forEach((el) => {
          if (!el) return;
          if (s.activate.includes(el)) {
            el.classList.add('active');
            if (s.activate.indexOf(el) < s.activate.length - 1) el.classList.add('done');
          }
        });
      }

      function startWaitingProgress() {
        if (waitTick) return;
        const started = Date.now();
        waitTick = setInterval(() => {
          const elapsed = Date.now() - started;
          const pct = 68 + 24 * (1 - Math.exp(-elapsed / 35000));
          setProgressPct(pct);
        }, 400);
        state.wizard.progressTimer = waitTick;
      }

      function stopWaitingProgress() {
        if (waitTick) {
          clearInterval(waitTick);
          waitTick = null;
        }
        if (state.wizard.progressTimer) {
          clearInterval(state.wizard.progressTimer);
          state.wizard.progressTimer = null;
        }
      }

      setStage(0);
      const stageTimer1 = setTimeout(() => setStage(1), 800);
      const stageTimer2 = setTimeout(() => {
        setStage(2);
        startWaitingProgress();
      }, 1800);

      // 非同步請求後端 AI 生成 API
      const payload = {
        themeId: activeThemeId,
        answers: {
          gender: answers.gender,
          genderCustom: answers.genderCustom,
          age: answers.age,
          ageCustom: answers.ageCustom,
          relation: answers.relation,
          relationCustom: answers.relationCustom,
          role: answers.role,
          roleCustom: answers.roleCustom,
          question: answers.question,
          goal: answers.goal,
          goalCustom: answers.goalCustom,
          relationLabel: answers.relationCustom || (THEME_RELATION_CONFIG[activeThemeId]?.options.find(r => r.id === answers.relation)?.label || answers.relation),
          roleLabel: answers.roleCustom || (THEME_ROLE_CONFIG[activeThemeId]?.options.find(r => r.id === answers.role)?.label || answers.role),
          goalLabel: answers.goalCustom || (answers.goal === 'skip' ? '略過' : (DESIRED_OUTCOMES.find(g => g.id === answers.goal)?.label || answers.goal)),
          userName: (MemberManager.getCurrentUser() && MemberManager.getCurrentUser().name) || '信士'
        },
        nonce: createNonce()
      };
      if (sendPalm) {
        payload.palmImageBase64 = answers.palmImageBase64;
      }

      fetch('/api/reading/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        return { res, data };
      })
      .then(async ({ res, data }) => {
        clearTimeout(stageTimer1);
        clearTimeout(stageTimer2);
        stopWaitingProgress();
        const stillCurrent = state.wizard.decodeToken === myDecodeToken;
        await MemberManager.refreshMe();
        renderThemesHub();
        renderMemberCenter();
        updateTopBarUserStatus();

        if (res.status === 401 || data.error === 'UNAUTHENTICATED') {
          state.wizard.isSubmitting = false;
          if (stillCurrent) {
            readingModalBackdrop.classList.remove('show');
            switchTab('auth');
          }
          return;
        }
        if (!res.ok || data.ok === false || data.error) {
          state.wizard.isSubmitting = false;
          if (stillCurrent) {
            const msg = data.error === 'INSUFFICIENT_CREDITS' || data.error === 'NO_CREDITS'
              ? '此篇章次數不足，請先購買後再試'
              : (data.message || data.error || '報告產生失敗，請稍後再試');
            alert(msg);
            if (data.error === 'INSUFFICIENT_CREDITS' || data.error === 'NO_CREDITS') {
              triggerEcpayCheckout(
                { id: 'single', label: `單項方案【${themeName}】`, price: 199, requiredCount: 1 },
                [activeThemeId]
              );
            } else {
              renderWizardStep();
            }
          }
          return;
        }

        setStage(2);
        setTimeout(() => {
          setStage(3);
          setTimeout(() => {
            try {
              showDecodedReport(activeThemeId, answers, stillCurrent, data);
            } finally {
              state.wizard.isSubmitting = false;
            }
          }, 400);
        }, 400);
      })
      .catch(() => {
        clearTimeout(stageTimer1);
        clearTimeout(stageTimer2);
        stopWaitingProgress();
        state.wizard.isSubmitting = false;
        if (state.wizard.decodeToken === myDecodeToken) {
          alert('目前連不上伺服器，報告尚未產生，點數以伺服器為準');
          renderWizardStep();
        }
      });
    } catch (err) {
      state.wizard.isSubmitting = false;
      if (typeof stopWaitingProgress === 'function') stopWaitingProgress();
      if (state.wizard.decodeToken === myDecodeToken) {
        alert('報告尚未產生，請稍後再試');
        renderWizardStep();
      }
    }
  }

  function showDecodedReport(themeId, answers, renderIntoModal = true, apiResult = null) {
    const theme = THEMES.find((t) => t.id === themeId) || THEMES[0];
    const hasPalm = Boolean(answers.palmDataUrl || answers.palmImageBase64);

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

    const reportObj = pickReportObject(apiResult);
    const adviceText = formatAdviceFromReport(reportObj);
    const finalThemeTitle = reportObj.title || (hasPalm ? theme.title : (theme.titleNoPalm || theme.title));
    const finalTurnaround = reportObj.turnaroundYear || '';
    const finalNoble = reportObj.nobleGuide || '';
    const finalDimLabel = reportObj.fourthDimensionLabel || (hasPalm ? theme.fourthDimWithPalm : theme.fourthDimNoPalm);
    const finalDimVal = reportObj.fourthDimensionValue || '';

    const reportData = {
      id: apiResult?.id || reportObj.id,
      themeId,
      themeName: theme.name,
      title: finalThemeTitle,
      gender: genderLabel,
      age: ageLabel,
      relation: relationLabel,
      role: roleLabel,
      goal: goalLabel,
      question: answers.question || reportObj.question || '',
      turnaroundYear: finalTurnaround,
      nobleGuide: finalNoble,
      fourthDimensionLabel: finalDimLabel,
      fourthDimensionValue: finalDimVal,
      advice: adviceText,
      hasPalm: Boolean(hasPalm || apiResult?.has_palm || apiResult?.hasPalm || reportObj.has_palm || reportObj.hasPalm),
      matchedStories
    };

    if (!renderIntoModal) return;

    const dimCards = [];
    if (reportData.turnaroundYear) {
      dimCards.push(`<div class="report-dim-card"><div class="report-dim-label">關鍵轉折</div><div class="report-dim-val" style="font-size:0.95rem;">${escapeHtml(reportData.turnaroundYear)}</div></div>`);
    }
    if (reportData.nobleGuide) {
      dimCards.push(`<div class="report-dim-card"><div class="report-dim-label">貴人特徵與方位</div><div class="report-dim-val" style="font-size:0.88rem;">${escapeHtml(reportData.nobleGuide)}</div></div>`);
    }
    if (reportData.fourthDimensionValue) {
      dimCards.push(`<div class="report-dim-card"><div class="report-dim-label">${escapeHtml(reportData.fourthDimensionLabel)}</div><div class="report-dim-val" style="font-size:0.88rem;">${escapeHtml(reportData.fourthDimensionValue)}</div></div>`);
    }

    readingModalCard.innerHTML = `
      <div class="report-content-box">
        <div class="report-header-badge">
          <span style="font-size:0.75rem;font-weight:800;color:var(--gold-bright);border:1px solid var(--border-gold);padding:3px 10px;border-radius:999px;">
            ✦ 解析報告 ✦
          </span>
          <h2 style="margin-top:10px;color:var(--gold-gradient);">${escapeHtml(theme.name)} · ${escapeHtml(reportData.title)}</h2>
          <div style="font-size:0.8rem;color:var(--text-gold);margin-top:4px;">
            ${escapeHtml(reportData.gender)} ｜ ${escapeHtml(reportData.age)} ｜ 稱謂：${escapeHtml(reportData.relation)} ｜ 狀態：${escapeHtml(reportData.role)} ｜ ${reportData.hasPalm ? '已含掌紋分析' : '本次未送出掌紋'}
          </div>
        </div>

        ${dimCards.length ? `<div class="report-dimension-grid">${dimCards.join('')}</div>` : ''}

        <div class="report-advice-box">
          <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:8px;border-bottom:1px dashed var(--border);padding-bottom:8px;">
            <div><strong>本次問題：</strong> ${escapeHtml(reportData.question)}</div>
            <div style="margin-top:4px;color:var(--text-gold);"><strong>期望：</strong> ${escapeHtml(reportData.goal)}</div>
          </div>
          <div style="line-height:1.75;white-space:pre-wrap;">${escapeHtml(reportData.advice || '報告內容尚未回傳，請稍後到歷史紀錄簿查看。')}</div>
        </div>

        <div class="report-manifestation-section">
          <div class="manifestation-header">
            <span class="manifestation-tag">✦ 相關見證 ✦</span>
            <h4>與這次問題較相近的公開見證：</h4>
          </div>
          <div class="manifestation-cards-list">
            ${reportData.matchedStories.map((story) => `
              <div class="manifestation-story-card">
                <div class="story-card-meta">
                  <span class="story-card-title">${escapeHtml(story.title)}</span>
                  <span class="story-card-user">${escapeHtml(story.name)} · ${escapeHtml(story.category)}</span>
                </div>
                <div class="story-card-summary">${escapeHtml(story.summary)}</div>
                <div class="story-card-result-badge">✓ ${escapeHtml(story.result)}</div>
                <details class="story-full-details">
                  <summary>展開完整見證</summary>
                  <p style="margin-top:8px;font-size:0.84rem;line-height:1.75;color:var(--text-muted);white-space:pre-wrap;">${escapeHtml(story.full)}</p>
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

    document.getElementById('closeReportBtn')?.addEventListener('click', () => {
      readingModalBackdrop.classList.remove('show');
    });

    document.getElementById('viewAllReportsBtn')?.addEventListener('click', () => {
      readingModalBackdrop.classList.remove('show');
      switchTab('history');
    });

    readingModalBackdrop.classList.add('show');
  }

  function historyQuestion(item) {
    return item?.answers?.question || item?.question || item?.report?.question || '';
  }

  function historyThemeId(item) {
    return item?.themeId || item?.theme_id || item?.report?.themeId || 'love';
  }

  function historyDate(item) {
    return item?.created_at || item?.createdAt || item?.date || '';
  }

  async function renderHistoryReports() {
    if (!historyReportsGrid) return;
    historyReportsGrid.replaceChildren();

    if (!MemberManager.isLoggedIn()) {
      const empty = document.createElement('div');
      empty.style.cssText = 'text-align:center;padding:40px;color:var(--text-muted);grid-column:1/-1;';
      empty.textContent = '請先登入後查看伺服器上的歷史報告。';
      historyReportsGrid.appendChild(empty);
      return;
    }

    const list = await WalletManager.fetchReports();
    if (!list.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'text-align:center;padding:40px;color:var(--text-muted);grid-column:1/-1;';
      empty.textContent = '尚無測算紀錄。';
      historyReportsGrid.appendChild(empty);
      return;
    }

    list.forEach((item) => {
      const themeId = historyThemeId(item);
      const theme = THEMES.find((t) => t.id === themeId);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'theme-hub-card';
      card.style.textAlign = 'left';
      card.style.cursor = 'pointer';

      const title = document.createElement('h4');
      title.style.color = 'var(--gold-bright)';
      title.textContent = theme ? theme.name : (item.themeName || themeId);

      const dateEl = document.createElement('span');
      dateEl.style.cssText = 'font-size:0.75rem;color:var(--text-muted);';
      const rawDate = historyDate(item);
      dateEl.textContent = rawDate ? new Date(rawDate).toLocaleDateString('zh-TW') : '';

      const qEl = document.createElement('div');
      qEl.style.cssText = 'font-size:0.82rem;color:var(--text-gold);font-weight:700;margin-top:8px;';
      const q = historyQuestion(item);
      qEl.textContent = q ? `問題：${q.slice(0, 80)}` : '點擊查看完整報告';

      card.appendChild(title);
      card.appendChild(dateEl);
      card.appendChild(qEl);
      card.addEventListener('click', () => {
        const answers = item.answers || { question: q };
        showDecodedReport(themeId, answers, true, item);
      });
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
    if (!e.detail) return;
    if (e.detail.previewUrl) state.wizard.answers.palmDataUrl = e.detail.previewUrl;
    if (e.detail.palmImageBase64) state.wizard.answers.palmImageBase64 = e.detail.palmImageBase64;
    if (readingModalBackdrop.classList.contains('show') && state.wizard.currentStep === 7) {
      renderWizardStep();
    }
  });

  document.addEventListener('kaiyun-palm-cleared', () => {
    state.wizard.answers.palmDataUrl = null;
    state.wizard.answers.palmImageBase64 = '';
    if (readingModalBackdrop.classList.contains('show') && state.wizard.currentStep === 7) {
      renderWizardStep();
    }
  });

  function showServerConfirmModal(message) {
    const backdrop = document.getElementById('readingModalBackdrop');
    const card = document.getElementById('readingModalCard');
    if (!backdrop || !card) return;
    card.replaceChildren();
    const wrap = document.createElement('div');
    wrap.style.cssText = 'text-align:center;padding:28px 16px;';
    const p = document.createElement('p');
    p.style.cssText = 'color:var(--text-secondary);font-size:0.95rem;line-height:1.7;';
    p.textContent = message;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-gold';
    btn.style.marginTop = '18px';
    btn.textContent = '關閉';
    btn.addEventListener('click', () => backdrop.classList.remove('show', 'active'));
    wrap.appendChild(p);
    wrap.appendChild(btn);
    card.appendChild(wrap);
    backdrop.classList.add('show', 'active');
  }

  async function handlePaymentReturnFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    const orderId = urlParams.get('order');
    if (!paymentStatus && !orderId) return;

    if (paymentStatus === 'failed' || paymentStatus === 'error') {
      const msg = urlParams.get('msg') || '交易未完成或已取消';
      alert(`綠界扣款未完成：${decodeURIComponent(msg)}`);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    showServerConfirmModal('正在向伺服器確認點數，請稍候...');
    await MemberManager.refreshMe();
    renderThemesHub();
    renderMemberCenter();
    updateTopBarUserStatus();
    showServerConfirmModal('已向伺服器確認目前點數。點數不會依網址參數增加。');
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  async function handleAuthReturnFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('auth') !== 'ok') return;
    await MemberManager.refreshMe();
    updateTopBarUserStatus();
    if (MemberManager.isLoggedIn()) switchTab('member');
    window.history.replaceState({}, document.title, window.location.pathname);
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

  (async () => {
    await MemberManager.refreshMe();
    renderThemesHub();
    updateTopBarUserStatus();
    ensurePalmCaptureDom();
    await handleAuthReturnFromUrl();
    await handlePaymentReturnFromUrl();
    if (state.currentTab === 'history') renderHistoryReports();
  })();
});
