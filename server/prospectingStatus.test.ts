import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const publicRoot = resolve(process.cwd(), "client/public");
const html = readFileSync(resolve(publicRoot, "prospecting-status.html"), "utf8");
const snapshot = JSON.parse(
  readFileSync(resolve(publicRoot, "prospecting-status.json"), "utf8")
) as {
  safety: Record<string, boolean | number | string>;
  queues: Record<string, Record<string, number>>;
  source: { databaseSha256: string; quickCheck: string };
};

describe("Prospecting Machine read-only status surface", () => {
  it("contains no form or production-action controls", () => {
    expect(html).not.toMatch(/<(form|button|input|textarea|select)\b/i);
    expect(html).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket/i);
    expect(html).toContain("performs no production action");
  });

  it("publishes aggregate-only safety and queue evidence", () => {
    expect(snapshot.safety.prospectingMachineEnabled).toBe(false);
    expect(snapshot.safety.scheduledJobsEnabled).toBe(0);
    expect(snapshot.safety.outreachStarted).toBe(false);
    expect(snapshot.safety.enrichmentTriggered).toBe(false);
    expect(snapshot.safety.approvalConsumed).toBe(false);
    expect(snapshot.safety.databaseMutated).toBe(false);
    expect(snapshot.queues.actions).toEqual({});
    expect(snapshot.queues.approvals).toEqual({});
  });

  it("pins the reviewed database integrity evidence", () => {
    expect(snapshot.source.quickCheck).toBe("ok");
    expect(snapshot.source.databaseSha256).toMatch(/^[A-F0-9]{64}$/);
    expect(html).toContain(snapshot.source.databaseSha256);
  });
});
