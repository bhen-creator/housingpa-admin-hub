import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {attachAuth, purgeAttempts} from './auth';
import {bootstrap, purgeExpiredSessions} from './db';
import {env} from './env';
import {clientIp, HttpError, parseCookies, readBody, sendJson, type Ctx} from './http';
import {router} from './routes';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, 'public');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self' blob:",
  "object-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

function securityHeaders(res: http.ServerResponse, secure: boolean): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  res.setHeader('Content-Security-Policy', CSP);
  if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

function serveStatic(res: http.ServerResponse, filePath: string, immutable: boolean): boolean {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;
  } catch {
    return false;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const proto =
    (env.behindProxy && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim()) ||
    ((req.socket as unknown as {encrypted?: boolean}).encrypted ? 'https' : 'http');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || `localhost:${env.port}`);
  const origin = `${proto}://${host}`;

  securityHeaders(res, proto === 'https');

  let url: URL;
  try {
    url = new URL(req.url || '/', origin);
  } catch {
    sendJson(res, 400, {error: 'Bad request'});
    return;
  }
  const pathname = decodeURIComponent(url.pathname);

  try {
    const match = router.match(req.method || 'GET', pathname);

    if (match) {
      const ctx: Ctx = {
        req,
        res,
        method: req.method || 'GET',
        path: pathname,
        params: match.params,
        query: url.searchParams,
        cookies: parseCookies(req.headers.cookie),
        ip: clientIp(req, env.behindProxy),
        body: await readBody(req, 40 * 1024 * 1024),
        origin,
      };
      attachAuth(ctx);

      const result = await match.handler(ctx);
      if (!res.writableEnded) {
        // undefined means "nothing to send"; null is a real JSON answer.
        sendJson(res, res.statusCode, result === undefined ? {ok: true} : result);
      }
      if (env.nodeEnv !== 'test') {
        const ms = Date.now() - started;
        if (ms > 500) console.log(`[slow] ${ctx.method} ${pathname} ${ms}ms`);
      }
      return;
    }

    if (pathname.startsWith('/api/')) {
      sendJson(res, 404, {error: 'Not found'});
      return;
    }

    // Static assets, then the SPA fallback.
    if (req.method === 'GET' || req.method === 'HEAD') {
      const safe = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
      const candidate = path.join(publicDir, safe);
      if (candidate.startsWith(publicDir) && safe !== '/' && serveStatic(res, candidate, /\.(js|css|woff2|png|svg)$/.test(safe))) {
        return;
      }
      const indexHtml = path.join(publicDir, 'index.html');
      if (serveStatic(res, indexHtml, false)) return;
      res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8'});
      res.end('API is running. Run "npm run build" to produce the web client.');
      return;
    }

    sendJson(res, 404, {error: 'Not found'});
  } catch (err) {
    if (res.writableEnded) return;
    if (err instanceof HttpError) {
      sendJson(res, err.status, {error: err.message});
      return;
    }
    console.error(`[error] ${req.method} ${pathname}`, err);
    sendJson(res, 500, {error: 'Something went wrong on the server'});
  }
});

server.headersTimeout = 65_000;
server.requestTimeout = 120_000;

const {generatedCode} = bootstrap();
setInterval(() => {
  purgeExpiredSessions();
  purgeAttempts();
}, 6 * 3600_000).unref();

server.listen(env.port, env.host, () => {
  console.log(`\n  ${env.brandName} — ${env.brandTagline}`);
  console.log(`  http://${env.host}:${env.port}   (${env.nodeEnv})`);
  console.log(`  database  ${env.dbPath}`);
  console.log(`  ai        ${env.geminiKey ? env.geminiModel : 'off — using built-in formatting'}`);
  console.log(`  email     ${env.mailProvider === 'none' ? 'off' : env.mailProvider}`);
  if (generatedCode) {
    console.log('\n  ┌────────────────────────────────────────────────┐');
    console.log('  │  FIRST RUN — administrator access code:         │');
    console.log(`  │      ${generatedCode.padEnd(42)}│`);
    console.log('  │  Set ACCESS_CODE in .env to choose your own.    │');
    console.log('  └────────────────────────────────────────────────┘');
  }
  console.log('');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
