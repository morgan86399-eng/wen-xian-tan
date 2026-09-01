import {
  THEMES,
  PLANS,
  GENDER_OPTIONS,
  AGE_OPTIONS,
  THEME_RELATION_CONFIG,
  THEME_ROLE_CONFIG,
  ROLE_OPTIONS,
  DESIRED_OUTCOMES,
  PORTRAIT_ASSETS,
  MANIFESTATION_STORIES
} from './data.js';
import { WalletManager } from './wallet.js';
import { MemberManager } from './member.js';
import { openCamera, openFilePicker, ensurePalmCaptureDom } from './palm_capture.js';
import { showLegalModal } from './legal.js';

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
        goal: 'timing',
        goalCustom: '',
        palmDataUrl: null
      }
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

    if (tabId === 'member') {
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
      userTopBarBtn.innerHTML = `
        <span class="user-avatar-circle">${user.name.slice(0, 1)}</span>
        <span>${user.name} ｜ 🪙 剩餘測算次數：<strong style="color:#FFF;">${totalPoints}</strong> 次</span>
      `;
      userTopBarBtn.onclick = () => switchTab('member');
    } else {
      userTopBarBtn.innerHTML = `
        <span>👤 登入 / 註冊</span>
      `;
      userTopBarBtn.onclick = () => openAuthModal();
    }
  }

  // ============ 4. Auth Modal (登入/註冊彈窗 - 白話) ============
  function openAuthModal(defaultMode = 'login') {
    readingModalCard.innerHTML = `
      <div style="max-width:440px;margin:0 auto;">
        <div class="auth-tabs-row">
          <button type="button" class="auth-tab-btn ${defaultMode === 'login' ? 'active' : ''}" id="authTabLogin">登入帳號</button>
          <button type="button" class="auth-tab-btn ${defaultMode === 'register' ? 'active' : ''}" id="authTabRegister">免費註冊</button>
        </div>

        <form id="authModalForm" style="display:grid;gap:14px;">
          ${defaultMode === 'register' ? `
            <div class="auth-form-group">
              <label class="auth-form-label">您的姓名或暱稱：</label>
              <input type="text" id="authNameInput" class="auth-form-input" placeholder="例如：陳信士" required value="陳信士">
            </div>
          ` : ''}

          <div class="auth-form-group">
            <label class="auth-form-label">電子信箱或手機：</label>
            <input type="email" id="authEmailInput" class="auth-form-input" placeholder="name@example.com" required value="chen.blessed@example.com">
          </div>

          <div class="auth-form-group">
            <label class="auth-form-label">密碼：</label>
            <input type="password" id="authPasswordInput" class="auth-form-input" placeholder="請輸入密碼" required value="123456">
          </div>

          <div style="display:flex;gap:10px;margin-top:10px;">
            <button type="submit" class="btn btn-gold" style="width:100%;">
              ${defaultMode === 'login' ? '登入會員中心' : '立即免費註冊'}
            </button>
          </div>

          <button type="button" class="btn btn-outline btn-sm" id="quickDemoLoginBtn" style="margin-top:6px;">
            ⚡ 一鍵免密碼體驗登入 (預設陳信士)
          </button>

          <button type="button" class="btn btn-outline btn-sm" id="authCancelBtn" style="margin-top:4px;">
            取消
          </button>
        </form>
      </div>
    `;

    document.getElementById('authTabLogin').addEventListener('click', () => openAuthModal('login'));
    document.getElementById('authTabRegister').addEventListener('click', () => openAuthModal('register'));
    document.getElementById('authCancelBtn').addEventListener('click', () => {
      readingModalBackdrop.classList.remove('show');
    });

    document.getElementById('quickDemoLoginBtn').addEventListener('click', () => {
      MemberManager.setCurrentUser({
        id: 'usr_demo',
        name: '陳信士',
        email: 'chen.blessed@example.com',
        gender: 'female',
        tier: '有緣信士',
        joinedAt: '2026-08-31'
      });
      updateTopBarUserStatus();
      renderMemberCenter();
      readingModalBackdrop.classList.remove('show');
      switchTab('member');
    });

    document.getElementById('authModalForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('authEmailInput').value.trim();
      const pwd = document.getElementById('authPasswordInput').value;

      if (defaultMode === 'login') {
        MemberManager.login(email, pwd);
      } else {
        const name = document.getElementById('authNameInput').value.trim();
        MemberManager.register(email, name, pwd);
      }

      updateTopBarUserStatus();
      renderMemberCenter();
      readingModalBackdrop.classList.remove('show');
      switchTab('member');
    });

    readingModalBackdrop.classList.add('show');
  }

  // ============ 5. Render Member Dashboard & Wallet Center (白話化) ============
  function renderMemberCenter() {
    const user = MemberManager.getCurrentUser();
    if (!user) {
      openAuthModal();
      return;
    }

    const wallet = WalletManager.getPoints();
    let totalPoints = 0;
    Object.values(wallet).forEach((pts) => { totalPoints += pts; });

    // 1. Render Profile Card
    if (memberProfileContainer) {
      memberProfileContainer.innerHTML = `
        <div class="member-profile-card">
          <div class="member-avatar-block">
            <div class="member-large-avatar">${user.name.slice(0, 1)}</div>
            <div class="member-info-col">
              <h3>
                <span>${user.name}</span>
                <span class="member-tier-badge">✨ ${user.tier || '有緣信士'}</span>
              </h3>
              <div class="member-email-text">${user.email} ｜ 加入日期：${user.joinedAt || '2026-08-31'}</div>
            </div>
          </div>

          <div style="display:flex;align-items:center;gap:16px;">
            <div class="member-points-summary-box">
              <span style="font-size:0.85rem;color:var(--text-muted);">總剩餘測算次數</span>
              <span class="member-total-points-num">${totalPoints}</span>
              <span style="font-size:0.85rem;color:var(--gold-bright);">次</span>
            </div>

            <button type="button" class="btn btn-outline btn-sm" id="memberLogoutBtn" title="登出當前帳號">
              切換帳號
            </button>
          </div>
        </div>
      `;

      document.getElementById('memberLogoutBtn').addEventListener('click', () => {
        MemberManager.logout();
        updateTopBarUserStatus();
        switchTab('hub');
      });
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
        ? `前往綠界安全支付 NT$ ${plan.price} →`
        : `請先選滿 ${plan.requiredCount} 個主題（目前已選 ${state.customChosenThemes.size} 項）`;
    }
  }

  // ============ 9. 綠界科技 (ECPay) 金流發起與確認 ============
  function showCheckoutConfirmModal(plan, chosenThemes) {
    const backdrop = document.getElementById('readingModalBackdrop');
    const card = document.getElementById('readingModalCard');
    if (!backdrop || !card) return;

    const themeTitles = chosenThemes
      .map((id) => THEMES.find((t) => t.id === id)?.name || id)
      .join('、');

    card.innerHTML = `
      <div class="wizard-header" style="border-bottom:1px solid var(--border-gold);padding-bottom:14px;margin-bottom:16px;">
        <div class="wizard-title-row">
          <h3 style="display:flex;align-items:center;gap:8px;color:var(--gold-bright);font-size:1.2rem;">
            <span>💳</span> 綠界科技 · 安全結帳確認
          </h3>
          <button type="button" class="btn btn-outline btn-sm" id="closeCheckoutModalBtn" style="padding:4px 10px;">✕ 取消</button>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:14px;font-size:0.9rem;">
        <div style="background:rgba(212,168,83,0.06);border:1px solid rgba(212,168,83,0.3);border-radius:var(--radius-md);padding:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="color:var(--text-muted);">結算方案</span>
            <span style="font-weight:700;color:#FFFFFF;">${plan.label}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="color:var(--text-muted);">結算金額</span>
            <span style="font-size:1.35rem;font-weight:900;color:var(--gold-bright);">NT$ ${plan.price}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
            <span style="color:var(--text-muted);white-space:nowrap;">開通篇章</span>
            <span style="text-align:right;color:var(--text-secondary);font-size:0.85rem;">${themeTitles}（各享 ${plan.pointsReward} 次測算）</span>
          </div>
        </div>

        <div style="background:rgba(255,255,255,0.03);border-radius:var(--radius-sm);padding:12px;font-size:0.8rem;color:var(--text-secondary);line-height:1.6;">
          <div style="font-weight:700;color:var(--gold-bright);margin-bottom:4px;display:flex;align-items:center;gap:6px;">
            <span>🔒</span> 綠界科技 (ECPay) 256-bit SSL 加密收銀台
          </div>
          點擊確認後，將前往綠界安全收銀台，支援 <strong>信用卡 / Apple Pay / LINE Pay / 超商代碼 / ATM 虛擬帳號</strong>。<br>
          付款完成後自動返回問仙壇並即刻存入點數。
        </div>

        <form id="realEcpaySubmitForm" method="POST" action="/api/ecpay/create" style="margin-top:6px;">
          <input type="hidden" name="planId" value="${plan.id}" />
          <input type="hidden" name="themes" value="${chosenThemes.join(',')}" />
          <button type="submit" class="btn btn-gold" id="startEcpayBtn" style="width:100%;font-size:1.05rem;padding:12px;box-shadow:0 0 20px rgba(212,168,83,0.4);">
            ⚡ 確認前往綠界安全付款 (NT$ ${plan.price})
          </button>
        </form>
      </div>
    `;

    const close = () => {
      backdrop.classList.remove('active');
    };

    card.querySelector('#closeCheckoutModalBtn')?.addEventListener('click', close);
    backdrop.classList.add('active');
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
        alert(`請先選滿 ${plan.requiredCount} 個主題（目前已選 ${chosenArray.length} 項）`);
        return;
      }

      showCheckoutConfirmModal(plan, chosenArray);
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
      goal: 'timing',
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
            <div class="wizard-question-sub">報告中將針對您的核心期望，給予具體的行動方向與時機建議</div>
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

  function bindWizardStepEvents(currentStep) {
    const { answers } = state.wizard;

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
        } else {
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
      nextBtn.addEventListener('click', () => {
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
    const { activeThemeId, answers } = state.wizard;
    const consumeRes = WalletManager.consumePoint(activeThemeId, 1);
    if (!consumeRes.success) {
      alert('您的測算次數不足，請先至會員中心購買該主題方案！');
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

    const fill = document.getElementById('decodingProgress');
    let progress = 10;
    const interval = setInterval(() => {
      progress += 30;
      if (fill) fill.style.width = `${progress}%`;
      if (progress >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          showDecodedReport(activeThemeId, answers);
        }, 500);
      }
    }, 400);
  }

  function showDecodedReport(themeId, answers) {
    const theme = THEMES.find((t) => t.id === themeId);
    const genderKey = answers.gender === 'male' ? 'male' : 'female';
    const portraitsPool = PORTRAIT_ASSETS[genderKey] || PORTRAIT_ASSETS.female;
    const randomPortrait = portraitsPool[Math.floor(Math.random() * portraitsPool.length)];

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
      : (DESIRED_OUTCOMES.find(g => g.id === answers.goal)?.label || '掌握時機指引');

    if (typeof confetti === 'function') {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.5 }
      });
    }

    const reportData = {
      themeId,
      themeName: theme.name,
      title: theme.title,
      portrait: randomPortrait,
      gender: genderLabel,
      age: ageLabel,
      relation: relationLabel,
      role: roleLabel,
      goal: goalLabel,
      question: answers.question || '一般運勢與未來時機指引',
      score: 92 + Math.floor(Math.random() * 7),
      advice: `【${theme.name}深度指引】：信士（${genderLabel} · ${ageLabel} · 稱謂：${relationLabel} · 狀態：${roleLabel}）目前整體運勢氣場聚集向上。針對您所詢問的「${answers.question || theme.title}」與期待「${goalLabel}」，在未來的關鍵月份（尤其是今年秋季至明年初）將迎來重要的轉折契機。建議您保持信心、把握身邊的貴人善緣，順應時機積極行動，必能迎刃而解、心想事成！`,
      hasPalm: Boolean(answers.palmDataUrl),
      matchedStories
    };

    WalletManager.saveReport(reportData);

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

        <div class="report-portrait-container">
          <img src="${randomPortrait}" class="report-portrait-img" alt="正緣長相特徵模擬">
          <div class="report-dimension-grid">
            <div class="report-dim-card">
              <div class="report-dim-label">天命正緣契合度</div>
              <div class="report-dim-val">${reportData.score} %</div>
            </div>
            <div class="report-dim-card">
              <div class="report-dim-label">關鍵轉折年齡</div>
              <div class="report-dim-val">29 - 32 歲</div>
            </div>
            <div class="report-dim-card">
              <div class="report-dim-label">貴人特徵與方位</div>
              <div class="report-dim-val">正南方 · 溫和細心</div>
            </div>
            <div class="report-dim-card">
              <div class="report-dim-label">手相命脈印證</div>
              <div class="report-dim-val">吉星相照 · 貴人相助</div>
            </div>
          </div>
        </div>

        <div class="report-advice-box">
          <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:6px;">
            <strong>想了解的事：</strong> ${reportData.question}
          </div>
          <div style="font-size:0.82rem;color:var(--text-gold);margin-bottom:8px;">
            <strong>期待的結果：</strong> ${reportData.goal}
          </div>
          <div style="line-height:1.7;">
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
            ${matchedStories.map((story) => `
              <div class="manifestation-story-card">
                <div class="story-card-meta">
                  <span class="story-card-title">${story.title}</span>
                  <span class="story-card-user">${story.name} · ${story.category}</span>
                </div>
                <div class="story-card-summary">${story.summary}</div>
                <div class="story-card-result-badge">✓ ${story.result}</div>
                <details class="story-full-details">
                  <summary>點擊展開閱讀完整見證故事</summary>
                  <p>${story.full}</p>
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
      switchTab('history');
    });
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
          <img src="${item.portrait}" style="width:60px;height:60px;border-radius:var(--radius-sm);object-fit:cover;border:1px solid var(--border-gold);" alt="報告縮圖">
          <div>
            <h4 style="color:var(--gold-bright);">${item.themeName}</h4>
            <span style="font-size:0.75rem;color:var(--text-muted);">${new Date(item.date).toLocaleDateString()}</span>
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
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:36px;height:36px;border-radius:50%;background:var(--gold-gradient);color:#000;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:0.9rem;">
              ${s.name.slice(0, 1)}
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

        <h4 style="font-size:1.05rem;color:#FFFFFF;margin-top:4px;">${s.title}</h4>
        <p style="font-size:0.86rem;color:var(--text-secondary);">${s.summary}</p>
        
        <div style="display:inline-flex;align-self:flex-start;font-size:0.76rem;color:#34D399;font-weight:800;background:rgba(16,185,129,0.15);padding:3px 8px;border-radius:4px;">
          ✓ ${s.result}
        </div>

        <details class="story-full-details" style="margin-top:6px;">
          <summary>閱讀完整見證始末</summary>
          <p>${s.full}</p>
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
            backdrop.classList.remove('active');
          };

          card.querySelector('#closeSuccessModalBtn')?.addEventListener('click', closeSuccess);
          card.querySelector('#startReadingNowBtn')?.addEventListener('click', () => {
            closeSuccess();
            switchTab('hub');
          });

          backdrop.classList.add('active');
        }
      }

      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (paymentStatus === 'failed' || paymentStatus === 'error') {
      const msg = urlParams.get('msg') || '交易未完成或使用者取消';
      alert(`⚠️ 綠界扣款未完成：${decodeURIComponent(msg)}\n如扣款有異常，請隨時聯繫客服信箱 service@wen-xian-tan.com`);
      window.history.replaceState({}, document.title, window.location.pathname);
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
});
