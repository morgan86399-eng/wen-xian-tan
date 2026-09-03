import { getOnly, redirect, requireSiteUrl, fetchWithTimeout } from '../../../lib/wxt/http.mjs';
import { requireOAuthConfig, signUserSession, sessionCookieHeader } from '../../../lib/wxt/auth.mjs';
import { consumeOAuthState, upsertOAuthUser, hasDb } from '../../../lib/wxt/store.mjs';

export const onRequest = getOnly(async ({ request, env }) => {
  if (!hasDb(env)) return redirect(`${requireSiteUrl(env)}/?auth=error`);
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const siteUrl = requireSiteUrl(env);

  if (!code || !state) return redirect(`${siteUrl}/?auth=error`);

  const stateResult = await consumeOAuthState(env, state, 'line');
  if (!stateResult.ok) return redirect(`${siteUrl}/?auth=error`);

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

  if (!tokenRes.ok) return redirect(`${siteUrl}/?auth=error`);
  const tokenJson = await tokenRes.json();
  const accessToken = tokenJson.access_token;
  if (!accessToken) return redirect(`${siteUrl}/?auth=error`);

  const profileRes = await fetchWithTimeout('https://api.line.me/v2/profile', {
    headers: { authorization: `Bearer ${accessToken}` }
  }, 10000, 'LINE Profile');
  if (!profileRes.ok) return redirect(`${siteUrl}/?auth=error`);
  const profile = await profileRes.json();

  const user = await upsertOAuthUser(env, {
    provider: 'line',
    providerSubject: profile.userId,
    displayName: profile.displayName || '',
    email: profile.email || ''
  });

  const sessionToken = await signUserSession(env, { uid: user.id, provider: 'line' });
  return redirect(`${siteUrl}/?auth=ok`, 302, { 'set-cookie': sessionCookieHeader(sessionToken) });
});
