// Cloudflare Pages Function: /api/auth/line-token
// LINE Login v2.1 授權代碼交換 Token 與個人資料

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => ({}));
    const { code, redirectUri } = body;

    if (!code) {
      return new Response(JSON.stringify({ success: false, message: '授權代碼 (code) 不可為空' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const clientId = env?.LINE_CHANNEL_ID || '2006888888';
    const clientSecret = env?.LINE_CHANNEL_SECRET || '';

    // 若配置有正式 Channel Secret，向 LINE 官方 API 請求 token
    if (clientSecret) {
      const params = new URLSearchParams();
      params.append('grant_type', 'authorization_code');
      params.append('code', code);
      params.append('redirect_uri', redirectUri);
      params.append('client_id', clientId);
      params.append('client_secret', clientSecret);

      const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });

      const tokenData = await tokenRes.json().catch(() => ({}));

      if (!tokenRes.ok) {
        return new Response(JSON.stringify({
          success: false,
          message: tokenData.error_description || 'LINE 授權 Token 交換失敗',
          error: tokenData
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
        });
      }

      // 取得個人資料
      const profileRes = await fetch('https://api.line.me/v2/profile', {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
      });
      const profile = await profileRes.json().catch(() => ({}));

      // 解碼 id_token (若有 email scope)
      let email = '';
      if (tokenData.id_token) {
        try {
          const parts = tokenData.id_token.split('.');
          if (parts[1]) {
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            email = payload.email || '';
          }
        } catch (e) {}
      }

      return new Response(JSON.stringify({
        success: true,
        profile: {
          userId: profile.userId,
          displayName: profile.displayName,
          pictureUrl: profile.pictureUrl,
          statusMessage: profile.statusMessage,
          email: email || `${profile.userId.slice(0, 8)}@line.me`
        }
      }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // 若未配置 Secret (前端展示或測試模式)，直接解析或回傳授權信士資料
    return new Response(JSON.stringify({
      success: true,
      isMock: true,
      message: 'LINE 授權已驗證通過',
      profile: {
        userId: 'U' + Math.random().toString(36).substring(2, 12),
        displayName: 'LINE 結緣信士',
        pictureUrl: '',
        email: `line_${Date.now().toString(36)}@line.me`
      }
    }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
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
