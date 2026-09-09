/**
 * A very small HTTP layer over node:http - routing, JSON bodies, cookies.
 * Deliberately dependency free: the whole server runs on Node built-ins.
 */
import type {IncomingMessage, ServerResponse} from 'node:http';

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  cookies: Record<string, string>;
  ip: string;
  body: unknown;
  auth?: {label: string; role: 'admin' | 'manager'; codeId: string};
  /** Absolute origin of this request, honouring APP_URL / proxy headers. */
  origin: string;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (m: string) => new HttpError(400, m);
export const unauthorized = (m = 'Not signed in') => new HttpError(401, m);
export const forbidden = (m: string) => new HttpError(403, m);
export const notFound = (m = 'Not found') => new HttpError(404, m);
export const conflict = (m: string) => new HttpError(409, m);

type Handler = (ctx: Ctx) => unknown | Promise<unknown>;

interface Route {
  method: string;
  segments: string[];
  handler: Handler;
}

export class Router {
  private routes: Route[] = [];

  add(method: string, pattern: string, handler: Handler): this {
    this.routes.push({method, segments: pattern.split('/').filter(Boolean), handler});
    return this;
  }
  get(p: string, h: Handler) {
    return this.add('GET', p, h);
  }
  post(p: string, h: Handler) {
    return this.add('POST', p, h);
  }
  put(p: string, h: Handler) {
    return this.add('PUT', p, h);
  }
  patch(p: string, h: Handler) {
    return this.add('PATCH', p, h);
  }
  delete(p: string, h: Handler) {
    return this.add('DELETE', p, h);
  }

  match(method: string, pathname: string): {handler: Handler; params: Record<string, string>} | null {
    const parts = pathname.split('/').filter(Boolean);
    for (const route of this.routes) {
      if (route.method !== method) continue;
      if (route.segments.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < route.segments.length; i++) {
        const seg = route.segments[i];
        if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(parts[i]);
        else if (seg !== parts[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return {handler: route.handler, params};
    }
    return null;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      out[key] = part.slice(idx + 1).trim();
    }
  }
  return out;
}

export function setCookie(
  res: ServerResponse,
  name: string,
  value: string,
  opts: {maxAge?: number; secure?: boolean; httpOnly?: boolean; sameSite?: 'Lax' | 'Strict' | 'None'; path?: string} = {},
): void {
  const bits = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path ?? '/'}`];
  if (opts.maxAge !== undefined) bits.push(`Max-Age=${Math.floor(opts.maxAge)}`);
  bits.push(`SameSite=${opts.sameSite ?? 'Lax'}`);
  if (opts.httpOnly !== false) bits.push('HttpOnly');
  if (opts.secure) bits.push('Secure');
  const existing = res.getHeader('Set-Cookie');
  const list = Array.isArray(existing) ? existing : existing ? [String(existing)] : [];
  list.push(bits.join('; '));
  res.setHeader('Set-Cookie', list);
}

export async function readBody(req: IncomingMessage, limitBytes: number): Promise<unknown> {
  const type = String(req.headers['content-type'] || '');
  if (!type.includes('application/json')) return undefined;

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limitBytes) throw new HttpError(413, 'Request body is too large');
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw badRequest('Request body is not valid JSON');
  }
}

export function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload ?? null);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

export function clientIp(req: IncomingMessage, behindProxy: boolean): string {
  if (behindProxy) {
    const fwd = req.headers['x-forwarded-for'];
    const first = Array.isArray(fwd) ? fwd[0] : fwd;
    if (first) return first.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}
