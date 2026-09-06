/* 請求來源檢查（logout CSRF） */

export function isSameOriginRequest(request, env) {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  let reqOrigin = origin;
  if (!reqOrigin && referer) {
    try {
      reqOrigin = new URL(referer).origin;
    } catch {
      reqOrigin = null;
    }
  }
  if (!reqOrigin) return false;

  // 1. 與 request.url 比對（最精準同源檢查）
  try {
    if (request && request.url) {
      const reqUrlOrigin = new URL(request.url).origin;
      if (reqOrigin === reqUrlOrigin) return true;
    }
  } catch {}

  // 2. 與 env.SITE_URL 比對（包含 www 與 apex 互通）
  const siteUrl = String((env && env.SITE_URL) || '').trim().replace(/\/$/, '');
  if (siteUrl) {
    try {
      const siteOrigin = new URL(siteUrl).origin;
      if (reqOrigin === siteOrigin) return true;

      const siteHost = new URL(siteUrl).hostname.toLowerCase();
      const reqHost = new URL(reqOrigin).hostname.toLowerCase();

      // 支援 zenasker.com 與 www.zenasker.com 互通
      const isZenaskerSite = siteHost === 'zenasker.com' || siteHost === 'www.zenasker.com';
      const isZenaskerReq = reqHost === 'zenasker.com' || reqHost === 'www.zenasker.com';
      if (isZenaskerSite && isZenaskerReq) return true;

      // 支援本地開發
      const isLocalSite = siteHost === 'localhost' || siteHost === '127.0.0.1';
      const isLocalReq = reqHost === 'localhost' || reqHost === '127.0.0.1';
      if (isLocalSite && isLocalReq) return true;
    } catch {}
  }

  return false;
}
