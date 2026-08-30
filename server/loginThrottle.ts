import { createHash } from "node:crypto";

type LoginAttempt = {
  failureCount: number;
  blockedUntil: number;
  lastFailureAt: number;
};

type LoginThrottleOptions = {
  baseDelayMs?: number;
  maxDelayMs?: number;
  resetAfterMs?: number;
  maxEntries?: number;
  now?: () => number;
};

export type LoginThrottleDecision = {
  allowed: boolean;
  retryAfterMs: number;
  failureCount: number;
};

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export function normalizeClientIp(clientIp: string) {
  const normalized = clientIp.trim().toLowerCase();
  return normalized.startsWith("::ffff:")
    ? normalized.slice(7)
    : normalized || "unknown";
}

export function loginAttemptFingerprint(username: string, clientIp: string) {
  return createHash("sha256")
    .update(
      `${normalizeUsername(username)}\u0000${normalizeClientIp(clientIp)}`
    )
    .digest("hex");
}

export class LoginThrottle {
  private readonly attempts = new Map<string, LoginAttempt>();
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly resetAfterMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(options: LoginThrottleOptions = {}) {
    this.baseDelayMs = options.baseDelayMs ?? 500;
    this.maxDelayMs = options.maxDelayMs ?? 30_000;
    this.resetAfterMs = options.resetAfterMs ?? 15 * 60_000;
    this.maxEntries = options.maxEntries ?? 5_000;
    this.now = options.now ?? Date.now;
  }

  private key(username: string, clientIp: string) {
    return `${normalizeUsername(username)}\u0000${normalizeClientIp(clientIp)}`;
  }

  private getActiveAttempt(username: string, clientIp: string) {
    const key = this.key(username, clientIp);
    const attempt = this.attempts.get(key);
    if (attempt && this.now() - attempt.lastFailureAt >= this.resetAfterMs) {
      this.attempts.delete(key);
      return { key, attempt: undefined };
    }
    return { key, attempt };
  }

  private pruneIfNeeded() {
    if (this.attempts.size < this.maxEntries) return;
    const oldest = Array.from(this.attempts.entries())
      .sort(([, left], [, right]) => left.lastFailureAt - right.lastFailureAt)
      .slice(0, Math.max(1, Math.ceil(this.maxEntries * 0.1)));
    oldest.forEach(([key]) => this.attempts.delete(key));
  }

  check(username: string, clientIp: string): LoginThrottleDecision {
    const { attempt } = this.getActiveAttempt(username, clientIp);
    const retryAfterMs = attempt
      ? Math.max(0, attempt.blockedUntil - this.now())
      : 0;
    return {
      allowed: retryAfterMs === 0,
      retryAfterMs,
      failureCount: attempt?.failureCount ?? 0,
    };
  }

  recordFailure(username: string, clientIp: string): LoginThrottleDecision {
    this.pruneIfNeeded();
    const { key, attempt } = this.getActiveAttempt(username, clientIp);
    const failureCount = (attempt?.failureCount ?? 0) + 1;
    const retryAfterMs = Math.min(
      this.maxDelayMs,
      this.baseDelayMs * 2 ** Math.min(failureCount - 1, 16)
    );
    const now = this.now();

    this.attempts.set(key, {
      failureCount,
      blockedUntil: now + retryAfterMs,
      lastFailureAt: now,
    });

    return { allowed: false, retryAfterMs, failureCount };
  }

  recordSuccess(username: string, clientIp: string) {
    this.attempts.delete(this.key(username, clientIp));
  }
}

export const loginThrottle = new LoginThrottle();

export function auditLoginFailure(
  username: string,
  clientIp: string,
  decision: LoginThrottleDecision,
  reason: "invalid_credentials" | "backoff_active"
) {
  console.warn(
    JSON.stringify({
      event: "local_admin_login_failed",
      reason,
      subjectFingerprint: loginAttemptFingerprint(username, clientIp),
      failureCount: decision.failureCount,
      retryAfterMs: decision.retryAfterMs,
    })
  );
}
