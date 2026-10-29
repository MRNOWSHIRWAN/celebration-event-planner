'use strict';
// Vercel Function: POST /api/plan on the deployed site.
// Same logic as the local server; the Gemini key comes from the GEMINI_API_KEY
// environment variable set in the Vercel project, never from the repo.
const { handlePlan } = require('../handler');

module.exports = (req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }
  return handlePlan(req, res);
};
