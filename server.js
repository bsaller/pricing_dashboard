'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.css':  'text/css',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/dashboard.html';

  // Resolve to absolute path and guard against path traversal
  const filePath = path.resolve(ROOT, '.' + urlPath);
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }

    const ext  = path.extname(filePath).toLowerCase();
    const ct   = MIME[ext] || 'application/octet-stream';
    const hdrs = { 'Content-Type': ct };

    // Never cache data files — reload button must always get fresh JSON
    if (urlPath.startsWith('/data/')) hdrs['Cache-Control'] = 'no-store';

    res.writeHead(200, hdrs);
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Beer Dashboard → http://localhost:${PORT}\n`);
  console.log('  Press Ctrl+C to stop.\n');
});
