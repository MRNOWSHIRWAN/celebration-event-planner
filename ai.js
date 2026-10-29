'use strict';
const { buildPrompt, sanitizeAi } = require('./lib');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Single default model. Cross-model fallback on 429 is intentionally NOT done:
// free-tier daily quota is per project AND per model, and the shared key's other
// model buckets may be needed by GhostScribe. Until a separate project's quota
// bucket is verified and authorized, a daily-quota 429 degrades honestly.
const DEFAULT_MODEL = 'gemini-3.5-flash';

// Short-lived cache: identical inputs within a few minutes reuse the same real
// AI answer instead of spending quota again. The cache only ever stores
// genuine API responses; it never fabricates output.
const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;
function cacheKey(v) { return JSON.stringify([v.eventType, v.guests, v.budget, v.date, (v.city || '').toLowerCase(), (v.notes || '').toLowerCase()]); }

// Calls the Gemini REST API. The key comes from the GEMINI_API_KEY environment variable
// and never leaves the server. `fetchImpl` is injectable for tests.
async function generate(values, { apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL || DEFAULT_MODEL, fetchImpl = fetch, sleepImpl = wait, attempts = 3, cacheTtl = CACHE_TTL_MS } = {}) {
  if (!apiKey) {
    const e = new Error('AI is not configured on this server (GEMINI_API_KEY missing).');
    e.code = 'NO_KEY';
    throw e;
  }
  const ck = cacheKey(values);
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < cacheTtl) return hit.out;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  // The free tier sometimes answers 503 when busy; retry briefly, then give up honestly.
  let res;
  for (let i = 0; i < attempts; i++) {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(values) }] }],
        generationConfig: { temperature: 0.8, responseMimeType: 'application/json' }
      })
    });
    if (res.ok || res.status !== 503 || i === attempts - 1) break;
    await sleepImpl([3000, 8000, 15000][i] || 20000);
  }
  if (!res.ok) {
    const e = new Error(`AI service returned HTTP ${res.status}`);
    e.code = 'UPSTREAM';
    throw e;
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  const out = sanitizeAi(text);
  if (cacheTtl > 0) cache.set(ck, { at: Date.now(), out });
  return out;
}

module.exports = { generate, DEFAULT_MODEL };
