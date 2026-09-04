/* Gemini 主 → Groq 備 → Workers AI 再備 */

import { fetchWithTimeout } from './http.mjs';
import { requireGroq } from './auth.mjs';

/* 3.7-flash 回 503、3.6-flash 從 Cloudflare 打過去每次逾時，實測 3.5-flash 穩定約 1.3 秒 */
const GEMINI_TEXT_DEFAULT = 'gemini-3.5-flash';
const GEMINI_VISION_DEFAULT = 'gemini-3.5-flash';
/* 次選型號預設關閉：多掛一支只是多一輪逾時，主力失敗直接交給 Groq 比較快 */
const GEMINI_TEXT_FALLBACK_DEFAULT = '';
const TEXT_MODEL_DEFAULT = 'openai/gpt-oss-120b';
const VISION_MODEL_DEFAULT = 'qwen/qwen3.8-27b';
const WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const PALM_VISION_PROMPT = '只描述掌心線條走向與紋路特徵，不下結論、不給建議。';

function envText(env, name) {
  return String((env && env[name]) || '').trim();
}

export function hasGemini(env) {
  return Boolean(envText(env, 'GEMINI_API_KEY'));
}

export function hasGroq(env) {
  return Boolean(envText(env, 'GROQ_API_KEY'));
}

function extractText(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload.response === 'string') return payload.response;
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  if (candidates.length) {
    const parts = (candidates[0].content && candidates[0].content.parts) || [];
    const gemini = parts.map((part) => (part && part.text) || '').join('');
    if (gemini) return gemini;
  }
  const choice = Array.isArray(payload.choices) ? payload.choices[0] : null;
  if (choice) {
    const message = choice.message || {};
    if (typeof message.content === 'string') return message.content;
    if (Array.isArray(message.content)) {
      return message.content.map((part) => (part && part.text) || '').join('');
    }
    if (typeof choice.text === 'string') return choice.text;
  }
  return '';
}

function parseModelJson(text) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced ? fenced[1] : '', raw];
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(raw.slice(firstBrace, lastBrace + 1));
  }
  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (!value.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      /* 下一筆 */
    }
  }
  return null;
}

function usageTokens(payload) {
  if (payload && payload.usageMetadata && payload.usageMetadata.totalTokenCount != null) {
    return Number(payload.usageMetadata.totalTokenCount) || 0;
  }
  return Number(payload && payload.usage && payload.usage.total_tokens) || 0;
}

function geminiModel(env, kind) {
  if (kind === 'vision') return envText(env, 'GEMINI_VISION_MODEL') || GEMINI_VISION_DEFAULT;
  return envText(env, 'GEMINI_TEXT_MODEL') || GEMINI_TEXT_DEFAULT;
}

function geminiTextFallbackModel(env) {
  return envText(env, 'GEMINI_TEXT_MODEL_FALLBACK') || GEMINI_TEXT_FALLBACK_DEFAULT;
}

function groqTextModel(env, model) {
  return model || envText(env, 'GROQ_TEXT_MODEL') || TEXT_MODEL_DEFAULT;
}

function groqVisionModel(env, model) {
  return model || envText(env, 'GROQ_VISION_MODEL') || VISION_MODEL_DEFAULT;
}

function splitPalmDataUrl(imageBase64) {
  const raw = String(imageBase64 || '').trim();
  const match = raw.match(/^data:([^;]+);base64,(.+)$/i);
  if (match) return { mime: match[1], data: match[2] };
  return { mime: 'image/jpeg', data: raw };
}

function geminiContentsFromMessages(messages) {
  const systemParts = [];
  const contents = [];
  for (const message of messages || []) {
    const text = typeof message.content === 'string'
      ? message.content
      : Array.isArray(message.content)
        ? message.content.map((part) => (part && part.text) || '').join('')
        : '';
    if (message.role === 'system') {
      if (text) systemParts.push({ text });
      continue;
    }
    contents.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text }]
    });
  }
  return {
    contents,
    systemInstruction: systemParts.length ? { parts: systemParts } : null
  };
}

/* 從 Cloudflare 打 Gemini 實測要 15 秒以上（本機只要 1.3 秒），逾時設 15 秒會全部落空；60 秒又只是多等，實測 30 秒最划算 */
async function callGeminiGenerate(env, { model, body, label }) {
  const apiKey = envText(env, 'GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY 未設定');
  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body)
    },
    30000,
    label
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Gemini 回應 ${response.status}${detail ? `：${detail.slice(0, 200)}` : ''}`);
  }
  return response.json();
}

export async function callGeminiText(env, messages, { model, maxTokens = 8192, temperature = 0.55 } = {}) {
  const usedModel = model || geminiModel(env, 'text');
  const { contents, systemInstruction } = geminiContentsFromMessages(messages);
  const body = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      responseMimeType: 'application/json'
    }
  };
  if (systemInstruction) body.systemInstruction = systemInstruction;
  const payload = await callGeminiGenerate(env, { model: usedModel, body, label: 'Gemini' });
  const text = extractText(payload);
  return { text, parsed: parseModelJson(text), model: usedModel, tokens: usageTokens(payload) };
}

export async function callGeminiVision(env, imageBase64, { model } = {}) {
  const usedModel = model || geminiModel(env, 'vision');
  const { mime, data } = splitPalmDataUrl(imageBase64);
  const payload = await callGeminiGenerate(env, {
    model: usedModel,
    label: 'Gemini Vision',
    body: {
      contents: [{
        role: 'user',
        parts: [
          { text: PALM_VISION_PROMPT },
          { inlineData: { mimeType: mime, data } }
        ]
      }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 600 }
    }
  });
  return { text: String(extractText(payload) || '').trim(), model: usedModel, tokens: usageTokens(payload) };
}

/* Groq 這把金鑰每分鐘 8000 token（x-ratelimit-limit-tokens），額度按「實際用量」扣，
   但 max_tokens 不能大於分鐘上限，填 8192 會被退件。實測 8000 可以正常回（7.7 秒，實用 3671）。 */
const GROQ_MAX_TOKENS = 8000;

export async function callGroqText(env, messages, { model, maxTokens = GROQ_MAX_TOKENS, temperature = 0.55 } = {}) {
  const apiKey = requireGroq(env);
  const usedModel = groqTextModel(env, model);
  const response = await fetchWithTimeout(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: usedModel,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages
      })
    },
    30000,
    'Groq'
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Groq 回應 ${response.status}${detail ? `：${detail.slice(0, 200)}` : ''}`);
  }
  const payload = await response.json();
  const text = extractText(payload);
  return { text, parsed: parseModelJson(text), model: usedModel, tokens: usageTokens(payload) };
}

export async function callGroqVision(env, imageBase64, { model } = {}) {
  const apiKey = requireGroq(env);
  const usedModel = groqVisionModel(env, model);
  const dataUrl = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
  const response = await fetchWithTimeout(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: usedModel,
        temperature: 0.2,
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: PALM_VISION_PROMPT },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }]
      })
    },
    30000,
    'Groq Vision'
  );
  if (!response.ok) throw new Error(`Groq Vision 回應 ${response.status}`);
  const payload = await response.json();
  return { text: String(extractText(payload) || '').trim(), model: usedModel, tokens: usageTokens(payload) };
}

export async function callWorkersAi(env, messages, { maxTokens = 8192, temperature = 0.55 } = {}) {
  if (!env.AI || typeof env.AI.run !== 'function') throw new Error('Workers AI 未綁定');
  const result = await env.AI.run(WORKERS_AI_MODEL, {
    messages,
    max_tokens: maxTokens,
    temperature
  });
  const text = extractText(result);
  return { text, parsed: parseModelJson(text), model: WORKERS_AI_MODEL, tokens: 0 };
}

async function firstAvailable(attempts) {
  const errors = [];
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      // 供應商掉下去要吵，不然只會看到最後成功的那家，查不出前面為什麼失敗
      console.warn(`[AI 供應商失敗] ${error && error.message ? error.message : error}`);
      errors.push(error);
    }
  }
  const err = new Error(errors.map((item) => item.message).join(' | ') || '沒有可用的模型供應商');
  err.errors = errors;
  throw err;
}

export async function generateReport(env, { systemPrompt, userPrompt }) {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];
  const attempts = [];
  if (hasGemini(env)) {
    const primary = geminiModel(env, 'text');
    const fallback = geminiTextFallbackModel(env);
    attempts.push(() => callGeminiText(env, messages, { model: primary }));
    // 主力型號滿載（503）時，同一把金鑰換一個型號再試，還輪不到 Groq
    if (fallback && fallback !== primary) {
      attempts.push(() => callGeminiText(env, messages, { model: fallback }));
    }
  }
  if (hasGroq(env)) attempts.push(() => callGroqText(env, messages));
  attempts.push(() => callWorkersAi(env, messages));
  return firstAvailable(attempts);
}

export async function describePalm(env, imageBase64) {
  const attempts = [];
  if (hasGemini(env)) attempts.push(() => callGeminiVision(env, imageBase64));
  if (hasGroq(env)) attempts.push(() => callGroqVision(env, imageBase64));
  if (!attempts.length) return { text: '', model: '', tokens: 0 };
  try {
    return await firstAvailable(attempts);
  } catch {
    return { text: '', model: '', tokens: 0 };
  }
}
