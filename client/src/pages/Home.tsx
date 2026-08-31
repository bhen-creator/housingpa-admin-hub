import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import type { InternalToolConfig, PublicToolCard } from "@shared/toolCatalog";
import { DAILY_REPORT_TOOL_SLUG } from "@shared/dailyReport";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  CalendarClock,
  Compass,
  Lightbulb,
  Mail,
  Plus,
  ReceiptText,
  SearchCheck,
  Sparkles,
  TimerReset,
  Wrench,
} from "lucide-react";
import { Link } from "wouter";

const ICONS: Record<string, typeof Compass> = {
  "quote-pilot": ReceiptText,
  "email-app": Mail,
  "bids-ai": Bot,
  "snooz-app": TimerReset,
  "idea-generator": Lightbulb,
  "prospecting-machine": SearchCheck,
  [DAILY_REPORT_TOOL_SLUG]: CalendarClock,
};

const ACCENTS: Record<string, string> = {
  "quote-pilot": "bg-[#dceee6] text-[#265b4e] dark:bg-[#1c453b] dark:text-[#b9dfd0]",
  "email-app": "bg-[#e4ebf6] text-[#395580] dark:bg-[#243a57] dark:text-[#c2d6f3]",
  "bids-ai": "bg-[#f5ead9] text-[#8a6234] dark:bg-[#4c3922] dark:text-[#f0c891]",
  "snooz-app": "bg-[#efe6f3] text-[#73516e] dark:bg-[#442f45] dark:text-[#e4c9df]",
  "idea-generator": "bg-[#f7f0cf] text-[#8a6e1c] dark:bg-[#51451d] dark:text-[#f6e493]",
  "prospecting-machine": "bg-[#e2ecec] text-[#365f63] dark:bg-[#203e42] dark:text-[#b8dce0]",
  [DAILY_REPORT_TOOL_SLUG]: "bg-[#f1e5dc] text-[#7b5141] dark:bg-[#4a3026] dark:text-[#edc5b3]",
};

const STATUS_PRESENTATION: Record<
  PublicToolCard["operationalState"],
  { label: string; action: string; tone: string }
> = {
  UNCONFIGURED: {
    label: "Not Ready Yet",
    action: "Configure destination",
    tone: "border-[#e1ddd2] bg-[#faf8f3] text-[#8c7657] dark:border-[#554a38] dark:bg-[#302d26] dark:text-[#e1c28b]",
  },
  CONFIGURED_UNVERIFIED: {
    label: "Needs Testing",
    action: "Verification required",
    tone: "border-[#e7d8b6] bg-[#fff9e9] text-[#86682d] dark:border-[#665633] dark:bg-[#352f1f] dark:text-[#e5c474]",
  },
  VERIFIED_USABLE: {
    label: "Working",
    action: "Open workspace",
    tone: "border-[#c7ddd2] bg-[#eef7f2] text-[#306b59] dark:border-[#315b50] dark:bg-[#19352f] dark:text-[#a8d5c5]",
  },
  BLOCKED: {
    label: "Repairing",
    action: "Review blocker",
    tone: "border-[#e5c9c4] bg-[#fff3f1] text-[#914d43] dark:border-[#693f3b] dark:bg-[#382521] dark:text-[#f0b5ac]",
  },
};

const PUBLIC_STATUS_PRESENTATION: Record<
  string,
  { label: string; action: string; tone: string }
> = {
  "quote-pilot": {
    label: "Live route",
    action: "Open verified app",
    tone: "border-[#c7ddd2] bg-[#eef7f2] text-[#306b59] dark:border-[#315b50] dark:bg-[#19352f] dark:text-[#a8d5c5]",
  },
  "bids-ai": {
    label: "Pilot only",
    action: "Open pilot app",
    tone: "border-[#e7d8b6] bg-[#fff9e9] text-[#86682d] dark:border-[#665633] dark:bg-[#352f1f] dark:text-[#e5c474]",
  },
  "email-app": {
    label: "Preparing",
    action: "Source gate",
    tone: "border-[#e1ddd2] bg-[#faf8f3] text-[#8c7657] dark:border-[#554a38] dark:bg-[#302d26] dark:text-[#e1c28b]",
  },
  "snooz-app": {
    label: "Source gate",
    action: "Repackage pending",
    tone: "border-[#e7d8b6] bg-[#fff9e9] text-[#86682d] dark:border-[#665633] dark:bg-[#352f1f] dark:text-[#e5c474]",
  },
  "idea-generator": {
    label: "Source gate",
    action: "Asset repair pending",
    tone: "border-[#e7d8b6] bg-[#fff9e9] text-[#86682d] dark:border-[#665633] dark:bg-[#352f1f] dark:text-[#e5c474]",
  },
};

type HubToolCard = PublicToolCard &
  Partial<Pick<InternalToolConfig, "internalRoute" | "destinationUrl">>;

function ToolCard({
  tool,
  index,
  publicReadOnly,
}: {
  tool: HubToolCard;
  index: number;
  publicReadOnly: boolean;
}) {
  const Icon = ICONS[tool.slug] ?? Wrench;
  const isReady = tool.canLaunch;
  const isInternalControl = Boolean(tool.internalRoute);
  const publicLaunchUrl = publicReadOnly ? tool.publicLaunchUrl : undefined;
  const canPublicLaunch = Boolean(publicLaunchUrl);
  const verifiedPublicStatus =
    publicReadOnly && tool.slug === "idea-generator" && canPublicLaunch
      ? {
          label: "Live route",
          action: "Open verified app",
          tone: "border-[#c7ddd2] bg-[#eef7f2] text-[#306b59] dark:border-[#315b50] dark:bg-[#19352f] dark:text-[#a8d5c5]",
        }
      : undefined;
  const status =
    verifiedPublicStatus ||
    (publicReadOnly && PUBLIC_STATUS_PRESENTATION[tool.slug]) ||
    (isInternalControl
      ? {
          label: "Not Ready Yet",
          action: "Open report settings",
          tone: "border-[#e1ddd2] bg-[#faf8f3] text-[#8c7657]",
        }
      : STATUS_PRESENTATION[tool.operationalState]);
  const action = status.action;
  const accent = ACCENTS[tool.slug] ?? "bg-[#dceee6] text-[#265b4e]";
  const isInteractive =
    canPublicLaunch || (!publicReadOnly && (isReady || isInternalControl));

  const cardContent = (
    <Card
      className={cn(
        "group h-full overflow-hidden rounded-[1.5rem] border-[#dbe2da] bg-white shadow-[0_1px_0_rgba(20,45,40,0.04)] transition duration-200 dark:border-[#2c4947] dark:bg-[#172729] dark:shadow-[0_1px_0_rgba(0,0,0,0.2)]",
        isInteractive &&
          "hover:-translate-y-1 hover:border-[#afcbbd] hover:shadow-[0_18px_36px_rgba(27,55,47,0.10)]",
        !isInteractive && "bg-white/75 dark:bg-[#172729]/75"
      )}
      style={{ animationDelay: `${index * 55}ms` }}
    >
      <CardContent className="flex h-full min-h-[132px] flex-col p-3 sm:min-h-[144px] sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <span
            className={cn(
              "grid h-9 w-9 place-items-center rounded-xl sm:h-10 sm:w-10",
              accent
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={2} />
          </span>
          {isInteractive ? (
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] sm:text-[9px]",
                  status.tone
                )}
              >
                {status.label}
              </span>
              <span className="grid h-7 w-7 place-items-center rounded-full border border-[#d8e1d9] text-[#346a5a] transition group-hover:border-[#346a5a] group-hover:bg-[#346a5a] group-hover:text-white dark:border-[#3e5f5d] dark:text-[#9dc8ba] dark:group-hover:border-[#87bbaa] dark:group-hover:bg-[#315f55] sm:h-8 sm:w-8">
                {isInternalControl ? (
                  <ArrowRight className="h-3.5 w-3.5" />
                ) : (
                  <ArrowUpRight className="h-3.5 w-3.5" />
                )}
              </span>
            </div>
          ) : (
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] sm:text-[9px]",
                status.tone
              )}
            >
              {status.label}
            </span>
          )}
        </div>
        <div className="mt-auto pt-3 sm:pt-4">
          <h2 className="text-sm font-semibold tracking-[-0.025em] text-[#1c302e] dark:text-[#edf7f3] sm:text-base">
            {tool.name}
          </h2>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[#687975] dark:text-[#afc2bc] sm:text-xs">
            {tool.description}
          </p>
          <p
            className={cn(
              "mt-2 text-[10px] font-semibold",
              isInteractive
                ? "text-[#3a7564] dark:text-[#8fcab8]"
                : "text-[#9a7e57] dark:text-[#d6b980]"
            )}
          >
            {action}
          </p>
        </div>
      </CardContent>
    </Card>
  );

  if (publicReadOnly) {
    if (publicLaunchUrl) {
      return (
        <a
          href={publicLaunchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block h-full"
          aria-label={`Open ${tool.name} in a new tab`}
        >
          {cardContent}
        </a>
      );
    }

    return <div className="block h-full">{cardContent}</div>;
  }

  return isInternalControl ? (
    <Link
      href={tool.internalRoute!}
      className="block h-full"
      aria-label={`Open ${tool.name} settings`}
    >
      {cardContent}
    </Link>
  ) : isReady ? (
    <a
      href={tool.destinationUrl!}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${tool.name} in a new tab`}
      className="block h-full"
    >
      {cardContent}
    </a>
  ) : (
    <Link
      href="/settings"
      className="block h-full"
      aria-label={`Configure ${tool.name}`}
    >
      {cardContent}
    </Link>
  );
}

function ToolGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 sm:gap-3">
      {Array.from({ length: 7 }).map((_, index) => (
        <Skeleton
          key={index}
          className="h-[132px] rounded-[1.25rem] bg-[#e7ebe5] dark:bg-[#223637] sm:h-[144px]"
        />
      ))}
    </div>
  );
}

export default function Home({ publicReadOnly = false }: { publicReadOnly?: boolean }) {
  const privateToolQuery = trpc.tools.list.useQuery(undefined, {
    enabled: !publicReadOnly,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const publicToolQuery = trpc.publicHub.list.useQuery(undefined, {
    enabled: publicReadOnly,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const toolQuery = publicReadOnly ? publicToolQuery : privateToolQuery;
  const tools = toolQuery.data ?? [];
  const featuredTools = tools.filter(tool => tool.category === "featured");
  const futureTools = tools.filter(tool => tool.category === "future");

  return (
    <div className="min-h-screen bg-[#f5f4ef] px-3 py-4 transition-colors dark:bg-[#101a1c] sm:px-6 sm:py-6 lg:px-8 lg:py-7">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col justify-between gap-3 border-b border-[#d9e0d8] pb-4 dark:border-[#2d4846] md:flex-row md:items-end">
          <div>
            <div className="flex items-center gap-2 text-[#4d8977] dark:text-[#94c7b7]">
              <span className="h-px w-7 bg-current" />
              <p className="text-[11px] font-bold uppercase tracking-[0.18em]">
                HousingPA · {publicReadOnly ? "overview" : "internal"}
              </p>
            </div>
            <h1 className="mt-2 font-serif text-2xl tracking-[-0.045em] text-[#172b29] dark:text-[#f0f7f4] sm:text-3xl">
              Admin tool hub
            </h1>
            <p className="mt-1 max-w-2xl text-xs leading-4 text-[#63736f] dark:text-[#b2c3bd] sm:text-sm sm:leading-5">
              A quiet, focused starting point for the work that moves HousingPA
              forward.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start md:self-auto">
            <ThemeToggle />
            {!publicReadOnly && (
              <Link
                href="/settings"
                className="inline-flex items-center gap-2 rounded-xl border border-[#c9d7cc] bg-white px-4 py-2.5 text-sm font-semibold text-[#275c4e] shadow-sm transition hover:border-[#9db9a7] hover:bg-[#eef4ee] dark:border-[#42615c] dark:bg-[#18302f] dark:text-[#d5eee5] dark:hover:border-[#78a494] dark:hover:bg-[#21413e]"
              >
                <Wrench className="h-4 w-4" />
                Manage tools
              </Link>
            )}
          </div>
        </header>

        <section className="pt-4" aria-labelledby="core-tools-heading">
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#5a8d7d] dark:text-[#92c2b4]">
                Operational status
              </p>
              <h2
                id="core-tools-heading"
                className="mt-1 text-base font-semibold tracking-[-0.03em] text-[#203633] dark:text-[#e7f2ee] sm:text-lg"
              >
                Core applications
              </h2>
            </div>
            {!toolQuery.isLoading && (
              <p className="text-xs font-medium text-[#778681] dark:text-[#a5b9b1]">
                {featuredTools.filter(tool => tool.canLaunch).length} of{" "}
                {featuredTools.length} verified usable
              </p>
            )}
          </div>

          {toolQuery.isLoading ? (
            <ToolGridSkeleton />
          ) : toolQuery.isError ? (
            <Card className="rounded-[1.5rem] border-[#e3cfc6] bg-[#fffaf7] p-6 text-[#78433b] dark:border-[#6b4039] dark:bg-[#352421] dark:text-[#f3b9ae]">
              <p className="font-semibold">
                The tool directory could not be loaded.
              </p>
              <p className="mt-1 text-sm">
                Refresh the page, or try again in a moment.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 sm:gap-3">
              {featuredTools.map((tool, index) => (
                <ToolCard
                  key={tool.slug}
                  tool={tool}
                  index={index}
                  publicReadOnly={publicReadOnly}
                />
              ))}
            </div>
          )}
        </section>

        {!publicReadOnly && <section
          className="mt-12 rounded-[1.75rem] border border-[#d7e2d9] bg-[#ebf0e9] p-6 dark:border-[#385652] dark:bg-[#182d2e] sm:p-8"
          aria-labelledby="future-tools-heading"
        >
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div className="max-w-xl">
              <div className="flex items-center gap-2 text-[#4b8775] dark:text-[#93c7b7]">
                <Sparkles className="h-4 w-4" />
                <p className="text-[11px] font-bold uppercase tracking-[0.16em]">
                  Designed to grow
                </p>
              </div>
              <h2
                id="future-tools-heading"
                className="mt-4 font-serif text-3xl tracking-[-0.04em] text-[#1c3430] dark:text-[#edf7f3]"
              >
                Future tools
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#61726d] dark:text-[#afc2bc]">
                New internal applications can live here as the team’s workflow
                evolves—without changing the hub’s structure.
              </p>
            </div>
            <Link
              href="/settings"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2e6658] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#245548] active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              Add future tool
            </Link>
          </div>

          {futureTools.length > 0 && (
            <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {futureTools.map((tool, index) => (
                <ToolCard
                  key={tool.slug}
                  tool={tool}
                  index={index}
                  publicReadOnly={false}
                />
              ))}
            </div>
          )}
        </section>}
      </div>
    </div>
  );
}
