export async function onRequestGet({ env }) {
  return new Response(JSON.stringify({
    success: true,
    brandName: env?.BRAND_NAME || '問仙壇 · 掌心解碼',
    provider: 'Portaly (傳送門)',
    portalyUrl: env?.PORTALY_URL || 'https://portaly.cc/kaiyun_ai',
    googleClientId: env?.GOOGLE_CLIENT_ID || '1029384756-wenxiantan.apps.googleusercontent.com',
    lineChannelId: env?.LINE_CHANNEL_ID || '2006888888',
    hasResend: !!env?.RESEND_API_KEY,
    isDevMode: false
  }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
