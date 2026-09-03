import { route, json, requireSiteUrl } from '../../../lib/wxt/http.mjs';
import { requireOAuthConfig } from '../../../lib/wxt/auth.mjs';
import { putOAuthState, hasDb } from '../../../lib/wxt/store.mjs';
import { randomHex } from '../../../lib/security/token.mjs';

export const onRequest = route(async ({ request, env }) => {
  if (!hasDb(env)) return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
  const { clientId } = requireOAuthConfig(env, 'google');
  const siteUrl = requireSiteUrl(env);
  const state = randomHex(16);
  const redirect = new URL(request.url).searchParams.get('redirect') || '/';
  await putOAuthState(env, { state, provider: 'google', redirect });

  const callback = `${siteUrl}/api/auth/google/callback`;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: callback,
    state,
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account'
  });
  return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
}, { methods: ['GET', 'POST'] });
