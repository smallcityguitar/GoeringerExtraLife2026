'use strict';
// Local test server: node dev.js  (or: npm run dev)
// Serves /public and mounts the /api handlers with an in-memory store (no Redis needed).
const http = require('http');
const fs = require('fs');
const path = require('path');

process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'dev';
const PORT = Number(process.env.PORT) || 3000;
const PUB = path.join(__dirname, 'public');
const routes = {
  '/api/state': require('./api/state'),
  '/api/extralife': require('./api/extralife'),
};
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };

  const handler = routes[u.pathname];
  if (handler) {
    req.query = Object.fromEntries(u.searchParams);
    let raw = '';
    for await (const chunk of req) raw += chunk;
    try { req.body = raw ? JSON.parse(raw) : undefined; } catch (e) { req.body = raw; }
    return handler(req, res);
  }

  let file = u.pathname === '/' ? '/index.html' : u.pathname;
  if (!path.extname(file)) file += '.html';
  const full = path.join(PUB, path.normalize(file));
  if (!full.startsWith(PUB) || !fs.existsSync(full)) { res.statusCode = 404; return res.end('Not found'); }
  res.setHeader('Content-Type', types[path.extname(full)] || 'application/octet-stream');
  fs.createReadStream(full).pipe(res);
}).listen(PORT, () => {
  console.log(`Display:  http://localhost:${PORT}/`);
  console.log(`Control:  http://localhost:${PORT}/control   (admin token: ${process.env.ADMIN_TOKEN})`);
});
