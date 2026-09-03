/**
 * 問仙壇 · 點數與歷史（只信 /api/me 與 /api/readings，不用 localStorage 當餘額）
 */

import { MemberManager } from './member.js';

function emptyCredits() {
  return { love: 0, work: 0, career: 0, wealth: 0, family: 0, children: 0 };
}

function extractReadings(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.readings)) return data.readings;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export const WalletManager = {
  _reports: [],

  getPoints() {
    if (typeof MemberManager.getCredits === 'function') {
      return MemberManager.getCredits();
    }
    return emptyCredits();
  },

  getThemePoints(themeId) {
    const n = Number(this.getPoints()[themeId]);
    return Number.isFinite(n) ? n : 0;
  },

  async refreshCredits() {
    const me = await MemberManager.refreshMe();
    return me.credits || this.getPoints();
  },

  async fetchReports() {
    try {
      const res = await fetch('/api/readings', { credentials: 'include' });
      if (res.status === 401) {
        this._reports = [];
        return [];
      }
      if (!res.ok) {
        this._reports = [];
        return [];
      }
      const data = await res.json().catch(() => ({}));
      this._reports = extractReadings(data);
      return this._reports;
    } catch {
      this._reports = [];
      return [];
    }
  },

  getReports() {
    return Array.isArray(this._reports) ? this._reports : [];
  },

  findReport(id) {
    return this.getReports().find((item) => item && (item.id === id || item.readingId === id)) || null;
  }
};
