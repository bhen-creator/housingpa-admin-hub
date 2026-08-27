import { describe, expect, it } from "vitest";
import {
  createAdminSession,
  getLocalAdminSession,
  hashPassword,
  verifyOwnerCredentials,
} from "./localAdminAuth";

describe("local Coolify administrator authentication", () => {
  it("verifies the configured scrypt password and rejects an incorrect password", async () => {
    process.env.OWNER_USERNAME = "housingpa-admin";
    process.env.OWNER_PASSWORD_SCRYPT = await hashPassword("correct-password", "unit-test-salt");

    await expect(verifyOwnerCredentials("housingpa-admin", "correct-password")).resolves.toBe(true);
    await expect(verifyOwnerCredentials("housingpa-admin", "incorrect-password")).resolves.toBe(false);
  });

  it("accepts a signed administrator session and rejects a tampered one", () => {
    process.env.OWNER_USERNAME = "housingpa-admin";
    const token = createAdminSession("housingpa-admin", "unit-test-session-secret");
    const request = { headers: { cookie: `housingpa-admin-session=${token}` } } as never;
    const tamperedRequest = { headers: { cookie: `housingpa-admin-session=${token}tampered` } } as never;

    expect(getLocalAdminSession(request, "unit-test-session-secret")?.role).toBe("admin");
    expect(getLocalAdminSession(tamperedRequest, "unit-test-session-secret")).toBeNull();
  });
});
