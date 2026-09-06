import { getOnly, redirect, requireSiteUrl, fetchWithTimeout } from '../../../lib/wxt/http.mjs';
import { requireOAuthConfig, signUserSession, oauthSessionInterstitial } from '../../../lib/wxt/auth.mjs';
import { consumeOAuthState, upsertOAuthUser, hasDb } from '../../../lib/wxt/store.mjs';
import { verifyGoogleIdToken } from '../../../lib/wxt/google-id-token.mjs';

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

  const stateResult = await consumeOAuthState(env, state, 'google');
  if (!stateResult.ok) {
    return redirect(`${siteUrl}/?auth=error&reason=${encodeURIComponent('認證逾時或狀態不符，請重新登入')}`);
  }

  const { clientId, clientSecret } = requireOAuthConfig(env, 'google');
  const callback = `${siteUrl}/api/auth/google/callback`;
  const tokenRes = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callback,
      client_id: clientId,
      client_secret: clientSecret
    })
  }, 15000, 'Google');

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => '');
    console.error('Google token exchange failed:', tokenRes.status, errText);
    return redirect(`${siteUrl}/?auth=error&reason=${encodeURIComponent('Google 授權憑證換取失敗')}`);
  }
  const tokenJson = await tokenRes.json();
  const idToken = tokenJson.id_token;
  if (!idToken) {
    return redirect(`${siteUrl}/?auth=error&reason=${encodeURIComponent('Google 回傳憑證無效')}`);
  }

  const verified = await verifyGoogleIdToken(idToken, clientId);
  if (!verified.ok || !verified.payload || !verified.payload.sub) {
    console.error('Google id_token verification failed:', verified.error);
    return redirect(`${siteUrl}/?auth=error&reason=${encodeURIComponent('Google 身分憑證驗證失敗')}`);
  }
  const payload = verified.payload;

  const user = await upsertOAuthUser(env, {
    provider: 'google',
    providerSubject: payload.sub,
    displayName: payload.name || '',
    email: payload.email || ''
  });

  const sessionToken = await signUserSession(env, { uid: user.id, provider: 'google' });
  return oauthSessionInterstitial(env, sessionToken);
});
