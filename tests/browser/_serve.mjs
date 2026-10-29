// Shared helpers for browser tests: a tiny static server WITH byte-range support (like R2), Chromium launcher.
import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export async function loadPlaywright() {
  for (const p of ['playwright', '/opt/npm-tools/node_modules/playwright/index.mjs', '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs']) {
    try { return await import(p); } catch (e) { /* try next */ }
  }
  throw new Error('playwright not found');
}
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json' };
export async function serve({ r2 = path.join(root, 'tests/fixtures/fake-r2'), log = [] } = {}) {
  const server = http.createServer((q, r) => {
    const u = decodeURIComponent(q.url.split('?')[0]);
    const f = u.startsWith('/r2/') ? path.join(r2, u.slice(4)) : path.join(root, u);
    fs.stat(f, (e, st) => {
      if (e || !st.isFile()) { r.writeHead(404); r.end(); return; }
      const head = { 'content-type': types[path.extname(f)] || 'application/octet-stream', 'accept-ranges': 'bytes', 'access-control-allow-origin': '*', 'cache-control': 'no-store' };
      const m = /bytes=(\d+)-(\d*)/.exec(q.headers.range || '');
      if (m) {
        const a = Number(m[1]), b = m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
        log.push({ url: u, range: [a, b], bytes: b - a + 1 });
        r.writeHead(206, { ...head, 'content-range': `bytes ${a}-${b}/${st.size}`, 'content-length': b - a + 1 });
        fs.createReadStream(f, { start: a, end: b }).pipe(r);
      } else {
        log.push({ url: u, bytes: st.size });
        r.writeHead(200, { ...head, 'content-length': st.size });
        fs.createReadStream(f).pipe(r);
      }
    });
  }).listen(0);
  await new Promise((res) => server.once('listening', res));
  return { server, port: server.address().port, log };
}
export async function launch() {
  const { chromium } = await loadPlaywright();
  return chromium.launch();
}
