// Cloudflare Pages Function: /api/auth/send-code
// 支援真實發送 Email (Resend API) 與仙壇靈函即時簽署驗證

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
    const purpose = body.purpose || 'login';

    if (!email || !email.includes('@')) {
      return new Response(JSON.stringify({ success: false, message: '請提供有效的電子信箱地址' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // 生成 6 位隨機數字驗證碼
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5分鐘效期
    const secret = env?.AUTH_SECRET || 'wen-xian-tan-celestial-auth-salt-2026';
    const payload = `${email}|${code}|${expiresAt}|${purpose}`;
    const sig = await generateSignature(secret, payload);
    const token = btoa(JSON.stringify({ email, code, expiresAt, purpose, sig }));

    const subject = `【問仙壇】信士仙緣驗證碼：${code}`;
    const html = `
      <div style="font-family:'Noto Serif TC',Georgia,serif;background:#0C0A1C;color:#F3F4F6;padding:32px;max-width:540px;margin:0 auto;border-radius:12px;border:1px solid #D4AF37;">
        <div style="text-align:center;margin-bottom:24px;">
          <h2 style="color:#F59E0B;font-size:24px;margin:0 0 8px;">🔮 問仙壇 · 掌心解碼</h2>
          <p style="color:#9CA3AF;font-size:14px;margin:0;">誠心叩問 · 仙佛指引 · 天道酬勤</p>
        </div>
        <div style="background:rgba(255,255,255,0.05);border:1px dashed rgba(212,175,55,0.4);border-radius:8px;padding:20px;text-align:center;margin-bottom:24px;">
          <p style="font-size:15px;color:#D1D5DB;margin:0 0 12px;">信士您好，您於仙壇申請之安全驗證碼如下：</p>
          <div style="font-size:36px;font-weight:900;letter-spacing:8px;color:#FDE68A;background:#1A162B;padding:12px 20px;border-radius:8px;display:inline-block;border:1px solid #F59E0B;">
            ${code}
          </div>
          <p style="font-size:13px;color:#9CA3AF;margin:12px 0 0;">驗證碼於 5 分鐘內有效，切勿洩漏給他人。</p>
        </div>
        <p style="font-size:12px;color:#6B7280;line-height:1.6;margin:0;border-top:1px solid rgba(255,255,255,0.1);padding-top:16px;">
          此信件由「問仙壇」安全系統自動發送。若您未曾發起此驗證請求，請忽略此信件。
        </p>
      </div>
    `;

    let emailSent = false;
    let emailError = null;

    // 若配置有 Resend API Key，直接發送真實信件
    if (env?.RESEND_API_KEY) {
      try {
        const fromEmail = env?.FROM_EMAIL || '問仙壇 <service@wenxiantan.taoyuanyangxintuina.shop>';
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [email],
            subject: subject,
            html: html
          })
        });

        if (resendRes.ok) {
          emailSent = true;
        } else {
          const errData = await resendRes.json().catch(() => ({}));
          emailError = errData.message || 'Resend API rejected';
          console.warn('Resend email error:', emailError);
        }
      } catch (err) {
        emailError = err.message;
        console.warn('Failed to call Resend API:', err);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: emailSent ? '驗證碼信件已成功發送至您的信箱！' : '仙壇靈函已生成安全驗證碼',
      emailSent,
      emailError,
      token,
      expiresAt,
      preview: {
        code,
        subject,
        html,
        timestamp: new Date().toISOString()
      }
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
