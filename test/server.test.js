'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createServer } = require('../server');
const { generate } = require('../ai');

const fakeAi = { ideas: [{ title: 'Garden tea', why: 'fits budget' }], checklist: [{ category: 'Food', items: ['Cake'] }], vendor_questions: ['Cancellation policy?'], tips: [] };
function start(deps) { return new Promise((r) => { const s = createServer(deps).listen(0, () => r(s)); }); }
const post = (s, body) => fetch(`http://localhost:${s.address().port}/api/plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const good = { eventType: 'birthday', guests: 20, budget: 40000, date: '2099-01-01', city: 'Silchar', notes: 'vegetarian' };

test('plan returns budget, timeline and AI sections, and AI output changes with input', async () => {
  const seen = [];
  const s = await start({ generate: async (v) => { seen.push(v); return { ...fakeAi, ideas: [{ title: 'For ' + v.city, why: 'x' }] }; } });
  const a = await (await post(s, good)).json();
  const b = await (await post(s, { ...good, city: 'Jaipur' })).json();
  assert.equal(a.budget.lines.reduce((x, l) => x + l.amount, 0), 40000);
  assert.equal(a.ai.ideas[0].title, 'For Silchar'); assert.equal(b.ai.ideas[0].title, 'For Jaipur');
  s.close();
});
test('invalid input gives 422 with errors', async () => {
  const s = await start({ generate: async () => fakeAi });
  const r = await post(s, { ...good, guests: -4 });
  assert.equal(r.status, 422); assert.ok((await r.json()).errors.length >= 1); s.close();
});
test('malformed JSON gives 400', async () => {
  const s = await start({ generate: async () => fakeAi });
  assert.equal((await post(s, '{oops')).status, 400); s.close();
});
test('AI failure still returns budget and timeline with an honest error', async () => {
  const s = await start({ generate: async () => { throw new Error('AI service returned HTTP 500'); } });
  const d = await (await post(s, good)).json();
  assert.equal(d.ai, null); assert.match(d.aiError, /500/); assert.ok(d.budget.lines.length); s.close();
});
test('generate() without a key fails clearly and never fakes output', async () => {
  await assert.rejects(() => generate(good, { apiKey: '' }), /GEMINI_API_KEY/);
});
test('generate() parses a Gemini-shaped reply and sends key in a header, not the URL', async () => {
  let call;
  const fetchImpl = async (url, opts) => { call = { url, opts }; return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(fakeAi) }] } }] }) }; };
  const out = await generate(good, { apiKey: 'K', fetchImpl, cacheTtl: 0 });
  assert.equal(out.ideas[0].title, 'Garden tea'); assert.ok(!call.url.includes('K')); assert.equal(call.opts.headers['x-goog-api-key'], 'K');
});
test('static page served, traversal blocked', async () => {
  const s = await start({}); const p = s.address().port;
  const home = await fetch(`http://localhost:${p}/`);
  assert.equal(home.status, 200); assert.match(await home.text(), /^<!doctype html>/i);
  assert.notEqual((await fetch(`http://localhost:${p}/..%2f..%2fetc/passwd`)).status, 200); s.close();
});
test('frontend script parses (syntax check)', () => {
  const { execFileSync } = require('node:child_process');
  execFileSync(process.execPath, ['--check', require('node:path').join(__dirname, '..', 'public', 'app.js')]);
});
test('generate() retries a busy free-tier reply, then succeeds', async () => {
  let calls = 0;
  const fetchImpl = async () => (++calls === 1 ? { ok: false, status: 503 } : { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(fakeAi) }] } }] }) });
  const out = await generate(good, { apiKey: 'K', fetchImpl, sleepImpl: async () => {}, cacheTtl: 0 });
  assert.equal(calls, 2); assert.equal(out.ideas[0].title, 'Garden tea');
});
test('generate() stops retrying and reports the last status honestly', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: false, status: 503 }; };
  await assert.rejects(() => generate(good, { apiKey: 'K', fetchImpl, sleepImpl: async () => {}, cacheTtl: 0 }), /503/);
  assert.equal(calls, 3);
});

test('generate() does NOT hop models on daily-quota 429; it reports the status honestly', async () => {
  const urls = [];
  const fetchImpl = async (url) => { urls.push(url); return { ok: false, status: 429 }; };
  await assert.rejects(() => generate(good, { apiKey: 'K', fetchImpl, sleepImpl: async () => {}, cacheTtl: 0 }), /429/);
  assert.equal(urls.length, 1); // one call only: no model hopping, no quota probing of other buckets
});
test('generate() reuses a real cached answer for identical inputs instead of spending quota', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(fakeAi) }] } }] }) }; };
  const input = { ...good, notes: 'cache-me-' + Date.now() };
  await generate(input, { apiKey: 'K', fetchImpl });
  const again = await generate(input, { apiKey: 'K', fetchImpl });
  assert.equal(calls, 1); assert.equal(again.ideas[0].title, 'Garden tea');
});
