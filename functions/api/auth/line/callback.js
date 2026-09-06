import { getOnly, redirect, requireSiteUrl, fetchWithTimeout } from '../../../lib/wxt/http.mjs';
import { requireOAuthConfig, signUserSession, oauthSessionInterstitial } from '../../../lib/wxt/auth.mjs';
import { consumeOAuthState, upsertOAuthUser, hasDb } from '../../../lib/wxt/store.mjs';

export const onRequest = getOnly(async ({ request, env }) => {
  const siteUrl = requireSiteUrl(env);
  if (!hasDb(env)) return redirect(`${siteUrl}/?auth=error&reason=${encodeURIComponent('資料庫暫時不可用')}`);

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthErr = url.searchParams.get('error');
  const oauthErrDesc = url.searchParams.get('error_description');

  if (oauthErr) {
    return redirect(`${siteUrl}/?auth=error&reason=${encodeURIComponent(oauthErrDesc || oauthErr)}`);
  }
  if (!code || !state) {
    return redirect(`${siteUrl}/?auth=error&reason=${encodeURIComponent('缺少認證授權碼')}`);
  }

  const stateResult = await consumeOAuthState(env, state, 'line');
  if (!stateResult.ok) {
    return redirect(`${siteUrl}/?auth=error&reason=${encodeURIComponent('認證逾時或狀態不符，請重新登入')}`);
  }

  const { clientId, clientSecret } = requireOAuthConfig(env, 'line');
  const callback = `${siteUrl}/api/auth/line/callback`;
  const tokenRes = await fetchWithTimeout('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callback,
      client_id: clientId,
      client_secret: clientSecret
    })
  }, 15000, 'LINE');

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => '');
    console.error('LINE token exchange failed:', tokenRes.status, errText);
    return redirect(`${siteUrl}/?auth=error&reason=${encodeURIComponent('LINE 授權憑證換取失敗')}`);
  }
  const tokenJson = await tokenRes.json();
  const accessToken = tokenJson.access_token;
  if (!accessToken) {
    return redirect(`${siteUrl}/?auth=error&reason=${encodeURIComponent('LINE 回傳憑證無效')}`);
  }

  const profileRes = await fetchWithTimeout('https://api.line.me/v2/profile', {
    headers: { authorization: `Bearer ${accessToken}` }
  }, 10000, 'LINE Profile');
  if (!profileRes.ok) {
    return redirect(`${siteUrl}/?auth=error&reason=${encodeURIComponent('無法取得 LINE 個人檔案')}`);
  }
  const profile = await profileRes.json();

  const user = await upsertOAuthUser(env, {
    provider: 'line',
    providerSubject: profile.userId,
    displayName: profile.displayName || '',
    email: profile.email || ''
  });

  const sessionToken = await signUserSession(env, { uid: user.id, provider: 'line' });
  return oauthSessionInterstitial(env, sessionToken);
});
