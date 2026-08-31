import { DAILY_REPORT_TOOL_SLUG } from "./dailyReport";

export type ToolCategory = "featured" | "future";

export const TOOL_OPERATIONAL_STATES = [
  "UNCONFIGURED",
  "CONFIGURED_UNVERIFIED",
  "VERIFIED_USABLE",
  "BLOCKED",
] as const;

export type ToolOperationalState = (typeof TOOL_OPERATIONAL_STATES)[number];

export type InternalToolRecord = {
  id?: number;
  slug: string;
  name: string;
  description: string;
  destinationUrl: string;
  internalRoute?: string;
  category: ToolCategory;
  sortOrder: number;
  isActive?: boolean;
  operationalState: ToolOperationalState;
  verificationEvidence: string | null;
  verifiedAt: Date | string | null;
  blockedReason: string | null;
};

export type InternalToolConfig = InternalToolRecord & {
  canLaunch: boolean;
};

/**
 * The only card data that may be returned to the public read-only Hub.
 * It intentionally excludes generic destinations, internal routes, evidence,
 * and blocker details so the Hub cannot become an index of internal services.
 * The optional publicLaunchUrl is a narrowly allowlisted, independently
 * verified public route; it is never derived from runtime configuration.
 */
export type PublicToolCard = Pick<
  InternalToolConfig,
  | "slug"
  | "name"
  | "description"
  | "category"
  | "sortOrder"
  | "operationalState"
  | "canLaunch"
> & {
  publicLaunchUrl?: string;
};

/**
 * Public Hub navigation is deliberately limited to routes independently
 * verified as public applications. Do not add a route here merely because a
 * tool has a configured destination: re-verify the exact public URL first.
 */
export const PUBLIC_LIVE_TOOL_ROUTES = {
  "quote-pilot": "https://housingpa.com/repair/",
  "bids-ai": "https://bysania.com/apps/bidsai/",
  // The Idea Generator uses a fixed public route, but is kept non-clickable
  // until the provider has recorded a verified canonical destination.
  "idea-generator": "https://housingpa.com/ideamachine/",
} as const;

const PUBLIC_ROUTE_REQUIRING_CANONICAL_VERIFICATION = new Set([
  "idea-generator",
]);

function hasCanonicalPublicDestination(expectedRoute: string, value?: string) {
  if (!value) return false;

  try {
    const expected = new URL(expectedRoute);
    const actual = new URL(value);
    const expectedPath = expected.pathname.replace(/\/+$/, "") || "/";
    const actualPath = actual.pathname.replace(/\/+$/, "") || "/";

    return (
      actual.protocol === expected.protocol &&
      actual.host === expected.host &&
      actualPath === expectedPath &&
      !actual.search &&
      !actual.hash
    );
  } catch {
    return false;
  }
}

export function getPublicLiveToolRoute(
  slug: string,
  verifiedDestinationUrl?: string
) {
  const route =
    PUBLIC_LIVE_TOOL_ROUTES[
      slug as keyof typeof PUBLIC_LIVE_TOOL_ROUTES
    ];

  if (!route) return undefined;
  if (
    PUBLIC_ROUTE_REQUIRING_CANONICAL_VERIFICATION.has(slug) &&
    !hasCanonicalPublicDestination(route, verifiedDestinationUrl)
  ) {
    return undefined;
  }

  return route;
}

const UNCONFIGURED_STATE = {
  operationalState: "UNCONFIGURED" as const,
  verificationEvidence: null,
  verifiedAt: null,
  blockedReason: null,
};

export const DEFAULT_INTERNAL_TOOLS: readonly InternalToolRecord[] = [
  {
    slug: "quote-pilot",
    name: "QuotePilot",
    description:
      "Create clear, customer-ready estimates with a faster review flow.",
    destinationUrl: "",
    category: "featured",
    sortOrder: 10,
    ...UNCONFIGURED_STATE,
  },
  {
    slug: "email-app",
    name: "Email App",
    description:
      "Keep day-to-day customer communication organized and actionable.",
    destinationUrl: "",
    category: "featured",
    sortOrder: 20,
    ...UNCONFIGURED_STATE,
  },
  {
    slug: "bids-ai",
    name: "BIDsAI",
    description:
      "Accelerate bid preparation while preserving a consistent point of view.",
    destinationUrl: "",
    category: "featured",
    sortOrder: 30,
    ...UNCONFIGURED_STATE,
  },
  {
    slug: "snooz-app",
    name: "Snooze",
    description:
      "Set intentional reminders so critical follow-ups do not slip through.",
    destinationUrl: "",
    category: "featured",
    sortOrder: 40,
    ...UNCONFIGURED_STATE,
  },
  {
    slug: "idea-generator",
    name: "Daily Idea Generator",
    description:
      "Turn early thoughts into practical ideas worth moving forward.",
    destinationUrl: "",
    category: "featured",
    sortOrder: 50,
    ...UNCONFIGURED_STATE,
  },
  {
    slug: "prospecting-machine",
    name: "Prospecting Machine",
    description:
      "Coordinate prospecting research and review without implying outreach authority.",
    destinationUrl: "",
    category: "featured",
    sortOrder: 60,
    ...UNCONFIGURED_STATE,
  },
  {
    slug: DAILY_REPORT_TOOL_SLUG,
    name: "Daily 6:00 AM Report",
    description:
      "Review report timing, delivery readiness, and the latest durable run status.",
    destinationUrl: "",
    internalRoute: "/settings/reports/daily",
    category: "featured",
    sortOrder: 70,
    ...UNCONFIGURED_STATE,
  },
];

export const CORE_TOOL_SLUGS = DEFAULT_INTERNAL_TOOLS.map(tool => tool.slug);

export function isCoreToolSlug(value: string) {
  return CORE_TOOL_SLUGS.includes(value);
}

export function isExternalCoreToolSlug(value: string) {
  return isCoreToolSlug(value) && value !== DAILY_REPORT_TOOL_SLUG;
}

type DestinationPolicy = {
  allowEmpty?: boolean;
  allowLocalHttp?: boolean;
};

export function isDestinationUrl(
  value: string,
  { allowEmpty = true, allowLocalHttp = false }: DestinationPolicy = {}
) {
  const normalized = value.trim();
  if (!normalized) return allowEmpty;

  try {
    const parsed = new URL(normalized);
    if (parsed.username || parsed.password) return false;
    if (parsed.protocol === "https:") return true;
    if (parsed.protocol !== "http:" || !allowLocalHttp) return false;
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function hasValidVerification(
  tool: InternalToolRecord,
  allowLocalHttp: boolean
) {
  const evidence = tool.verificationEvidence?.trim();
  const verifiedAt =
    tool.verifiedAt instanceof Date
      ? tool.verifiedAt
      : tool.verifiedAt
        ? new Date(tool.verifiedAt)
        : null;

  return Boolean(
    tool.operationalState === "VERIFIED_USABLE" &&
      evidence &&
      verifiedAt &&
      !Number.isNaN(verifiedAt.getTime()) &&
      isDestinationUrl(tool.destinationUrl, {
        allowEmpty: false,
        allowLocalHttp,
      })
  );
}

export function normalizeInternalTool(
  tool: InternalToolRecord,
  { allowLocalHttp = false }: Pick<DestinationPolicy, "allowLocalHttp"> = {}
): InternalToolConfig {
  const destinationUrl = tool.destinationUrl.trim();
  const destinationIsSafe = isDestinationUrl(destinationUrl, {
    allowEmpty: true,
    allowLocalHttp,
  });

  let operationalState = tool.operationalState;
  let blockedReason = tool.blockedReason;

  if (destinationUrl && !destinationIsSafe) {
    operationalState = "BLOCKED";
    blockedReason ||= "Destination does not meet the URL security policy.";
  } else if (operationalState !== "BLOCKED" && !destinationUrl) {
    operationalState = "UNCONFIGURED";
  } else if (operationalState === "UNCONFIGURED" && destinationUrl) {
    operationalState = "CONFIGURED_UNVERIFIED";
  }

  const normalized: InternalToolRecord = {
    ...tool,
    destinationUrl,
    operationalState,
    blockedReason,
  };

  if (
    operationalState === "VERIFIED_USABLE" &&
    !hasValidVerification(normalized, allowLocalHttp)
  ) {
    normalized.operationalState = "CONFIGURED_UNVERIFIED";
  }

  return {
    ...normalized,
    canLaunch: hasValidVerification(normalized, allowLocalHttp),
  };
}

export function mergeInternalTools(
  persistedTools: InternalToolRecord[]
): InternalToolRecord[] {
  const persistedBySlug = new Map(
    persistedTools.map(tool => [tool.slug, tool])
  );
  const coreTools = DEFAULT_INTERNAL_TOOLS.map(defaultTool => ({
    ...defaultTool,
    ...persistedBySlug.get(defaultTool.slug),
    name: defaultTool.name,
    slug: defaultTool.slug,
    category: "featured" as const,
  }));

  const futureTools = persistedTools
    .filter(tool => tool.category === "future" && tool.isActive !== false)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  return [...coreTools, ...futureTools];
}

export function toPublicToolCard(tool: InternalToolConfig): PublicToolCard {
  const canonicalTool = DEFAULT_INTERNAL_TOOLS.find(
    item => item.slug === tool.slug
  );

  if (!canonicalTool) {
    throw new Error("Only canonical core tools can be published.");
  }

  const publicLaunchUrl = getPublicLiveToolRoute(
    canonicalTool.slug,
    tool.canLaunch ? tool.destinationUrl : undefined
  );

  return {
    slug: canonicalTool.slug,
    name: canonicalTool.name,
    description: canonicalTool.description,
    category: "featured",
    sortOrder: canonicalTool.sortOrder,
    operationalState: tool.operationalState,
    canLaunch: tool.canLaunch,
    ...(publicLaunchUrl ? { publicLaunchUrl } : {}),
  };
}
