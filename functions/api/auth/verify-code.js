// Cloudflare Pages Function: /api/auth/verify-code
// 驗證 6 碼 OTP 與簽署 Token

async function generateSignature(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret || 'wen-xian-tan-celestial-auth-salt-2026'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = (body.email || '').trim().toLowerCase();
    const code = (body.code || '').trim();
    const token = body.token;

    if (!email || !code || !token) {
      return new Response(JSON.stringify({ success: false, message: '請輸入完整的 6 位數驗證碼' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
      });
    }

    let parsedToken;
    try {
      parsedToken = JSON.parse(atob(token));
    } catch (e) {
      return new Response(JSON.stringify({ success: false, message: '驗證憑證格式無效，請重新獲取驗證碼' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
      });
    }

    if (parsedToken.email !== email) {
      return new Response(JSON.stringify({ success: false, message: '電子信箱與驗證憑證不吻合' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
      });
    }

    if (Date.now() > parsedToken.expiresAt) {
      return new Response(JSON.stringify({ success: false, message: '驗證碼已逾期，請重新索取' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const secret = env?.AUTH_SECRET || 'wen-xian-tan-celestial-auth-salt-2026';
    const payload = `${parsedToken.email}|${parsedToken.code}|${parsedToken.expiresAt}|${parsedToken.purpose}`;
    const expectedSig = await generateSignature(secret, payload);

    if (expectedSig !== parsedToken.sig) {
      return new Response(JSON.stringify({ success: false, message: '驗證憑證簽章偽造無效' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
      });
    }

    if (parsedToken.code !== code) {
      return new Response(JSON.stringify({ success: false, message: '驗證碼不正確，請仔細核對後再試' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // 驗證成功
    return new Response(JSON.stringify({
      success: true,
      verified: true,
      email,
      message: '信箱驗證成功！'
    }), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
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
