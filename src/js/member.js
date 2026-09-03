/**
 * 問仙壇 · 會員系統（只信後端 session cookie，不讀不寫 localStorage 憑證）
 */

const THEME_IDS = ['love', 'work', 'career', 'wealth', 'family', 'children'];

function emptyCredits() {
  return { love: 0, work: 0, career: 0, wealth: 0, family: 0, children: 0 };
}

function normalizeUser(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const displayName = raw.displayName || raw.name || '信士';
  return {
    id: raw.id,
    displayName,
    name: displayName,
    email: raw.email || '',
    provider: raw.provider || 'email',
    avatar: raw.avatar || raw.picture || ''
  };
}

function normalizeCredits(raw) {
  const next = emptyCredits();
  if (!raw || typeof raw !== 'object') return next;
  THEME_IDS.forEach((id) => {
    const n = Number(raw[id]);
    next[id] = Number.isFinite(n) ? n : 0;
  });
  return next;
}

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function mapSendCodeError(res, data) {
  if (res.status === 429) return '操作太頻繁，請稍後再試';
  if (res.status === 503) return '信箱服務暫時無法使用，請稍後再試';
  if (data.error === 'INVALID_EMAIL') return '請輸入有效的電子信箱';
  return '無法寄送驗證碼，請稍後再試';
}

function mapVerifyError(res) {
  if (res.status === 429) return '嘗試次數過多，請稍後再試';
  if (res.status === 503) return '服務暫時無法使用，請稍後再試';
  return '驗證碼錯誤或已過期，請重新取得';
}

export const MemberManager = {
  _user: null,
  _credits: emptyCredits(),
  _ready: false,

  async refreshMe() {
    try {
      const res = await fetch('/api/me', { credentials: 'include' });
      const data = await readJson(res);
      if (res.status === 401 || data.error === 'UNAUTHENTICATED') {
        this._user = null;
        this._credits = emptyCredits();
        this._ready = true;
        return { user: null, credits: this._credits };
      }
      if (!res.ok) {
        this._ready = true;
        return { user: this._user, credits: this._credits, error: data.error || 'ME_FAILED' };
      }
      this._user = normalizeUser(data.user);
      this._credits = normalizeCredits(data.credits);
      this._ready = true;
      return { user: this._user, credits: this._credits };
    } catch {
      this._ready = true;
      return { user: this._user, credits: this._credits, error: 'NETWORK' };
    }
  },

  getCurrentUser() {
    return this._user;
  },

  isLoggedIn() {
    return Boolean(this._user && this._user.id);
  },

  getCredits() {
    return { ...this._credits };
  },

  applyCredits(credits) {
    this._credits = normalizeCredits(credits);
    return this.getCredits();
  },

  async requestEmailVerificationCode(email) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, ok: false, message: '請輸入有效的電子信箱' };
    }
    try {
      const res = await fetch('/api/auth/email/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: cleanEmail })
      });
      const data = await readJson(res);
      if (!res.ok || data.ok === false) {
        return { success: false, ok: false, message: mapSendCodeError(res, data) };
      }
      return { success: true, ok: true };
    } catch {
      return { success: false, ok: false, message: '目前連不上伺服器，請稍後再試' };
    }
  },

  async verifyEmailCode(email, code) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanCode = String(code || '').trim();
    if (!cleanEmail || !cleanCode) {
      return { success: false, message: '請輸入信箱與驗證碼' };
    }
    try {
      const res = await fetch('/api/auth/email/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: cleanEmail, code: cleanCode })
      });
      const data = await readJson(res);
      if (!res.ok || data.ok === false) {
        return { success: false, message: mapVerifyError(res) };
      }
      if (data.user) this._user = normalizeUser(data.user);
      await this.refreshMe();
      if (!this.isLoggedIn()) {
        return { success: false, message: '驗證完成但尚未建立登入狀態，請重新整理後再試' };
      }
      return { success: true, user: this._user };
    } catch {
      return { success: false, message: '驗證失敗，請稍後再試' };
    }
  },

  async startLineLogin() {
    try {
      const res = await fetch('/api/auth/line/start', {
        method: 'POST',
        credentials: 'include'
      });
      const data = await readJson(res);
      if (data.url) {
        window.location.assign(data.url);
        return { ok: true };
      }
      return { ok: false, message: data.error || data.message || '無法開始 LINE 登入' };
    } catch {
      return { ok: false, message: '目前連不上伺服器，請稍後再試' };
    }
  },

  async startGoogleLogin() {
    try {
      const res = await fetch('/api/auth/google/start', {
        method: 'POST',
        credentials: 'include'
      });
      const data = await readJson(res);
      if (data.url) {
        window.location.assign(data.url);
        return { ok: true };
      }
      return { ok: false, message: data.error || data.message || '無法開始 Google 登入' };
    } catch {
      return { ok: false, message: '目前連不上伺服器，請稍後再試' };
    }
  },

  async devLogin(username, password) {
    try {
      const res = await fetch('/api/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      });
      const data = await readJson(res);
      if (!res.ok || data.ok === false) {
        return { success: false, message: data.message || '帳號或密碼錯誤' };
      }
      if (data.user) this._user = normalizeUser(data.user);
      await this.refreshMe();
      return { success: true, user: this._user };
    } catch {
      return { success: false, message: '目前連不上伺服器，請稍後再試' };
    }
  },

  async logout() {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    } catch {
      /* cookie 清不掉也先清前端快取 */
    }
    this._user = null;
    this._credits = emptyCredits();
  }
};
