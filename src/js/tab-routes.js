/** 四個會整頁開啟的分頁。網址只給分享與重新整理，切換時不整頁跳轉。 */
export const TAB_PATHS = {
  hub: '/',
  member: '/member',
  history: '/history',
  stories: '/stories',
  auth: '/auth'
};

const TAB_IDS = Object.keys(TAB_PATHS);

export function tabFromPath(pathname) {
  const raw = String(pathname || '/').split('?')[0].split('#')[0].toLowerCase();
  const path = raw.replace(/\/+$/, '') || '/';
  const base = path.endsWith('.html') ? path.slice(0, -5) : path;
  for (const id of TAB_IDS) {
    if (id === 'hub') continue;
    const route = TAB_PATHS[id];
    if (base === route || base.endsWith(route)) return id;
  }
  return 'hub';
}

export function pathForTab(tabId) {
  return TAB_PATHS[tabId] || '/';
}
