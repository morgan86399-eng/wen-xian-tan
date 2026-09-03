import { getOnly, json } from '../lib/wxt/http.mjs';
import { readUserSession } from '../lib/wxt/auth.mjs';
import { findUserById, getCreditsMap, hasDb } from '../lib/wxt/store.mjs';

export const onRequest = getOnly(async ({ request, env }) => {
  if (!hasDb(env)) return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
  const session = await readUserSession(env, request);
  if (!session.ok) return json({ error: 'UNAUTHENTICATED' }, 401);

  const user = await findUserById(env, session.uid);
  if (!user) return json({ error: 'UNAUTHENTICATED' }, 401);

  const credits = await getCreditsMap(env, user.id);
  return json({
    user: {
      id: user.id,
      displayName: user.display_name,
      email: user.email || '',
      provider: user.provider
    },
    credits
  });
});
