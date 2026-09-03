import { getOnly, redirect, requireSiteUrl, fetchWithTimeout } from '../../../lib/wxt/http.mjs';
import { requireOAuthConfig, signUserSession, sessionCookieHeader } from '../../../lib/wxt/auth.mjs';
import { consumeOAuthState, upsertOAuthUser, hasDb } from '../../../lib/wxt/store.mjs';
import { verifyGoogleIdToken } from '../../../lib/wxt/google-id-token.mjs';

export const onRequest = getOnly(async ({ request, env }) => {
  if (!hasDb(env)) return redirect(`${requireSiteUrl(env)}/?auth=error`);
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const siteUrl = requireSiteUrl(env);
  if (!code || !state) return redirect(`${siteUrl}/?auth=error`);

  const stateResult = await consumeOAuthState(env, state, 'google');
  if (!stateResult.ok) return redirect(`${siteUrl}/?auth=error`);

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

  if (!tokenRes.ok) return redirect(`${siteUrl}/?auth=error`);
  const tokenJson = await tokenRes.json();
  const idToken = tokenJson.id_token;
  if (!idToken) return redirect(`${siteUrl}/?auth=error`);

  const verified = await verifyGoogleIdToken(idToken, clientId);
  if (!verified.ok || !verified.payload || !verified.payload.sub) {
    return redirect(`${siteUrl}/?auth=error`);
  }
  const payload = verified.payload;

  const user = await upsertOAuthUser(env, {
    provider: 'google',
    providerSubject: payload.sub,
    displayName: payload.name || '',
    email: payload.email || ''
  });

  const sessionToken = await signUserSession(env, { uid: user.id, provider: 'google' });
  return redirect(`${siteUrl}/?auth=ok`, 302, { 'set-cookie': sessionCookieHeader(sessionToken) });
});
