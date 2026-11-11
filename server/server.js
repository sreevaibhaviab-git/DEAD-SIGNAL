// DEAD SIGNAL local server: serves the game and the EVA API on one port.
//   npm run dev   -> serves the project folder (edit and refresh)
//   npm start     -> serves the production build in dist/
// No dependencies: Node.js built-ins only. Listens on 127.0.0.1 (this computer) only.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import util from 'node:util';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(ROOT, '.env');
// Values in .env take precedence over variables already set in the shell.
if (fs.existsSync(ENV_FILE)) {
  try { Object.assign(process.env, util.parseEnv(fs.readFileSync(ENV_FILE, 'utf8'))); } catch (e) { console.error(`Could not read .env: ${e.message}`); }
}

const { status, chat, tts } = await import('./eva.js');

const DIST = process.argv.includes('--dist');
const STATIC_ROOT = DIST ? path.join(ROOT, 'dist') : ROOT;
const PORT = parseInt(process.env.PORT, 10) || 5173;
const HOST = '127.0.0.1';

if (DIST && !fs.existsSync(path.join(STATIC_ROOT, 'index.html'))) {
  console.error('No production build found. Run "npm run build" first.');
  process.exit(1);
}

// In dev, only these paths are served (never .env, server/ or scripts/).
const DEV_ALLOW = ['/index.html', '/style.css', '/src/', '/node_modules/three/build/', '/node_modules/three/examples/jsm/'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.glb': 'model/gltf-binary',
};

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

function send(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra });
  res.end(body);
}

function readBody(req, limit = 32 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('Body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

async function handleApi(req, res, url) {
  // Only accept requests addressed to this machine (blocks DNS-rebinding style access to the API).
  if (!LOCAL_HOST.test(req.headers.host || '')) return send(res, 403, JSON.stringify({ error: 'Forbidden host' }));
  const origin = req.headers.origin;
  if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin)) return send(res, 403, JSON.stringify({ error: 'Forbidden origin' }));

  if (url.pathname === '/api/eva/status' && req.method === 'GET') return send(res, 200, JSON.stringify(status()));
  if (req.method !== 'POST') return send(res, 405, JSON.stringify({ error: 'Method not allowed' }));
  if (!(req.headers['content-type'] || '').includes('application/json')) return send(res, 415, JSON.stringify({ error: 'JSON required' }));

  let body;
  try { body = await readBody(req); } catch (e) { return send(res, 400, JSON.stringify({ error: e.message })); }

  if (url.pathname === '/api/eva/chat') {
    const r = await chat(body);
    return send(res, r.status, JSON.stringify(r.json));
  }
  if (url.pathname === '/api/eva/tts') {
    const r = await tts(body);
    if (r.audio) return send(res, 200, r.audio, 'audio/mpeg');
    return send(res, r.status, JSON.stringify(r.json));
  }
  return send(res, 404, JSON.stringify({ error: 'Not found' }));
}

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  if (!DIST && !DEV_ALLOW.some((a) => (a.endsWith('/') ? p.startsWith(a) : p === a))) return send(res, 404, 'Not found', 'text/plain');
  const file = path.normalize(path.join(STATIC_ROOT, p));
  if (!file.startsWith(STATIC_ROOT + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found', 'text/plain');
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'content-length': st.size,
      'cache-control': DIST ? 'public, max-age=300' : 'no-store',
      'x-content-type-options': 'nosniff',
    });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');
    return serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, JSON.stringify({ error: 'Server error' }));
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${PORT} is already in use. Stop the other server (Ctrl+C in its terminal) or set PORT in .env.`);
  else console.error(e);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const s = status();
  console.log(`\nDEAD SIGNAL ${DIST ? '(production build)' : '(development)'} running at http://localhost:${PORT}`);
  console.log(`EVA live conversation: ${s.ai ? `ON (${s.model}, ${s.tts === 'elevenlabs' ? 'ElevenLabs voice' : 'browser voice'})` : 'OFF - scripted dialogue only'}`);
  if (!s.ai) console.log(`  ${s.reason}`);
  console.log('Press Ctrl+C to stop.\n');
});
