import { Card, CardContent } from "@/components/ui/card";
import { getToolWorkspace } from "@/lib/toolWorkspaces";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Info,
  ShieldCheck,
} from "lucide-react";
import { Link } from "wouter";

export default function ToolWorkspace({ slug }: { slug: string }) {
  const workspace = getToolWorkspace(slug);

  if (!workspace) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f5f4ef] px-5 py-10 dark:bg-[#101a1c]">
        <Card className="w-full max-w-xl rounded-[1.75rem] border-[#dbe2da] bg-white dark:border-[#2c4947] dark:bg-[#172729]">
          <CardContent className="p-7 sm:p-9">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8a6234] dark:text-[#f0c891]">
              Workspace not configured
            </p>
            <h1 className="mt-3 font-serif text-3xl tracking-[-0.04em] text-[#172b29] dark:text-[#f0f7f4]">
              This tool workspace is unavailable.
            </h1>
            <p className="mt-4 text-sm leading-6 text-[#63736f] dark:text-[#afc2bc]">
              The address does not match a published first-version workspace.
            </p>
            <Link
              href="/"
              className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#2f6b5b] px-4 py-2.5 text-sm font-semibold text-white"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Admin Hub
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f4ef] px-4 py-6 transition-colors dark:bg-[#101a1c] sm:px-7 sm:py-9 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#356f60] dark:text-[#9dc8ba]"
        >
          <ArrowLeft className="h-4 w-4" /> Admin Hub
        </Link>

        <header className="mt-6 rounded-[2rem] border border-[#d8e1d9] bg-white p-6 shadow-[0_16px_40px_rgba(27,55,47,0.08)] dark:border-[#2c4947] dark:bg-[#172729] sm:p-9">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#4d8977] dark:text-[#94c7b7]">
                HousingPA · status workspace
              </p>
              <h1 className="mt-3 font-serif text-4xl tracking-[-0.045em] text-[#172b29] dark:text-[#f0f7f4] sm:text-5xl">
                {workspace.title}
              </h1>
              <p className="mt-4 text-sm leading-6 text-[#63736f] dark:text-[#afc2bc] sm:text-base">
                {workspace.summary}
              </p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#e7d8b6] bg-[#fff9e9] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#86682d] dark:border-[#665633] dark:bg-[#352f1f] dark:text-[#e5c474]">
              <ShieldCheck className="h-3.5 w-3.5" /> {workspace.statusLabel}
            </span>
          </div>
        </header>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card className="rounded-[1.75rem] border-[#dbe2da] bg-white dark:border-[#2c4947] dark:bg-[#172729]">
            <CardContent className="p-6 sm:p-7">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e4ebf6] text-[#395580] dark:bg-[#243a57] dark:text-[#c2d6f3]">
                  <Info className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#75837f] dark:text-[#92a7a1]">
                    Verified evidence
                  </p>
                  <h2 className="text-lg font-semibold text-[#203633] dark:text-[#edf7f3]">
                    What is known now
                  </h2>
                </div>
              </div>
              <ul className="mt-5 space-y-3">
                {workspace.evidence.map(item => (
                  <li
                    key={item}
                    className="flex gap-3 text-sm leading-6 text-[#63736f] dark:text-[#afc2bc]"
                  >
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#4d8977]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="rounded-[1.75rem] border-[#dbe2da] bg-white dark:border-[#2c4947] dark:bg-[#172729]">
            <CardContent className="p-6 sm:p-7">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f5ead9] text-[#8a6234] dark:bg-[#4c3922] dark:text-[#f0c891]">
                  <ClipboardList className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#75837f] dark:text-[#92a7a1]">
                    Next actions
                  </p>
                  <h2 className="text-lg font-semibold text-[#203633] dark:text-[#edf7f3]">
                    Path to a direct app
                  </h2>
                </div>
              </div>
              <ol className="mt-5 space-y-3">
                {workspace.nextActions.map((item, index) => (
                  <li
                    key={item}
                    className="flex gap-3 text-sm leading-6 text-[#63736f] dark:text-[#afc2bc]"
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#eef4ee] text-xs font-bold text-[#356f60] dark:bg-[#203a36] dark:text-[#9dc8ba]">
                      {index + 1}
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <p className="mt-5 text-xs text-[#778681] dark:text-[#92a7a1]">
          Status reviewed {workspace.updatedAt}. This page is informational and
          performs no production action.
        </p>
      </div>
    </main>
  );
}
