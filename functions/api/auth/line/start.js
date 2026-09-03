import { route, json, requireSiteUrl } from '../../../lib/wxt/http.mjs';
import { requireOAuthConfig } from '../../../lib/wxt/auth.mjs';
import { putOAuthState, hasDb } from '../../../lib/wxt/store.mjs';
import { randomHex } from '../../../lib/security/token.mjs';

export const onRequest = route(async ({ request, env }) => {
  if (!hasDb(env)) return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
  const { clientId } = requireOAuthConfig(env, 'line');
  const siteUrl = requireSiteUrl(env);
  const state = randomHex(16);
  const redirect = new URL(request.url).searchParams.get('redirect') || '/';
  await putOAuthState(env, { state, provider: 'line', redirect });

  const callback = `${siteUrl}/api/auth/line/callback`;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: callback,
    state,
    scope: 'profile openid email'
  });
  return json({ url: `https://access.line.me/oauth2/v2.1/authorize?${params.toString()}` });
}, { methods: ['GET', 'POST'] });
