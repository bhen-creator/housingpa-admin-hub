import { describe, expect, it } from "vitest";
import { isApplicationReady } from "./health";
import { buildSecurityHeaders } from "./security";
import { configuredPort, REQUEST_BODY_LIMIT } from "./serverConfig";

describe("platform hardening", () => {
  it("keeps health readiness free of optional database requirements", () => {
    expect(isApplicationReady({})).toBe(false);
    expect(
      isApplicationReady({
        OWNER_USERNAME: "admin",
        OWNER_PASSWORD_SCRYPT: "salt:hash",
        SESSION_SECRET: "session-secret",
      })
    ).toBe(true);
    expect(
      isApplicationReady({
        OWNER_USERNAME: "admin",
        OWNER_PASSWORD_SCRYPT: "salt:hash",
        JWT_SECRET: "legacy-compatible-session-secret",
      })
    ).toBe(true);
  });

  it("sets the required browser protections without an unsafe script policy", () => {
    const headers = buildSecurityHeaders(true);
    expect(headers["Content-Security-Policy"]).toContain(
      "frame-ancestors 'none'"
    );
    expect(headers["Content-Security-Policy"]).toContain("script-src 'self'");
    expect(headers["Content-Security-Policy"]).not.toContain(
      "script-src 'self' 'unsafe-inline'"
    );
    expect(headers).toMatchObject({
      "Permissions-Policy":
        "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
  });

  it("uses a 1 MB request limit and validates the exact configured port", () => {
    expect(REQUEST_BODY_LIMIT).toBe("1mb");
    expect(configuredPort(undefined)).toBe(3000);
    expect(configuredPort("4310")).toBe(4310);
    expect(() => configuredPort("4310.5")).toThrow(/PORT/);
    expect(() => configuredPort("0")).toThrow(/PORT/);
    expect(() => configuredPort("65536")).toThrow(/PORT/);
  });
});
