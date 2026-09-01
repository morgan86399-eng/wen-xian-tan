/**
 * 問仙壇 · 信士會員系統與認證管理 (Member Auth Manager)
 */

const STORAGE_KEY_MEMBERS = 'wenxiantan_members_db_v2';
const STORAGE_KEY_SESSION = 'wenxiantan_user_session_v2';

export const TEST_USER_ACCOUNT = {
  id: 'usr_test_user',
  email: 'user',
  name: '測試體驗員 (user)',
  password: 'user123',
  gender: 'female',
  tier: '至尊測試信士 (全篇章各1000點)',
  joinedAt: '2026-09-01'
};

export const MemberManager = {
  // 取得所有註冊會員
  getMembers() {
    try {
      const members = JSON.parse(localStorage.getItem(STORAGE_KEY_MEMBERS) || '{}');
      if (!members['user']) {
        members['user'] = TEST_USER_ACCOUNT;
      }
      return members;
    } catch (e) {
      return { user: TEST_USER_ACCOUNT };
    }
  },

  saveMembers(members) {
    try {
      localStorage.setItem(STORAGE_KEY_MEMBERS, JSON.stringify(members));
    } catch (e) {
      console.error('Failed to save members DB', e);
    }
  },

  // 取得當前登入之使用者
  getCurrentUser() {
    try {
      const session = localStorage.getItem(STORAGE_KEY_SESSION);
      if (session) {
        return JSON.parse(session);
      }
      // 預設訪客信士
      const guest = {
        id: 'guest_default',
        name: '陳信士',
        email: 'chen.blessed@example.com',
        gender: 'female',
        tier: '有緣信士',
        joinedAt: new Date().toISOString().split('T')[0]
      };
      this.setCurrentUser(guest);
      return guest;
    } catch (e) {
      return null;
    }
  },

  setCurrentUser(user) {
    try {
      if (user) {
        localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(user));
      } else {
        localStorage.removeItem(STORAGE_KEY_SESSION);
      }
    } catch (e) {
      console.error('Failed to set current user', e);
    }
  },

  isLoggedIn() {
    return Boolean(this.getCurrentUser());
  },

  // 註冊新信士帳號
  register(email, name, password) {
    const members = this.getMembers();
    if (members[email]) {
      return { success: false, message: '此電子信箱已註冊過，請直接登入！' };
    }

    const newUser = {
      id: 'usr_' + Date.now(),
      email,
      name: name || '信士',
      password,
      gender: 'female',
      tier: '結緣信士',
      joinedAt: new Date().toISOString().split('T')[0]
    };

    members[email] = newUser;
    this.saveMembers(members);
    this.setCurrentUser(newUser);

    return { success: true, user: newUser };
  },

  // 登入
  login(email, password) {
    const cleanAccount = (email || '').trim().toLowerCase();
    const cleanPwd = (password || '').trim();

    if ((cleanAccount === 'user' || cleanAccount === 'user@example.com') && cleanPwd === 'user123') {
      this.setCurrentUser(TEST_USER_ACCOUNT);
      try {
        localStorage.setItem('wenxiantan_points_wallet_v2', JSON.stringify({
          love: 1000,
          work: 1000,
          career: 1000,
          wealth: 1000,
          family: 1000,
          children: 1000
        }));
      } catch (err) {
        console.error('Failed to set test points', err);
      }
      return { success: true, user: TEST_USER_ACCOUNT };
    }

    const members = this.getMembers();
    const user = members[email];

    if (!user) {
      // 若尚未註冊，自動建立帳號友善體驗
      return this.register(email, email.split('@')[0] + ' 信士', password);
    }

    if (user.password && user.password !== password) {
      return { success: false, message: '密碼不正確，請重新輸入！' };
    }

    this.setCurrentUser(user);
    return { success: true, user };
  },

  // 登出
  logout() {
    this.setCurrentUser(null);
  }
};
