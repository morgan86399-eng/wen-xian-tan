/* 全域錯誤攔截：結構化 JSON，不洩漏 stack／secret */

export async function onRequest(context) {
  try {
    return await context.next();
  } catch (err) {
    const debug = String((context.env && context.env.DEBUG) || '') === 'true';
    const message = err && err.name === 'ConfigError'
      ? 'SERVICE_UNAVAILABLE'
      : 'INTERNAL_ERROR';
    const body = { error: message };
    if (debug) {
      body.debug = String(err && err.message ? err.message : err);
      if (err && err.stack) body.stack = err.stack;
    }
    console.error('middleware error:', err);
    return new Response(JSON.stringify(body), {
      status: message === 'SERVICE_UNAVAILABLE' ? 503 : 500,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
    });
  }
}
