import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { DEFAULT_INTERNAL_TOOLS, isExternalToolUrl, mergeInternalTools } from "../shared/toolCatalog";
import type { TrpcContext } from "./_core/context";

function createUserContext(role: "user" | "admin"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "tool-test-user",
      name: "Tool Test User",
      email: "tool-test@example.com",
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("internal tool catalog", () => {
  it("preserves the five required tool names", () => {
    expect(DEFAULT_INTERNAL_TOOLS.map(tool => tool.name)).toEqual([
      "QuotePilot",
      "EmailApp",
      "BidsAI",
      "SnoozApp",
      "Idea Generator",
    ]);
  });

  it("merges a configured destination without changing the core tool identity", () => {
    const tools = mergeInternalTools([
      {
        slug: "quote-pilot",
        name: "Changed name",
        description: "Configured description",
        destinationUrl: "https://tools.housingpa.com/quotes",
        category: "featured",
        sortOrder: 10,
      },
    ]);

    expect(tools[0]).toMatchObject({
      name: "QuotePilot",
      destinationUrl: "https://tools.housingpa.com/quotes",
    });
  });

  it("accepts blank, HTTP, and HTTPS destinations while rejecting unsafe schemes", () => {
    expect(isExternalToolUrl("")).toBe(true);
    expect(isExternalToolUrl("https://tools.housingpa.com")).toBe(true);
    expect(isExternalToolUrl("http://localhost:3000")).toBe(true);
    expect(isExternalToolUrl("javascript:alert(1)")).toBe(false);
  });

  it("refuses tool directory access for non-administrators", async () => {
    const caller = appRouter.createCaller(createUserContext("user"));
    await expect(caller.tools.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

