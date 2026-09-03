export async function onRequestPost({ request }) {
  try {
    const body = await request.json().catch(() => ({}));
    const orderId = body.orderId || `ORD-MOCK-${Date.now()}`;

    const order = {
      id: orderId,
      status: 'PAID',
      paidAt: new Date().toISOString(),
      paymentMethod: '開發者模擬付款 (Dev Mock)'
    };

    return new Response(JSON.stringify({ success: true, message: '模擬付款成功！', order }), {
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
