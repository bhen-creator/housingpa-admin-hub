import {
  getPublicCardDestination,
  getToolWorkspace,
  PUBLIC_CARD_DESTINATIONS,
  TOOL_WORKSPACES,
} from "../client/src/lib/toolWorkspaces";
import { describe, expect, it } from "vitest";

const CORE_SLUGS = [
  "quote-pilot",
  "email-app",
  "bids-ai",
  "snooz-app",
  "idea-generator",
  "prospecting-machine",
  "daily-report",
];

describe("public Admin Hub card destinations", () => {
  it("provides one useful destination for every core card", () => {
    expect(Object.keys(PUBLIC_CARD_DESTINATIONS)).toEqual(CORE_SLUGS);
    for (const slug of CORE_SLUGS) {
      expect(getPublicCardDestination(slug)?.href).toBeTruthy();
    }
  });

  it("keeps verified apps and approved static status pages externally addressable", () => {
    expect(getPublicCardDestination("quote-pilot")).toEqual({
      kind: "external",
      href: "https://housingpa.com/repair/",
    });
    expect(getPublicCardDestination("bids-ai")).toEqual({
      kind: "external",
      href: "https://bysania.com/apps/bidsai/",
    });
    expect(getPublicCardDestination("idea-generator")).toEqual({
      kind: "external",
      href: "https://housingpa.com/ideamachine/",
    });
    expect(getPublicCardDestination("prospecting-machine")).toEqual({
      kind: "external",
      href: "/prospecting-status.html",
    });
    expect(getPublicCardDestination("daily-report")).toEqual({
      kind: "external",
      href: "/daily-report-status.html",
    });
  });

  it("uses isolated status workspaces for remaining apps without verified deployments", () => {
    for (const slug of ["email-app", "snooz-app"]) {
      expect(getPublicCardDestination(slug)).toEqual({
        kind: "workspace",
        href: `/workspaces/${slug}`,
      });
      expect(getToolWorkspace(slug)).toBeDefined();
    }
  });

  it("prefers a server-verified public URL", () => {
    expect(
      getPublicCardDestination(
        "idea-generator",
        "https://housingpa.com/ideamachine/"
      )
    ).toEqual({
      kind: "external",
      href: "https://housingpa.com/ideamachine/",
    });
  });

  it("keeps internal workspace copy explicitly non-production", () => {
    for (const workspace of Object.values(TOOL_WORKSPACES)) {
      expect(workspace.statusLabel.toLowerCase()).toMatch(
        /not deployed|source gate|delivery inactive/
      );
      expect(workspace.evidence.length).toBeGreaterThan(0);
      expect(workspace.nextActions.length).toBeGreaterThan(0);
    }
  });

  it("returns no workspace for an unknown slug", () => {
    expect(getToolWorkspace("does-not-exist")).toBeUndefined();
  });
});
