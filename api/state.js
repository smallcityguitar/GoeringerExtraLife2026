'use strict';
const { loadState, saveState, applyPatch, testAlertPatch, checkAuth, HAS_REDIS } = require('./_store');

// GET  -> public: current display state + server time (for clock sync)
// POST -> requires x-admin-token header. Body: { patch: {...} } | { action: 'testAlert' | 'verify' }
module.exports = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'GET') {
      const state = await loadState();
      return res.status(200).json({ state, serverTime: Date.now() });
    }

    if (req.method === 'POST') {
      const auth = checkAuth(req);
      if (auth === 'unconfigured') {
        return res.status(500).json({ error: 'ADMIN_TOKEN environment variable is not set on the server.' });
      }
      if (auth !== 'ok') return res.status(401).json({ error: 'Wrong admin token.' });

      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      body = body && typeof body === 'object' ? body : {};

      const cur = await loadState();

      if (body.action === 'verify') {
        return res.status(200).json({ state: cur, serverTime: Date.now(), persistent: HAS_REDIS });
      }

      const next = body.action === 'testAlert' ? testAlertPatch(cur, body) : applyPatch(cur, body.patch);
      await saveState(next);
      return res.status(200).json({ state: next, serverTime: Date.now(), persistent: HAS_REDIS });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status((err && err.status) || 500).json({ error: String(err && err.message ? err.message : err) });
  }
};
