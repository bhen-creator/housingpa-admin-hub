import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';

const upstreamPort = 18080;
const proxyPort = 18081;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qw-minutes-smoke-'));
const child = spawn(process.execPath, ['dist/server.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(upstreamPort),
    DATA_DIR: dataDir,
    APP_URL: 'http://127.0.0.1:18081/minutes',
    BEHIND_PROXY: 'true',
  },
  stdio: 'ignore',
});

const proxy = http.createServer((req, res) => {
  if (!req.url?.startsWith('/minutes')) {
    res.writeHead(404).end();
    return;
  }
  const upstream = http.request(
    {
      hostname: '127.0.0.1',
      port: upstreamPort,
      method: req.method,
      path: req.url.slice('/minutes'.length) || '/',
      headers: {
        ...req.headers,
        host: `127.0.0.1:${proxyPort}`,
        'x-forwarded-host': `127.0.0.1:${proxyPort}`,
        'x-forwarded-proto': 'http',
      },
    },
    upstreamResponse => {
      res.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(res);
    },
  );
  req.pipe(upstream);
});

async function waitForHealth() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${upstreamPort}/api/health`);
      if (response.ok) return;
    } catch {
      // Startup has not completed yet.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Server did not become healthy');
}

try {
  await waitForHealth();
  await new Promise(resolve => proxy.listen(proxyPort, '127.0.0.1', resolve));

  const root = await fetch(`http://127.0.0.1:${proxyPort}/minutes/`);
  assert.equal(root.status, 200);
  assert.match(root.headers.get('content-security-policy') ?? '', /default-src 'self'/);
  const html = await root.text();
  assert.match(html, /href="\.\/app\.css"/);
  assert.match(html, /src="\.\/app\.js"/);

  const [css, js, health, session, protectedRoute] = await Promise.all([
    fetch(`http://127.0.0.1:${proxyPort}/minutes/app.css`),
    fetch(`http://127.0.0.1:${proxyPort}/minutes/app.js`),
    fetch(`http://127.0.0.1:${proxyPort}/minutes/api/health`),
    fetch(`http://127.0.0.1:${proxyPort}/minutes/api/session`),
    fetch(`http://127.0.0.1:${proxyPort}/minutes/api/associations`),
  ]);

  assert.equal(css.status, 200);
  assert.equal(js.status, 200);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');
  assert.deepEqual(await session.json(), {authenticated: false});
  assert.equal(protectedRoute.status, 401);
  assert.equal((await protectedRoute.json()).error, 'Not signed in');

  console.log('Path deployment smoke passed: root, assets, health, anonymous session, and protected API boundary.');
} finally {
  await new Promise(resolve => proxy.close(resolve));
  child.kill('SIGTERM');
  await new Promise(resolve => child.once('exit', resolve));
  fs.rmSync(dataDir, {recursive: true, force: true});
}
