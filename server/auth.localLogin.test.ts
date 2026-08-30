import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { hashPassword } from "./localAdminAuth";
import { appRouter, LOCAL_AUTH_ERROR_MESSAGE } from "./routers";

function anonymousContext(): TrpcContext {
  return {
    user: null,
    req: {
      ip: "192.0.2.44",
      socket: { remoteAddress: "192.0.2.44" },
    } as TrpcContext["req"],
    res: {
      cookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

afterEach(() => {
  delete process.env.OWNER_USERNAME;
  delete process.env.OWNER_PASSWORD_SCRYPT;
  vi.restoreAllMocks();
});

describe("auth.localLogin", () => {
  it("uses one generic error for invalid credentials and active backoff", async () => {
    process.env.OWNER_USERNAME = "generic-error-admin";
    process.env.OWNER_PASSWORD_SCRYPT = await hashPassword(
      "correct-password",
      "generic-error-salt"
    );
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const caller = appRouter.createCaller(anonymousContext());

    await expect(
      caller.auth.localLogin({
        username: "generic-error-admin",
        password: "incorrect-password",
      })
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: LOCAL_AUTH_ERROR_MESSAGE,
    });

    await expect(
      caller.auth.localLogin({
        username: "generic-error-admin",
        password: "incorrect-password",
      })
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: LOCAL_AUTH_ERROR_MESSAGE,
    });

    expect(warning.mock.calls.flat().join(" ")).not.toContain(
      "incorrect-password"
    );
  });
});
