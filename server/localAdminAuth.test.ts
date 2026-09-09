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
    process.env.OWNER_USERNAME = "ben@housingpa.com";
    process.env.OWNER_PASSWORD_SCRYPT = await hashPassword(
      "correct-password",
      "unit-test-salt"
    );

    await expect(
      verifyOwnerCredentials("ben@housingpa.com", "correct-password")
    ).resolves.toBe(true);
    await expect(
      verifyOwnerCredentials("ben@housingpa.com", "incorrect-password")
    ).resolves.toBe(false);
  });

  it("accepts a live signed session and rejects tampered or expired sessions", async () => {
    process.env.OWNER_USERNAME = "ben@housingpa.com";
    const issuedAt = Date.parse("2026-08-30T12:00:00Z");
    const token = createAdminSession(
      "ben@housingpa.com",
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
      (
        await getLocalAdminSession(
          request,
          "unit-test-session-secret",
          issuedAt + 1
        )
      )?.role
    ).toBe("admin");
    await expect(
      getLocalAdminSession(
        tamperedRequest,
        "unit-test-session-secret",
        issuedAt + 1
      )
    ).resolves.toBeNull();
    await expect(
      getLocalAdminSession(
        request,
        "unit-test-session-secret",
        issuedAt + SESSION_DURATION_MS + 1
      )
    ).resolves.toBeNull();
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

  it("rejects every session issued before the credential version changes", async () => {
    process.env.OWNER_USERNAME = "ben@housingpa.com";
    const now = Date.parse("2026-09-09T20:00:00Z");
    const token = createAdminSession(
      "ben@housingpa.com",
      "unit-test-session-secret",
      now,
      7
    );
    const request = {
      headers: { cookie: `housingpa-admin-session=${token}` },
    } as never;

    await expect(
      getLocalAdminSession(request, "unit-test-session-secret", now + 1, 8)
    ).resolves.toBeNull();
  });
});
