/* 請求來源檢查（logout CSRF） */

export function isSameOriginRequest(request, env) {
  const siteUrl = String((env && env.SITE_URL) || '').trim().replace(/\/$/, '');
  if (!siteUrl) return false;

  let siteOrigin;
  try {
    siteOrigin = new URL(siteUrl).origin;
  } catch {
    return false;
  }

  const origin = request.headers.get('origin');
  if (origin) return origin === siteOrigin;

  const referer = request.headers.get('referer');
  if (referer) {
    try {
      return new URL(referer).origin === siteOrigin;
    } catch {
      return false;
    }
  }

  return false;
}
