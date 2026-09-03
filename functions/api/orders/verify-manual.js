export async function onRequestPost({ request }) {
  try {
    const body = await request.json().catch(() => ({}));
    const { orderId, queryCode } = body;

    const cleanCode = (queryCode || '').trim();
    if (cleanCode === 'VIP-LUCKY-2026' || (orderId && cleanCode.toUpperCase() === orderId.toUpperCase())) {
      const order = {
        id: orderId || 'VIP-MANUAL',
        status: 'PAID',
        paidAt: new Date().toISOString(),
        paymentMethod: '體驗碼 VIP 驗證開通'
      };
      return new Response(JSON.stringify({ success: true, message: '驗證開通成功！', order }), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    return new Response(JSON.stringify({ success: false, message: '無效的單號或體驗碼' }), {
      status: 400,
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
