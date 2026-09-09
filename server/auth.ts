import {createSession, destroySession, findMatchingCode, resolveSession} from './db';
import {env} from './env';
import {type Ctx, forbidden, setCookie, unauthorized} from './http';

export const SESSION_COOKIE = 'qwm_session';

/* --- brute force throttle -------------------------------------------------- */

interface Attempt {
  count: number;
  first: number;
  blockedUntil?: number;
}
const attempts = new Map<string, Attempt>();
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 8;
const BLOCK_MS = 15 * 60_000;

export function loginBlockedSeconds(ip: string): number {
  const a = attempts.get(ip);
  if (!a?.blockedUntil) return 0;
  if (a.blockedUntil < Date.now()) {
    attempts.delete(ip);
    return 0;
  }
  return Math.ceil((a.blockedUntil - Date.now()) / 1000);
}

export function noteFailedLogin(ip: string): void {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now - a.first > WINDOW_MS) {
    attempts.set(ip, {count: 1, first: now});
    return;
  }
  a.count++;
  if (a.count >= MAX_ATTEMPTS) a.blockedUntil = now + BLOCK_MS;
}

export function clearFailedLogins(ip: string): void {
  attempts.delete(ip);
}

/** Periodically drop stale throttle records so the map cannot grow forever. */
export function purgeAttempts(): void {
  const cutoff = Date.now() - WINDOW_MS - BLOCK_MS;
  for (const [ip, a] of attempts) if (a.first < cutoff && (a.blockedUntil ?? 0) < Date.now()) attempts.delete(ip);
}

/* --- session --------------------------------------------------------------- */

export function attachAuth(ctx: Ctx): void {
  const token = ctx.cookies[SESSION_COOKIE];
  if (typeof token === 'string' && token.length === 64) {
    const session = resolveSession(token);
    if (session) ctx.auth = session;
  }
}

export function requireAuth(ctx: Ctx): NonNullable<Ctx['auth']> {
  if (!ctx.auth) throw unauthorized();
  return ctx.auth;
}

export function requireAdmin(ctx: Ctx): NonNullable<Ctx['auth']> {
  const auth = requireAuth(ctx);
  if (auth.role !== 'admin') throw forbidden('This action needs an administrator access code');
  return auth;
}

export function signIn(ctx: Ctx, code: string): {label: string; role: 'admin' | 'manager'} | null {
  const record = findMatchingCode(code);
  if (!record) return null;
  const token = createSession(record.id, ctx.req.headers['user-agent']);
  setCookie(ctx.res, SESSION_COOKIE, token, {
    maxAge: env.sessionDays * 86400,
    secure: env.isProd || ctx.origin.startsWith('https://'),
    sameSite: 'Lax',
    httpOnly: true,
  });
  return {label: record.label, role: record.role};
}

export function signOut(ctx: Ctx): void {
  const token = ctx.cookies[SESSION_COOKIE];
  if (typeof token === 'string') destroySession(token);
  setCookie(ctx.res, SESSION_COOKIE, '', {maxAge: 0, secure: env.isProd, httpOnly: true});
}
