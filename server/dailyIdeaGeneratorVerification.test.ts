import {
  DAILY_IDEA_GENERATOR_HEALTH_ROUTE,
  DAILY_IDEA_GENERATOR_VERIFICATION_TIMEOUT_MS,
  DailyIdeaGeneratorVerificationError,
  verifyDailyIdeaGenerator,
} from "./dailyIdeaGeneratorVerification";
import { DAILY_IDEA_GENERATOR_PUBLIC_ROUTE } from "@shared/toolCatalog";
import { describe, expect, it, vi } from "vitest";

function htmlResponse(body = '<main id="app"></main>') {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function healthResponse(body: unknown = { ok: true, configured: true }) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("Daily Idea Generator verification", () => {
  it("only fetches the fixed canonical application and health routes", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(htmlResponse())
      .mockResolvedValueOnce(healthResponse());
    const verifiedAt = new Date("2026-08-31T14:00:00.000Z");

    await expect(
      verifyDailyIdeaGenerator({
        fetchImplementation,
        now: () => verifiedAt,
      })
    ).resolves.toEqual({
      destinationUrl: DAILY_IDEA_GENERATOR_PUBLIC_ROUTE,
      evidence:
        "Canonical application and ready health checks returned expected HTTP 200 responses.",
      verifiedAt,
    });

    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      DAILY_IDEA_GENERATOR_PUBLIC_ROUTE,
      expect.objectContaining({
        method: "GET",
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        signal: expect.any(AbortSignal),
      })
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      DAILY_IDEA_GENERATOR_HEALTH_ROUTE,
      expect.objectContaining({
        method: "GET",
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        signal: expect.any(AbortSignal),
      })
    );
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the health endpoint is not configured", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(htmlResponse())
      .mockResolvedValueOnce(healthResponse({ ok: true, configured: false }));

    await expect(
      verifyDailyIdeaGenerator({ fetchImplementation })
    ).rejects.toMatchObject<Partial<DailyIdeaGeneratorVerificationError>>({
      name: "DailyIdeaGeneratorVerificationError",
      message: expect.stringContaining("not ready and configured"),
    });
  });

  it("fails closed when either expected response is unavailable or malformed", async () => {
    const unavailable = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response("under construction", {
        status: 503,
        headers: { "content-type": "text/html" },
      })
    );
    await expect(
      verifyDailyIdeaGenerator({ fetchImplementation: unavailable })
    ).rejects.toBeInstanceOf(DailyIdeaGeneratorVerificationError);

    const malformedHealth = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(htmlResponse())
      .mockResolvedValueOnce(
        new Response("not-json", {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    await expect(
      verifyDailyIdeaGenerator({ fetchImplementation: malformedHealth })
    ).rejects.toBeInstanceOf(DailyIdeaGeneratorVerificationError);
  });

  it("rejects unsafe verifier timeout values before any request", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();

    await expect(
      verifyDailyIdeaGenerator({ fetchImplementation, timeoutMs: 0 })
    ).rejects.toBeInstanceOf(DailyIdeaGeneratorVerificationError);
    await expect(
      verifyDailyIdeaGenerator({
        fetchImplementation,
        timeoutMs: DAILY_IDEA_GENERATOR_VERIFICATION_TIMEOUT_MS + 30_001,
      })
    ).rejects.toBeInstanceOf(DailyIdeaGeneratorVerificationError);
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
