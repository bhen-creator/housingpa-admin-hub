import {
  DEFAULT_INTERNAL_TOOLS,
  isDestinationUrl,
  mergeInternalTools,
  normalizeInternalTool,
  TOOL_OPERATIONAL_STATES,
  type InternalToolRecord,
} from "../shared/toolCatalog";
import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

function createUserContext(role: "user" | "admin"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "tool-test-user",
      name: "Tool Test User",
      email: "tool-test@example.com",
      loginMethod: "local",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function tool(overrides: Partial<InternalToolRecord> = {}): InternalToolRecord {
  return {
    ...DEFAULT_INTERNAL_TOOLS[0],
    ...overrides,
  };
}

describe("internal tool catalog", () => {
  it("preserves the seven required card names", () => {
    expect(DEFAULT_INTERNAL_TOOLS.map(item => item.name)).toEqual([
      "QuotePilot",
      "Email App",
      "BIDsAI",
      "Snooze",
      "Daily Idea Generator",
      "Prospecting Machine",
      "Daily 6:00 AM Report",
    ]);
  });

  it("supports the four explicit operational states", () => {
    expect(TOOL_OPERATIONAL_STATES).toEqual([
      "UNCONFIGURED",
      "CONFIGURED_UNVERIFIED",
      "VERIFIED_USABLE",
      "BLOCKED",
    ]);
  });

  it("routes the daily report card internally without making it launchable", () => {
    const report = mergeInternalTools([]).find(
      item => item.slug === "daily-report"
    );
    expect(report).toMatchObject({
      name: "Daily 6:00 AM Report",
      internalRoute: "/settings/reports/daily",
      destinationUrl: "",
      operationalState: "UNCONFIGURED",
    });
    expect(normalizeInternalTool(report!)).toMatchObject({ canLaunch: false });
  });

  it("merges a configured destination without changing the core tool identity", () => {
    const tools = mergeInternalTools([
      tool({
        name: "Changed name",
        description: "Configured description",
        destinationUrl: "https://tools.housingpa.com/quotes",
        operationalState: "CONFIGURED_UNVERIFIED",
      }),
    ]);

    expect(tools[0]).toMatchObject({
      name: "QuotePilot",
      destinationUrl: "https://tools.housingpa.com/quotes",
    });
  });

  it("keeps a configured but unverified destination disabled", () => {
    expect(
      normalizeInternalTool(
        tool({
          destinationUrl: "https://tools.housingpa.com/quotes",
          operationalState: "CONFIGURED_UNVERIFIED",
        })
      )
    ).toMatchObject({
      operationalState: "CONFIGURED_UNVERIFIED",
      canLaunch: false,
    });
  });

  it("only launches verified destinations with stored evidence and a timestamp", () => {
    expect(
      normalizeInternalTool(
        tool({
          destinationUrl: "https://tools.housingpa.com/quotes",
          operationalState: "VERIFIED_USABLE",
          verificationEvidence: "health-check:200",
          verifiedAt: new Date("2026-08-30T12:00:00Z"),
        })
      ).canLaunch
    ).toBe(true);

    expect(
      normalizeInternalTool(
        tool({
          destinationUrl: "https://tools.housingpa.com/quotes",
          operationalState: "VERIFIED_USABLE",
          verificationEvidence: null,
          verifiedAt: new Date("2026-08-30T12:00:00Z"),
        })
      )
    ).toMatchObject({
      operationalState: "CONFIGURED_UNVERIFIED",
      canLaunch: false,
    });
  });

  it("keeps blocked destinations disabled even when old verification data exists", () => {
    expect(
      normalizeInternalTool(
        tool({
          destinationUrl: "https://tools.housingpa.com/quotes",
          operationalState: "BLOCKED",
          verificationEvidence: "historical-check:200",
          verifiedAt: new Date("2026-08-30T12:00:00Z"),
          blockedReason: "Owner review required.",
        })
      )
    ).toMatchObject({
      operationalState: "BLOCKED",
      canLaunch: false,
      blockedReason: "Owner review required.",
    });
  });

  it("requires HTTPS in production and only permits local HTTP in development", () => {
    expect(
      isDestinationUrl("https://tools.housingpa.com", { allowEmpty: false })
    ).toBe(true);
    expect(
      isDestinationUrl("http://tools.housingpa.com", { allowEmpty: false })
    ).toBe(false);
    expect(
      isDestinationUrl("http://localhost:3000", { allowEmpty: false })
    ).toBe(false);
    expect(
      isDestinationUrl("http://localhost:3000", {
        allowEmpty: false,
        allowLocalHttp: true,
      })
    ).toBe(true);
    expect(
      isDestinationUrl("http://127.0.0.1:3000", {
        allowEmpty: false,
        allowLocalHttp: true,
      })
    ).toBe(true);
    expect(
      isDestinationUrl("http://example.com@localhost:3000", {
        allowEmpty: false,
        allowLocalHttp: true,
      })
    ).toBe(false);
    expect(isDestinationUrl("javascript:alert(1)", { allowEmpty: false })).toBe(
      false
    );
  });

  it("returns the seven unconfigured defaults when the optional database is absent", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.PROSPECTING_MACHINE_URL;
    const caller = appRouter.createCaller(createUserContext("admin"));
    const tools = await caller.tools.list();
    expect(tools).toHaveLength(7);
    expect(
      tools.every(
        item => item.operationalState === "UNCONFIGURED" && !item.canLaunch
      )
    ).toBe(true);
  });

  it("treats a Prospecting Machine environment URL as configured but unverified", async () => {
    delete process.env.DATABASE_URL;
    process.env.PROSPECTING_MACHINE_URL = "https://prospecting.housingpa.com";
    try {
      const caller = appRouter.createCaller(createUserContext("admin"));
      const prospecting = (await caller.tools.list()).find(
        item => item.slug === "prospecting-machine"
      );
      expect(prospecting).toMatchObject({
        destinationUrl: "https://prospecting.housingpa.com",
        operationalState: "CONFIGURED_UNVERIFIED",
        canLaunch: false,
      });
    } finally {
      delete process.env.PROSPECTING_MACHINE_URL;
    }
  });

  it("refuses tool directory access for non-administrators", async () => {
    const caller = appRouter.createCaller(createUserContext("user"));
    await expect(caller.tools.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
