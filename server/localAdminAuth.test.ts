import { afterEach, describe, expect, it } from "vitest";
import {
  createAdminSession,
  getLocalAdminSession,
  hashPassword,
  localAdminCookieOptions,
  SESSION_DURATION_MS,
  verifyOwnerCredentials,
} from "./localAdminAuth";

afterEach(() => {
  delete process.env.OWNER_USERNAME;
  delete process.env.OWNER_PASSWORD_SCRYPT;
});

describe("local Coolify administrator authentication", () => {
  it("verifies the configured scrypt password and rejects an incorrect password", async () => {
    process.env.OWNER_USERNAME = "housingpa-admin";
    process.env.OWNER_PASSWORD_SCRYPT = await hashPassword(
      "correct-password",
      "unit-test-salt"
    );

    await expect(
      verifyOwnerCredentials("housingpa-admin", "correct-password")
    ).resolves.toBe(true);
    await expect(
      verifyOwnerCredentials("housingpa-admin", "incorrect-password")
    ).resolves.toBe(false);
  });

  it("accepts a live signed session and rejects tampered or expired sessions", () => {
    process.env.OWNER_USERNAME = "housingpa-admin";
    const issuedAt = Date.parse("2026-08-30T12:00:00Z");
    const token = createAdminSession(
      "housingpa-admin",
      "unit-test-session-secret",
      issuedAt
    );
    const request = {
      headers: { cookie: `housingpa-admin-session=${token}` },
    } as never;
    const tamperedRequest = {
      headers: { cookie: `housingpa-admin-session=${token}tampered` },
    } as never;

    expect(
      getLocalAdminSession(request, "unit-test-session-secret", issuedAt + 1)
        ?.role
    ).toBe("admin");
    expect(
      getLocalAdminSession(
        tamperedRequest,
        "unit-test-session-secret",
        issuedAt + 1
      )
    ).toBeNull();
    expect(
      getLocalAdminSession(
        request,
        "unit-test-session-secret",
        issuedAt + SESSION_DURATION_MS + 1
      )
    ).toBeNull();
  });

  it("uses secure and HttpOnly cookies in production", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(localAdminCookieOptions()).toMatchObject({
        httpOnly: true,
        secure: true,
        sameSite: "lax",
      });
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
