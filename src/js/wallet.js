/**
 * 問仙壇 · 獨立點數額度錢包管理系統 (Isolated Theme Points Wallet)
 * 每個主題擁有獨立的餘額與扣點邏輯，互不混淆
 */

const STORAGE_KEY_POINTS = 'wenxiantan_points_wallet_v2';
const STORAGE_KEY_HISTORY = 'wenxiantan_reports_history_v2';

export const WalletManager = {
  // 取得預設 6 大核心篇章額度（預設贈送 感情篇 1 點結緣體驗）
  getDefaultWallet() {
    return {
      love: 1,      // 感情篇 (預設贈送 1 點)
      work: 0,      // 工作篇
      career: 0,    // 事業篇
      wealth: 0,    // 財運篇
      family: 0,    // 家庭篇
      children: 0   // 小孩篇
    };
  },

  // 取得所有篇章的點數物件
  getPoints() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_POINTS);
      if (!saved) {
        const initial = this.getDefaultWallet();
        this.savePoints(initial);
        return initial;
      }
      return { ...this.getDefaultWallet(), ...JSON.parse(saved) };
    } catch (e) {
      console.error('Failed to load wallet points', e);
      return this.getDefaultWallet();
    }
  },

  // 取得單一主題的剩餘點數
  getThemePoints(themeId) {
    const points = this.getPoints();
    return typeof points[themeId] === 'number' ? points[themeId] : 0;
  },

  // 儲存點數物件
  savePoints(wallet) {
    try {
      localStorage.setItem(STORAGE_KEY_POINTS, JSON.stringify(wallet));
    } catch (e) {
      console.error('Failed to save wallet points', e);
    }
  },

  // 方案儲值：針對選定的主題列表，各自增加指定點數
  addPointsToThemes(themeIds, pointsToAdd = 3) {
    const wallet = this.getPoints();
    themeIds.forEach((id) => {
      wallet[id] = (wallet[id] || 0) + pointsToAdd;
    });
    this.savePoints(wallet);
    return wallet;
  },

  // 消耗單一主題點數
  consumePoint(themeId, amount = 1) {
    const wallet = this.getPoints();
    const current = wallet[themeId] || 0;
    if (current < amount) {
      return { success: false, remaining: current };
    }
    wallet[themeId] = current - amount;
    this.savePoints(wallet);
    return { success: true, remaining: wallet[themeId] };
  },

  // 報告與歷史紀錄只保留見證文字，不保留任何圖片來源。
  sanitizeReport(reportData) {
    if (!reportData || typeof reportData !== 'object') return reportData;

    const { matchedStories, ...report } = reportData;
    const textOnlyStories = Array.isArray(matchedStories)
      ? matchedStories.map((story) => ({
        themeId: story?.themeId,
        title: story?.title,
        name: story?.name,
        category: story?.category,
        summary: story?.summary,
        result: story?.result,
        full: story?.full
      }))
      : [];

    return { ...report, matchedStories: textOnlyStories };
  },

  // 儲存已產生的解讀報告與文字見證
  saveReport(reportData) {
    try {
      const list = this.getReports();
      const record = {
        id: 'rep_' + Date.now(),
        date: new Date().toISOString(),
        ...this.sanitizeReport(reportData)
      };
      list.unshift(record);
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(list));
      return record;
    } catch (e) {
      console.error('Failed to save report', e);
      return null;
    }
  },

  // 取得歷史報告列表
  getReports() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_HISTORY);
      const records = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(records)) return [];

      // 舊紀錄曾包含 imageUrl；使用者再次開啟網站時同步移除。
      const sanitized = records.map((record) => this.sanitizeReport(record));
      if (JSON.stringify(records) !== JSON.stringify(sanitized)) {
        localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(sanitized));
      }
      return sanitized;
    } catch (e) {
      return [];
    }
  },

  // ============ 綠界訂單交易紀錄與防重複核發 ============
  hasProcessedOrder(tradeNo) {
    if (!tradeNo) return false;
    const orders = this.getOrderHistory();
    return orders.some((o) => o.tradeNo === tradeNo);
  },

  recordOrder(orderInfo) {
    try {
      const orders = this.getOrderHistory();
      const record = {
        id: 'ord_' + Date.now(),
        date: new Date().toISOString(),
        ...orderInfo
      };
      orders.unshift(record);
      localStorage.setItem('wenxiantan_orders_v1', JSON.stringify(orders));
      return record;
    } catch (e) {
      console.error('Failed to save order record', e);
      return null;
    }
  },

  getOrderHistory() {
    try {
      const saved = localStorage.getItem('wenxiantan_orders_v1');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  }
};
