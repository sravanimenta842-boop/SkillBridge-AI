'use strict';
/**
 * Provider-agnostic AI client. Keys come from environment variables only.
 *
 *   AI_PROVIDER = gemini | openai | anthropic
 *   AI_API_KEY  = your secret key
 *   AI_MODEL    = optional model override
 *   AI_BASE_URL = optional base URL (OpenAI-compatible providers, proxies, tests)
 */
const config = require('./config');
const { HttpError } = require('./http');

const DEFAULTS = {
  gemini:    { model: 'gemini-flash-latest',  baseUrl: 'https://generativelanguage.googleapis.com/v1beta', fallbacks: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'] },
  openai:    { model: 'gpt-4o-mini',          baseUrl: 'https://api.openai.com/v1' },
  anthropic: { model: 'claude-sonnet-5',    baseUrl: 'https://api.anthropic.com' },
};

function settings() {
  const p = config.ai.provider;
  if (!DEFAULTS[p]) throw new HttpError(500, `Unsupported AI_PROVIDER "${p}". Use gemini, openai or anthropic.`);
  return {
    provider: p,
    model: config.ai.model || DEFAULTS[p].model,
    baseUrl: (config.ai.baseUrl || DEFAULTS[p].baseUrl).replace(/\/+$/, ''),
  };
}

function fallbackModels() {
  const p = config.ai.provider;
  const list = config.ai.fallbackModels.length ? config.ai.fallbackModels : (DEFAULTS[p].fallbacks || []);
  return list;
}

function ensureConfigured() {
  if (!config.aiConfigured()) {
    throw new HttpError(503, 'The AI service is not configured yet. Ask the administrator to set AI_API_KEY in the server .env file.');
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);
const BUSY_MSG = 'The AI service is very busy right now (the provider is temporarily overloaded). We already retried automatically – please wait a minute and try again.';

/**
 * POST helper with exponential backoff + jitter. Overload / rate-limit / 5xx are retried;
 * if they persist the thrown error is flagged `retryable` so callers can fall back to another model.
 */
async function httpJson(url, init, attempts = config.ai.retries) {
  const base = config.ai.retryBaseMs;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), config.ai.timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { /* keep raw text */ }
      if (res.ok) return data;
      const msg = (data && (data.error?.message || data.message)) || text.slice(0, 200) || res.statusText;
      console.warn(`[ai] provider returned ${res.status} (attempt ${i + 1}/${attempts}): ${String(msg).slice(0, 160)}`);
      if (RETRYABLE.has(res.status)) {
        lastErr = new HttpError(res.status === 429 ? 429 : 503, BUSY_MSG);
        lastErr.retryable = true;
      } else {
        throw new HttpError(502, `AI provider error (${res.status}): ${msg}`); // e.g. bad key / bad request: do not retry
      }
    } catch (e) {
      if (e instanceof HttpError) { if (!e.retryable) throw e; }
      else if (e.name === 'AbortError') { lastErr = new HttpError(504, 'The AI service took too long to respond. Please try again.'); lastErr.retryable = true; }
      else { lastErr = new HttpError(502, `Could not reach the AI provider: ${e.cause?.code || e.message}`); lastErr.retryable = true; }
    } finally { clearTimeout(timer); }
    if (i < attempts - 1) await sleep(base * 2 ** i + Math.random() * base * 0.5);
  }
  throw lastErr;
}

/* ---------- Providers ---------- */
async function callGemini({ system, messages, json, temperature }) {
  const s = settings();
  const body = {
    contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    generationConfig: {},
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (json) body.generationConfig.responseMimeType = 'application/json';
  if (temperature !== undefined) body.generationConfig.temperature = temperature;
  // Primary model first; if it stays overloaded, fall back to the alternatives (AI_FALLBACK_MODELS).
  const models = [s.model, ...fallbackModels().filter((m) => m !== s.model)];
  let data; let lastErr;
  for (let k = 0; k < models.length; k++) {
    try {
      data = await httpJson(`${s.baseUrl}/models/${encodeURIComponent(models[k])}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.ai.apiKey },
        body: JSON.stringify(body),
      }, k === 0 ? config.ai.retries : Math.min(2, config.ai.retries));
      if (k > 0) console.warn(`[ai] answered by fallback model ${models[k]}`);
      break;
    } catch (e) {
      lastErr = e;
      if (!e.retryable || k === models.length - 1) throw e;
      console.warn(`[ai] model ${models[k]} unavailable, trying ${models[k + 1]}`);
    }
  }
  if (!data) throw lastErr;
  const cand = data?.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p) => p.text || '').join('');
  if (!text) {
    const reason = data?.promptFeedback?.blockReason || cand?.finishReason || 'empty response';
    throw new HttpError(502, `The AI returned no content (${reason}). Please rephrase and try again.`);
  }
  return text;
}

async function callOpenAI({ system, messages, json, temperature }) {
  const s = settings();
  const msgs = [];
  if (system) msgs.push({ role: 'system', content: system });
  for (const m of messages) msgs.push({ role: m.role, content: m.content });
  const body = { model: s.model, messages: msgs };
  if (json) body.response_format = { type: 'json_object' };
  if (temperature !== undefined) body.temperature = temperature;
  const data = await httpJson(`${s.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.ai.apiKey}` },
    body: JSON.stringify(body),
  });
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new HttpError(502, 'The AI returned no content. Please try again.');
  return text;
}

async function callAnthropic({ system, messages, json, temperature }) {
  const s = settings();
  const body = {
    model: s.model,
    max_tokens: 8000,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };
  if (system) body.system = system + (json ? '\n\nRespond with a single valid JSON object only. No prose, no markdown fences.' : '');
  if (temperature !== undefined) body.temperature = temperature;
  const data = await httpJson(`${s.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': config.ai.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  });
  const text = (data?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  if (!text) throw new HttpError(502, 'The AI returned no content. Please try again.');
  return text;
}

const PROVIDERS = { gemini: callGemini, openai: callOpenAI, anthropic: callAnthropic };

/** Free-form chat completion → string. */
async function chat({ system, messages, temperature }) {
  ensureConfigured();
  return PROVIDERS[settings().provider]({ system, messages, json: false, temperature });
}

/** Pull a JSON object out of a model reply (handles ```json fences and stray prose). */
function extractJson(text) {
  let t = String(text).trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error('No JSON object found');
}

/**
 * Structured generation: returns a parsed object. Retries once when the model
 * produces malformed JSON. `validate(obj)` may throw to request another try.
 */
async function generateJSON({ system, prompt, temperature, validate, tries = 2 }) {
  ensureConfigured();
  const call = PROVIDERS[settings().provider];
  let lastErr;
  let userPrompt = prompt;
  for (let i = 0; i < tries; i++) {
    const text = await call({ system, messages: [{ role: 'user', content: userPrompt }], json: true, temperature });
    try {
      const obj = extractJson(text);
      return validate ? validate(obj) : obj;
    } catch (e) {
      if (e instanceof HttpError) throw e; // deliberate rejections (e.g. 422) are not retried
      lastErr = e;
      userPrompt = `${prompt}\n\nIMPORTANT: your previous reply was rejected (${String(e.message).slice(0, 200)}). Reply again with ONLY one valid JSON object that follows the requested structure exactly.`;
    }
  }
  throw new HttpError(502, `The AI response could not be processed (${lastErr?.message || 'invalid format'}). Please try again.`);
}

module.exports = { chat, generateJSON, extractJson, ensureConfigured, settings };
