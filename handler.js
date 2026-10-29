'use strict';
const { validate, budgetPlan, timeline } = require('./lib');
const { generate } = require('./ai');

// Simple per-IP rate limit so a public demo cannot burn the AI quota.
// On serverless (Vercel) this applies per warm instance; it still caps casual abuse.
const hits = new Map();
function limited(ip, max = 10, windowMs = 60000) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > max;
}

function sendJson(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json', 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

// Shared POST /api/plan logic. Works both in the local server (server.js)
// and as a Vercel Function (api/plan.js) - both call this with (req, res).
function handlePlan(req, res, deps = {}) {
  const gen = deps.generate || generate;
  const ip = req.socket?.remoteAddress || req.headers?.['x-forwarded-for'] || 'unknown';
  if (limited(ip)) return sendJson(res, 429, { error: 'Too many requests. Wait a minute and try again.' });
  let size = 0; const chunks = [];
  req.on('data', (c) => { size += c.length; if (size > 10000) req.destroy(); else chunks.push(c); });
  req.on('end', async () => {
    let input;
    try { input = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { return sendJson(res, 400, { error: 'Request body must be JSON.' }); }
    const v = validate(input);
    if (!v.ok) return sendJson(res, 422, { errors: v.errors });
    const value = v.value;
    const base = { input: value, budget: budgetPlan(value.eventType, value.budget, value.guests), timeline: timeline(value.eventType, value.date) };
    try {
      const ai = await gen(value);
      sendJson(res, 200, { ...base, ai });
    } catch (e) {
      // Budget and timeline are still useful without the model; say clearly that the AI part failed.
      const code = e.code === 'NO_KEY' ? 503 : 502;
      sendJson(res, 200, { ...base, ai: null, aiError: e.message, aiStatus: code });
    }
  });
}

module.exports = { handlePlan, sendJson };
