export type ToolCategory = "featured" | "future";

export type InternalToolConfig = {
  id?: number;
  slug: string;
  name: string;
  description: string;
  destinationUrl: string;
  category: ToolCategory;
  sortOrder: number;
  isActive?: boolean;
};

export const DEFAULT_INTERNAL_TOOLS: readonly InternalToolConfig[] = [
  {
    slug: "quote-pilot",
    name: "QuotePilot",
    description: "Create clear, customer-ready estimates with a faster review flow.",
    destinationUrl: "",
    category: "featured",
    sortOrder: 10,
  },
  {
    slug: "email-app",
    name: "EmailApp",
    description: "Keep day-to-day customer communication organized and actionable.",
    destinationUrl: "",
    category: "featured",
    sortOrder: 20,
  },
  {
    slug: "bids-ai",
    name: "BidsAI",
    description: "Accelerate bid preparation while preserving a consistent point of view.",
    destinationUrl: "",
    category: "featured",
    sortOrder: 30,
  },
  {
    slug: "snooz-app",
    name: "SnoozApp",
    description: "Set intentional reminders so critical follow-ups do not slip through.",
    destinationUrl: "",
    category: "featured",
    sortOrder: 40,
  },
  {
    slug: "idea-generator",
    name: "Idea Generator",
    description: "Turn early thoughts into practical ideas worth moving forward.",
    destinationUrl: "",
    category: "featured",
    sortOrder: 50,
  },
];

export const CORE_TOOL_SLUGS = DEFAULT_INTERNAL_TOOLS.map(tool => tool.slug);

export function isCoreToolSlug(value: string): value is (typeof CORE_TOOL_SLUGS)[number] {
  return CORE_TOOL_SLUGS.includes(value);
}

export function isExternalToolUrl(value: string) {
  if (!value) return true;

  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function mergeInternalTools(
  persistedTools: InternalToolConfig[],
): InternalToolConfig[] {
  const persistedBySlug = new Map(persistedTools.map(tool => [tool.slug, tool]));
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
