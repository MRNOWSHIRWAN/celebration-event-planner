'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const fn = require('../api/plan');

function mockReqRes(body) {
  const req = new EventEmitter();
  req.method = 'POST'; req.headers = {}; req.socket = { remoteAddress: '127.0.0.1' };
  req.destroy = () => {};
  const res = { status: null, body: null,
    writeHead(code) { this.status = code; },
    end(b) { this.body = JSON.parse(b); } };
  process.nextTick(() => { if (body != null) req.emit('data', Buffer.from(body)); req.emit('end'); });
  return { req, res };
}
const wait = (res) => new Promise((r) => { const t = setInterval(() => { if (res.body) { clearInterval(t); r(); } }, 5); });

test('vercel function validates input the same way as the local server', async () => {
  const { req, res } = mockReqRes(JSON.stringify({ eventType: 'birthday', guests: 0, budget: 100, date: '2020-01-01' }));
  fn(req, res); await wait(res);
  assert.equal(res.status, 422); assert.ok(res.body.errors.length >= 2);
});
test('vercel function returns a full plan without a key and stays honest about AI', async () => {
  delete process.env.GEMINI_API_KEY;
  const { req, res } = mockReqRes(JSON.stringify({ eventType: 'birthday', guests: 20, budget: 40000, date: '2099-01-01', city: 'Silchar' }));
  fn(req, res); await wait(res);
  assert.equal(res.status, 200);
  assert.equal(res.body.budget.total, 40000);
  assert.equal(res.body.ai, null); assert.match(res.body.aiError, /GEMINI_API_KEY/);
});
