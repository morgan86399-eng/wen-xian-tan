export async function onRequestGet({ env }) {
  return new Response(JSON.stringify({
    success: true,
    brandName: env?.BRAND_NAME || '問仙壇',
    provider: 'ECPay',
    hasResend: Boolean(env?.RESEND_API_KEY),
    hasLine: Boolean(env?.LINE_CHANNEL_ID && env?.LINE_CHANNEL_SECRET),
    hasGoogle: Boolean(env?.GOOGLE_CLIENT_ID && env?.GOOGLE_CLIENT_SECRET),
    lineOaUrl: String(env?.LINE_OA_URL || '').trim(),
    allowDevLogin: String(env?.ALLOW_DEV_LOGIN || '') === 'true',
    paymentsEnabled: String(env?.PAYMENTS_ENABLED || '') === 'true'
  }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}
