import { DAILY_IDEA_GENERATOR_PUBLIC_ROUTE } from "@shared/toolCatalog";
import type { InsertInternalTool, User } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { DailyIdeaGeneratorVerificationError } from "./dailyIdeaGeneratorVerification";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listInternalTools: vi.fn(),
  upsertInternalTool: vi.fn(),
  verifyDailyIdeaGenerator: vi.fn(),
}));

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    listInternalTools: mocks.listInternalTools,
    upsertInternalTool: mocks.upsertInternalTool,
  };
});

vi.mock("./dailyIdeaGeneratorVerification", async importOriginal => {
  const actual =
    await importOriginal<typeof import("./dailyIdeaGeneratorVerification")>();
  return {
    ...actual,
    verifyDailyIdeaGenerator: mocks.verifyDailyIdeaGenerator,
  };
});

const { appRouter } = await import("./routers");

function context(role: User["role"] | null): TrpcContext {
  return {
    user: role
      ? {
          id: 1,
          openId: "daily-idea-generator-test",
          name: "Daily Idea Generator Test",
          email: "test@example.com",
          loginMethod: "local",
          role,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        }
      : null,
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Daily Idea Generator publish control", () => {
  let persistedTools: InsertInternalTool[];
  const verifiedAt = new Date("2026-08-31T14:30:00.000Z");

  beforeEach(() => {
    persistedTools = [];
    mocks.listInternalTools.mockImplementation(async () => persistedTools);
    mocks.upsertInternalTool.mockImplementation(
      async (tool: InsertInternalTool) => {
        persistedTools = [tool];
      }
    );
    mocks.verifyDailyIdeaGenerator.mockResolvedValue({
      destinationUrl: DAILY_IDEA_GENERATOR_PUBLIC_ROUTE,
      evidence:
        "Canonical application and ready health checks returned expected HTTP 200 responses.",
      verifiedAt,
    });
  });

  afterEach(() => {
    delete process.env.PUBLIC_READ_ONLY_HUB;
    vi.clearAllMocks();
  });

  it("requires the existing admin procedure before it can verify or write", async () => {
    const anonymous = appRouter.createCaller(context(null));
    const nonAdmin = appRouter.createCaller(context("user"));

    await expect(
      anonymous.tools.verifyDailyIdeaGenerator()
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      nonAdmin.tools.verifyDailyIdeaGenerator()
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.verifyDailyIdeaGenerator).not.toHaveBeenCalled();
    expect(mocks.upsertInternalTool).not.toHaveBeenCalled();
  });

  it("rejects arbitrary inputs and blocks the generic destination editor for this fixed route", async () => {
    const caller = appRouter.createCaller(context("admin"));

    await expect(
      (
        caller.tools.verifyDailyIdeaGenerator as unknown as (
          input: unknown
        ) => Promise<unknown>
      )("https://example.test/not-the-daily-idea-generator")
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(
      caller.tools.updateDestination({
        slug: "idea-generator",
        destinationUrl: "https://example.test/not-the-daily-idea-generator",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.verifyDailyIdeaGenerator).not.toHaveBeenCalled();
    expect(mocks.upsertInternalTool).not.toHaveBeenCalled();
  });

  it("fails closed without persisting when the fixed health verification fails", async () => {
    mocks.verifyDailyIdeaGenerator.mockRejectedValueOnce(
      new DailyIdeaGeneratorVerificationError(
        "The Daily Idea Generator health check was not ready and configured. Nothing was published."
      )
    );
    const caller = appRouter.createCaller(context("admin"));

    await expect(caller.tools.verifyDailyIdeaGenerator()).rejects.toMatchObject(
      {
        code: "PRECONDITION_FAILED",
        message: expect.stringContaining("Nothing was published"),
      }
    );
    expect(mocks.upsertInternalTool).not.toHaveBeenCalled();
    expect(persistedTools).toEqual([]);
  });

  it("persists only the canonical verified record and activates the public card", async () => {
    const caller = appRouter.createCaller(context("admin"));

    await expect(
      caller.tools.verifyDailyIdeaGenerator()
    ).resolves.toMatchObject({
      success: true,
      destinationUrl: DAILY_IDEA_GENERATOR_PUBLIC_ROUTE,
      operationalState: "VERIFIED_USABLE",
      verifiedAt,
    });

    expect(mocks.upsertInternalTool).toHaveBeenCalledTimes(1);
    expect(mocks.upsertInternalTool).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "idea-generator",
        destinationUrl: DAILY_IDEA_GENERATOR_PUBLIC_ROUTE,
        operationalState: "VERIFIED_USABLE",
        verificationEvidence:
          "Canonical application and ready health checks returned expected HTTP 200 responses.",
        verifiedAt,
        blockedReason: null,
      })
    );

    process.env.PUBLIC_READ_ONLY_HUB = "true";
    const publicCaller = appRouter.createCaller(context(null));
    const card = (await publicCaller.publicHub.list()).find(
      item => item.slug === "idea-generator"
    );
    expect(card).toMatchObject({
      operationalState: "VERIFIED_USABLE",
      canLaunch: true,
      publicLaunchUrl: DAILY_IDEA_GENERATOR_PUBLIC_ROUTE,
    });
    expect(card).not.toHaveProperty("destinationUrl");
    expect(card).not.toHaveProperty("verificationEvidence");
  });
});
