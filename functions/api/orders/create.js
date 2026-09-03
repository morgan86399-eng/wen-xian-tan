export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const { planId, planName, themes, amount, userName, userEmail } = body;

    const timestamp = Date.now().toString(36).toUpperCase();
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const orderId = `ORD-WXT-${timestamp}-${randomSuffix}`;

    const portalyUrl = env?.PORTALY_URL || 'https://portaly.cc/kaiyun_ai';
    const delimiter = portalyUrl.includes('?') ? '&' : '?';
    const portalyCheckoutUrl = `${portalyUrl}${delimiter}order_id=${encodeURIComponent(orderId)}&ref=${encodeURIComponent(orderId)}`;

    const order = {
      id: orderId,
      planId: planId || 'single',
      planName: planName || '問仙壇 · 命理解析方案',
      themes: Array.isArray(themes) ? themes : [],
      amount: Number(amount) || 199,
      currency: 'TWD',
      status: 'PENDING',
      userName: userName || '緣主',
      userEmail: userEmail || '',
      createdAt: new Date().toISOString(),
      paidAt: null,
      paymentMethod: 'Portaly 傳送門 (信用卡 / LINE Pay / 超商)',
      portalyCheckoutUrl
    };

    return new Response(JSON.stringify({ success: true, order }), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
