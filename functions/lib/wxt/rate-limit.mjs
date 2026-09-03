/* KV 速率限制（/api/auth/* 基本防濫用） */

import { clientIp } from './http.mjs';

function now() {
  return Math.floor(Date.now() / 1000);
}

export function hasKv(env) {
  return Boolean(env && env.RL && typeof env.RL.get === 'function');
}

/**
 * @returns {Promise<{allowed: boolean, count: number}>}
 */
export async function hitKvRateLimit(env, bucket, limit, windowSeconds) {
  if (!hasKv(env)) return { allowed: true, count: 0, durable: false };

  const stamp = now();
  const key = `rl:${bucket}`;
  const raw = await env.RL.get(key);
  let count = 1;
  let windowEnd = stamp + windowSeconds;

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.windowEnd >= stamp) {
        count = (parsed.count || 0) + 1;
        windowEnd = parsed.windowEnd;
      }
    } catch {
      // 壞資料就重置
    }
  }

  await env.RL.put(key, JSON.stringify({ count, windowEnd }), { expirationTtl: windowSeconds + 60 });
  return { allowed: count <= limit, count, durable: true };
}

export async function authRateLimit(env, request, { email = '', perEmailLimit = 5, perIpLimit = 10, windowSeconds = 3600 } = {}) {
  const ip = clientIp(request);
  const ipResult = await hitKvRateLimit(env, `auth-ip:${ip}`, perIpLimit, 60);
  if (!ipResult.allowed) return { allowed: false, reason: 'ip' };
  if (email) {
    const emailResult = await hitKvRateLimit(env, `auth-email:${email}`, perEmailLimit, windowSeconds);
    if (!emailResult.allowed) return { allowed: false, reason: 'email' };
  }
  return { allowed: true };
}
