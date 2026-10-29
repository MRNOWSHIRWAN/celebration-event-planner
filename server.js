'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { handlePlan, sendJson } = require('./handler');

const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'content-type': type, 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function createServer(deps = {}) {
  return http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') return send(res, 200, { ok: true });
    if (req.method === 'POST' && req.url === '/api/plan') return handlePlan(req, res, deps);
    if (req.method === 'GET') {
      const rel = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0];
      const file = path.normalize(path.join(PUBLIC, rel));
      if (!file.startsWith(PUBLIC)) return send(res, 403, 'Forbidden', 'text/plain');
      return fs.readFile(file, (err, data) => (err ? send(res, 404, 'Not found', 'text/plain') : send(res, 200, data, TYPES[path.extname(file)] || 'application/octet-stream')));
    }
    send(res, 405, { error: 'Method not allowed' });
  });
}

if (require.main === module) {
  const port = process.env.PORT || 8080;
  createServer().listen(port, () => console.log(`Event planner on http://localhost:${port}`));
}
module.exports = { createServer };
