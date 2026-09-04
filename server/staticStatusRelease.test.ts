import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getPublicCardDestination } from "../client/src/lib/toolWorkspaces";

const root = process.cwd();
const homeSource = readFileSync(
  resolve(root, "client/src/pages/Home.tsx"),
  "utf8"
);

const approvedRoutes = [
  ["prospecting-machine", "/prospecting-status.html"],
  ["daily-report", "/daily-report-status.html"],
] as const;

describe("approved Admin static-status presentation", () => {
  it.each(approvedRoutes)("routes %s only to %s", (slug, href) => {
    expect(getPublicCardDestination(slug)).toEqual({ kind: "external", href });

    const html = readFileSync(resolve(root, `client/public${href}`), "utf8");
    expect(html).toContain('href="/"');
    expect(html).toContain("Read-only status");
    expect(html).toContain("performs no production action");
    expect(html).not.toMatch(/<(form|button|input|textarea|select|script)\b/i);
    expect(html).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket/i);
  });

  it("presents both cards as bounded read-only snapshots", () => {
    expect(homeSource).toMatch(
      /"prospecting-machine":\s*\{\s*label: "Read-only status",\s*action: "Open status snapshot"/
    );
    expect(homeSource).toMatch(
      /"daily-report":\s*\{\s*label: "Read-only status",\s*action: "Open readiness snapshot"/
    );
  });
});
