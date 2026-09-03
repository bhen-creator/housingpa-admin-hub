export type PublicCardDestination = {
  kind: "external" | "workspace";
  href: string;
};

export type ToolWorkspaceDefinition = {
  slug: string;
  title: string;
  statusLabel: string;
  summary: string;
  evidence: readonly string[];
  nextActions: readonly string[];
  updatedAt: string;
};

export const PUBLIC_CARD_DESTINATIONS: Readonly<
  Record<string, PublicCardDestination>
> = {
  "quote-pilot": {
    kind: "external",
    href: "https://housingpa.com/repair/",
  },
  "email-app": {
    kind: "workspace",
    href: "/workspaces/email-app",
  },
  "bids-ai": {
    kind: "external",
    href: "https://bysania.com/apps/bidsai/",
  },
  "snooz-app": {
    kind: "workspace",
    href: "/workspaces/snooz-app",
  },
  "idea-generator": {
    kind: "external",
    href: "https://housingpa.com/ideamachine/",
  },
  "prospecting-machine": {
    kind: "workspace",
    href: "/workspaces/prospecting-machine",
  },
  "daily-report": {
    kind: "workspace",
    href: "/workspaces/daily-report",
  },
};

export const TOOL_WORKSPACES: Readonly<
  Record<string, ToolWorkspaceDefinition>
> = {
  "email-app": {
    slug: "email-app",
    title: "Email App",
    statusLabel: "Internal first version · not deployed",
    summary:
      "A safe status and control surface for the Email App while its source and launch destination remain under verification.",
    evidence: [
      "The live Admin Hub currently labels this app as Preparing with a source gate.",
      "No independently verified public application route is recorded in the Hub.",
      "This page does not read, send, or expose email.",
    ],
    nextActions: [
      "Identify the authoritative source package and owner.",
      "Run source tests and a local launch check.",
      "Verify an approved destination before enabling a direct app link.",
    ],
    updatedAt: "2026-09-03",
  },
  "snooz-app": {
    slug: "snooz-app",
    title: "Snooze",
    statusLabel: "Internal first version · source gate",
    summary:
      "A status workspace for the reminder app; it is useful for continuity without claiming that a production application is ready.",
    evidence: [
      "The live Admin Hub currently labels Snooze as Source gate and Repackage pending.",
      "No independently verified public application route is recorded in the Hub.",
      "No reminders or notifications are created from this page.",
    ],
    nextActions: [
      "Complete the admitted source-repackaging review.",
      "Run local reminder-flow tests against non-production data.",
      "Publish a direct route only after deployment and browser verification are approved.",
    ],
    updatedAt: "2026-09-03",
  },
  "prospecting-machine": {
    slug: "prospecting-machine",
    title: "Prospecting Machine",
    statusLabel: "Internal first version · not deployed",
    summary:
      "A planning and readiness workspace that does not imply outreach authority or a working production system.",
    evidence: [
      "The live Admin Hub currently labels this tool Not ready yet.",
      "No independently verified public application route is recorded in the Hub.",
      "This page performs no research, contact enrichment, or outreach.",
    ],
    nextActions: [
      "Define the smallest review-only prospecting workflow.",
      "Confirm the authoritative data source and privacy boundary.",
      "Verify a non-outreach first version before enabling a direct app link.",
    ],
    updatedAt: "2026-09-03",
  },
  "daily-report": {
    slug: "daily-report",
    title: "Daily 6:00 AM Report",
    statusLabel: "Internal first version · delivery inactive",
    summary:
      "A public-safe readiness view for the existing authenticated report control; it does not configure scheduling or send a report.",
    evidence: [
      "The repository contains an authenticated report control at /settings/reports/daily.",
      "The checked-in worker remains provider-neutral and requires a separately approved cloud deployment.",
      "This page cannot change recipients, schedules, credentials, or delivery state.",
    ],
    nextActions: [
      "Review settings from the authenticated administrator area.",
      "Approve a cloud scheduler, migration, and idempotent delivery adapter separately.",
      "Verify one end-to-end delivery before marking the report operational.",
    ],
    updatedAt: "2026-09-03",
  },
};

export function getPublicCardDestination(
  slug: string,
  serverVerifiedUrl?: string
): PublicCardDestination | undefined {
  if (serverVerifiedUrl) {
    return { kind: "external", href: serverVerifiedUrl };
  }
  return PUBLIC_CARD_DESTINATIONS[slug];
}

export function getToolWorkspace(slug: string) {
  return TOOL_WORKSPACES[slug];
}
