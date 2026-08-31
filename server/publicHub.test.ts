import { afterEach, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

function anonymousContext(): TrpcContext {
  return {
    user: null,
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

afterEach(() => {
  delete process.env.PUBLIC_READ_ONLY_HUB;
  delete process.env.DATABASE_URL;
  delete process.env.EMAIL_APP_URL;
});

describe("public read-only Hub", () => {
  it("remains disabled until the explicit runtime flag is set", async () => {
    const caller = appRouter.createCaller(anonymousContext());

    await expect(caller.publicHub.mode()).resolves.toEqual({ enabled: false });
    await expect(caller.publicHub.list()).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("publishes only the fixed sanitized core-card projection when enabled", async () => {
    process.env.PUBLIC_READ_ONLY_HUB = "true";
    process.env.EMAIL_APP_URL = "https://internal.example.test/email";
    const caller = appRouter.createCaller(anonymousContext());

    const cards = await caller.publicHub.list();

    expect(cards).toHaveLength(7);
    expect(cards[0]).toMatchObject({
      slug: "quote-pilot",
      name: "QuotePilot",
      category: "featured",
      publicLaunchUrl: "https://housingpa.com/repair/",
    });
    expect(cards.find(card => card.slug === "bids-ai")).toMatchObject({
      publicLaunchUrl: "https://bysania.com/apps/bidsai/",
    });
    for (const card of cards) {
      expect(card).not.toHaveProperty("destinationUrl");
      expect(card).not.toHaveProperty("internalRoute");
      expect(card).not.toHaveProperty("verificationEvidence");
      expect(card).not.toHaveProperty("verifiedAt");
      expect(card).not.toHaveProperty("blockedReason");

      if (!["quote-pilot", "bids-ai"].includes(card.slug)) {
        expect(card).not.toHaveProperty("publicLaunchUrl");
      }
    }
  });

  it("does not weaken the private tool directory", async () => {
    process.env.PUBLIC_READ_ONLY_HUB = "true";
    const caller = appRouter.createCaller(anonymousContext());

    await expect(caller.tools.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
