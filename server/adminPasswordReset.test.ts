import { describe, expect, it, vi } from "vitest";
import {
  ADMIN_ACCOUNT,
  createPasswordResetService,
  GENERIC_RESET_RESPONSE,
  hashResetToken,
  passwordResetConfiguration,
  ResetThrottle,
  type PasswordResetDependencies,
  type ResetMail,
} from "./adminPasswordReset";

const TOKEN = "A".repeat(43);
const STRONG_PASSWORD = "Correct-Horse-47-Battery!";

function configuredEnvironment(): NodeJS.ProcessEnv {
  return {
    OWNER_USERNAME: ADMIN_ACCOUNT,
    DATABASE_URL: "mysql://mock-only",
    ADMIN_RESET_SMTP_HOST: "smtp.zoho.com",
    ADMIN_RESET_SMTP_PORT: "465",
    ADMIN_RESET_SMTP_SECURE: "true",
    ADMIN_RESET_SMTP_USERNAME: ADMIN_ACCOUNT,
    ADMIN_RESET_SMTP_PASSWORD: "mock-secret-never-sent",
    ADMIN_RESET_SMTP_FROM: `HousingPA Admin <${ADMIN_ACCOUNT}>`,
    ADMIN_RESET_BASE_URL: "https://admin.housingpa.com/",
  };
}

function harness(now = Date.parse("2026-09-09T20:00:00Z")) {
  const tokens = new Map<string, { expiresAt: Date; used: boolean }>();
  const messages: ResetMail[] = [];
  const consumedPasswordHashes: string[] = [];
  const dependencies: PasswordResetDependencies = {
    environment: configuredEnvironment(),
    now: () => now,
    randomToken: () => TOKEN,
    throttle: new ResetThrottle(),
    completeThrottle: new ResetThrottle(5),
    storeToken: async (tokenHash, expiresAt) => {
      tokens.set(tokenHash, { expiresAt, used: false });
    },
    sendMail: async message => {
      messages.push(message);
    },
    consumeToken: async (tokenHash, passwordScrypt, usedAt) => {
      const record = tokens.get(tokenHash);
      if (!record || record.used || record.expiresAt <= usedAt) return false;
      record.used = true;
      consumedPasswordHashes.push(passwordScrypt);
      return true;
    },
  };
  return {
    service: createPasswordResetService(dependencies),
    tokens,
    messages,
    consumedPasswordHashes,
  };
}

describe("Admin SMTP password reset", () => {
  it("stays disabled until every SMTP, HTTPS, database, and account requirement is valid", () => {
    expect(passwordResetConfiguration({}).enabled).toBe(false);
    expect(
      passwordResetConfiguration({
        ...configuredEnvironment(),
        ADMIN_RESET_BASE_URL: "http://admin.housingpa.com/",
      }).enabled
    ).toBe(false);
    expect(passwordResetConfiguration(configuredEnvironment()).enabled).toBe(
      true
    );
  });

  it("stores only the token hash and sends the raw token only through mock SMTP in an HTTPS fragment", async () => {
    const { service, tokens, messages } = harness();
    await expect(
      service.requestReset(ADMIN_ACCOUNT, "192.0.2.5")
    ).resolves.toEqual({ message: GENERIC_RESET_RESPONSE });

    expect([...tokens.keys()]).toEqual([hashResetToken(TOKEN)]);
    expect([...tokens.keys()][0]).not.toContain(TOKEN);
    expect(messages).toHaveLength(1);
    expect(messages[0].to).toBe(ADMIN_ACCOUNT);
    expect(messages[0].text).toContain(
      `https://admin.housingpa.com/#resetToken=${TOKEN}`
    );
    expect(messages[0].text).not.toContain("mock-secret-never-sent");
  });

  it("returns the same generic response for unknown accounts and throttled requests", async () => {
    const { service, messages } = harness();
    await service.requestReset("unknown@example.com", "192.0.2.6");
    for (let index = 0; index < 4; index += 1) {
      expect(await service.requestReset(ADMIN_ACCOUNT, "192.0.2.7")).toEqual({
        message: GENERIC_RESET_RESPONSE,
      });
    }
    expect(messages).toHaveLength(3);
  });

  it("consumes a token once and creates only an scrypt password hash", async () => {
    const { service, consumedPasswordHashes } = harness();
    await service.requestReset(ADMIN_ACCOUNT, "192.0.2.8");
    await expect(
      service.completeReset(TOKEN, STRONG_PASSWORD)
    ).resolves.toMatchObject({ success: true });
    await expect(
      service.completeReset(TOKEN, STRONG_PASSWORD)
    ).resolves.toMatchObject({ success: false });
    expect(consumedPasswordHashes).toHaveLength(1);
    expect(consumedPasswordHashes[0]).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/);
    expect(consumedPasswordHashes[0]).not.toContain(STRONG_PASSWORD);
  });

  it("rejects weak passwords without consuming a token", async () => {
    const { service, consumedPasswordHashes } = harness();
    await expect(service.completeReset(TOKEN, "password123")).resolves.toEqual({
      success: false,
      validationError: "Use between 14 and 256 characters.",
    });
    expect(consumedPasswordHashes).toHaveLength(0);
  });

  it("never logs token or SMTP credential when mock delivery fails", async () => {
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const service = createPasswordResetService({
      environment: configuredEnvironment(),
      now: () => Date.parse("2026-09-09T20:00:00Z"),
      randomToken: () => TOKEN,
      throttle: new ResetThrottle(),
      completeThrottle: new ResetThrottle(5),
      storeToken: async () => undefined,
      consumeToken: async () => false,
      sendMail: async () => {
        throw new Error("mock-secret-never-sent");
      },
    });
    await service.requestReset(ADMIN_ACCOUNT, "192.0.2.9");
    const logged = warning.mock.calls.flat().join(" ");
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain("mock-secret-never-sent");
    warning.mockRestore();
  });
});
