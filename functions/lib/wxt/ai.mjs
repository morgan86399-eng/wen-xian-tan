/* Groq 文字／vision + Workers AI 備援 */

import { fetchWithTimeout } from './http.mjs';
import { requireGroq } from './auth.mjs';

function extractText(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload.response === 'string') return payload.response;
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

const TEXT_MODEL_DEFAULT = 'llama-3.3-70b-versatile';
const VISION_MODEL_DEFAULT = 'llama-4-scout-17b-16e-instruct';
const WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

export async function callGroqText(env, messages, { model, maxTokens = 1800, temperature = 0.55 } = {}) {
  const apiKey = requireGroq(env);
  const response = await fetchWithTimeout(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || env.GROQ_TEXT_MODEL || TEXT_MODEL_DEFAULT,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages
      })
    },
    25000,
    'Groq'
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Groq 回應 ${response.status}${detail ? `：${detail.slice(0, 200)}` : ''}`);
  }
  const payload = await response.json();
  const text = extractText(payload);
  const tokens = Number(payload.usage && payload.usage.total_tokens) || 0;
  return { text, parsed: parseModelJson(text), model: model || env.GROQ_TEXT_MODEL || TEXT_MODEL_DEFAULT, tokens };
}

export async function callGroqVision(env, imageBase64, { model } = {}) {
  const apiKey = requireGroq(env);
  const dataUrl = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
  const response = await fetchWithTimeout(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || env.GROQ_VISION_MODEL || VISION_MODEL_DEFAULT,
        temperature: 0.2,
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: '只描述掌心線條走向與紋路特徵，不下結論、不給建議。' },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }]
      })
    },
    25000,
    'Groq Vision'
  );
  if (!response.ok) throw new Error(`Groq Vision 回應 ${response.status}`);
  const payload = await response.json();
  const text = extractText(payload);
  const tokens = Number(payload.usage && payload.usage.total_tokens) || 0;
  return { text: String(text || '').trim(), model: model || env.GROQ_VISION_MODEL || VISION_MODEL_DEFAULT, tokens };
}

export async function callWorkersAi(env, messages, { maxTokens = 1800, temperature = 0.55 } = {}) {
  if (!env.AI || typeof env.AI.run !== 'function') throw new Error('Workers AI 未綁定');
  const result = await env.AI.run(WORKERS_AI_MODEL, {
    messages,
    max_tokens: maxTokens,
    temperature
  });
  const text = extractText(result);
  return { text, parsed: parseModelJson(text), model: WORKERS_AI_MODEL, tokens: 0 };
}

export async function generateReport(env, { systemPrompt, userPrompt }) {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];
  try {
    return await callGroqText(env, messages);
  } catch (groqError) {
    try {
      return await callWorkersAi(env, messages);
    } catch (aiError) {
      const err = new Error(`${groqError.message} | ${aiError.message}`);
      err.groqError = groqError;
      err.aiError = aiError;
      throw err;
    }
  }
}
