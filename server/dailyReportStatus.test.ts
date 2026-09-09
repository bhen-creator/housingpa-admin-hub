import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const publicRoot = resolve(process.cwd(), "client/public");
const html = readFileSync(resolve(publicRoot, "daily-report-status.html"), "utf8");
const rawSnapshot = readFileSync(
  resolve(publicRoot, "daily-report-status.json"),
  "utf8"
);
const snapshot = JSON.parse(rawSnapshot) as Record<string, unknown>;

const topLevelAllowList = [
  "schemaVersion",
  "snapshotAt",
  "scope",
  "overallState",
  "hostApplication",
  "dailyReport",
  "verification",
  "boundary",
];

const forbiddenOutputPatterns = [
  /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i,
  /\b(api[_-]?key|access[_-]?token|client[_-]?secret|password)\b/i,
  /\b(smtp|sendgrid|mailgun|postmark|resend)\b/i,
  /\b(recipient|distribution[_ -]?group|attachment)\b/i,
];

describe("Daily Report public read-only status surface", () => {
  it("uses a strict provider-neutral snapshot schema", () => {
    expect(Object.keys(snapshot).sort()).toEqual([...topLevelAllowList].sort());
    for (const pattern of forbiddenOutputPatterns) {
      expect(rawSnapshot).not.toMatch(pattern);
      expect(html).not.toMatch(pattern);
    }
  });

  it("contains no report, scheduling, delivery, or network controls", () => {
    expect(html).not.toMatch(/<(form|button|input|textarea|select|script)\b/i);
    expect(html).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket/i);
    expect(html).not.toMatch(/settings\/reports\/daily/i);
    expect(html).toContain("performs no production action");
  });

  it("does not misrepresent production activation", () => {
    expect(snapshot.overallState).toBe("SOURCE_READY_ACTIVATION_UNVERIFIED");
    expect(snapshot.dailyReport).toMatchObject({
      authenticatedSettingsSurface: "IMPLEMENTED_UNCHANGED",
      productionSchedule: "NOT_ASSERTED",
      productionDelivery: "NOT_ASSERTED",
    });
    expect(snapshot.boundary).toMatchObject({
      liveReportDataRead: false,
      reportContentIncluded: false,
      deliveryControlIncluded: false,
      scheduleControlIncluded: false,
      productionMutation: false,
    });
  });
});
