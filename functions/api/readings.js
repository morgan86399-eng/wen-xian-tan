import { getOnly, json } from '../lib/wxt/http.mjs';
import { readUserSession } from '../lib/wxt/auth.mjs';
import { listReadingsForUser, hasDb } from '../lib/wxt/store.mjs';

export const onRequest = getOnly(async ({ request, env }) => {
  if (!hasDb(env)) return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
  const session = await readUserSession(env, request);
  if (!session.ok) return json({ error: 'UNAUTHENTICATED' }, 401);
  const readings = await listReadingsForUser(env, session.uid);
  return json({ items: readings, readings });
});
