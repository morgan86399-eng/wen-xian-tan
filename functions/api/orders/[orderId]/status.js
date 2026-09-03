export async function onRequestGet({ params }) {
  const orderId = params.orderId;
  return new Response(JSON.stringify({
    success: true,
    orderId,
    status: 'PENDING',
    isPaid: false
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
