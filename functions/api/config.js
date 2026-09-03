export async function onRequestGet({ env }) {
  return new Response(JSON.stringify({
    success: true,
    brandName: env?.BRAND_NAME || '問仙壇 · 掌心解碼',
    provider: 'Portaly (傳送門)',
    portalyUrl: env?.PORTALY_URL || 'https://portaly.cc/kaiyun_ai',
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
