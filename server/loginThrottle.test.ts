import { describe, expect, it } from "vitest";
import {
  LoginThrottle,
  loginAttemptFingerprint,
  normalizeClientIp,
} from "./loginThrottle";

describe("local login throttling", () => {
  it("applies bounded exponential backoff by normalized username and client IP", () => {
    let now = 1_000;
    const throttle = new LoginThrottle({
      now: () => now,
      baseDelayMs: 100,
      maxDelayMs: 400,
      resetAfterMs: 1_000,
    });

    expect(throttle.check(" Admin ", "::ffff:192.0.2.10").allowed).toBe(true);
    expect(
      throttle.recordFailure(" Admin ", "::ffff:192.0.2.10")
    ).toMatchObject({
      allowed: false,
      retryAfterMs: 100,
      failureCount: 1,
    });
    expect(throttle.check("admin", "192.0.2.10").allowed).toBe(false);

    now += 100;
    expect(throttle.check("admin", "192.0.2.10").allowed).toBe(true);
    expect(throttle.recordFailure("admin", "192.0.2.10").retryAfterMs).toBe(
      200
    );

    now += 200;
    expect(throttle.recordFailure("admin", "192.0.2.10").retryAfterMs).toBe(
      400
    );
    now += 400;
    expect(throttle.recordFailure("admin", "192.0.2.10").retryAfterMs).toBe(
      400
    );
  });

  it("clears backoff after success and isolates a different client IP", () => {
    const throttle = new LoginThrottle({ baseDelayMs: 5_000 });
    throttle.recordFailure("admin", "192.0.2.10");
    expect(throttle.check("admin", "192.0.2.11").allowed).toBe(true);
    throttle.recordSuccess("admin", "192.0.2.10");
    expect(throttle.check("admin", "192.0.2.10").allowed).toBe(true);
  });

  it("creates safe audit identities without exposing username or IP", () => {
    const fingerprint = loginAttemptFingerprint(
      "HousingPA-Admin",
      "203.0.113.4"
    );
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprint).not.toContain("housingpa");
    expect(fingerprint).not.toContain("203.0.113.4");
    expect(normalizeClientIp("::ffff:203.0.113.4")).toBe("203.0.113.4");
  });
});
