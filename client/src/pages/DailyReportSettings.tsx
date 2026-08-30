import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CloudOff,
  FlaskConical,
  Save,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

const TIMEZONES = [
  ["America/New_York", "Eastern Time"],
  ["America/Chicago", "Central Time"],
  ["America/Denver", "Mountain Time"],
  ["America/Los_Angeles", "Pacific Time"],
] as const;

function displayTimestamp(value: Date | null | undefined, timeZone: string) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function displayStatus(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, letter => letter.toUpperCase());
}

export default function DailyReportSettings() {
  const utils = trpc.useUtils();
  const reportQuery = trpc.dailyReport.get.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [enabled, setEnabled] = useState(false);
  const [scheduleTime, setScheduleTime] = useState("06:00");
  const [timezone, setTimezone] = useState("America/New_York");
  const [recipient, setRecipient] = useState("");

  useEffect(() => {
    if (!reportQuery.data) return;
    setEnabled(reportQuery.data.enabled);
    setScheduleTime(reportQuery.data.scheduleTime);
    setTimezone(reportQuery.data.timezone);
    setRecipient(reportQuery.data.recipient);
  }, [reportQuery.data]);

  const saveMutation = trpc.dailyReport.save.useMutation({
    onSuccess: async () => {
      await utils.dailyReport.get.invalidate();
      toast.success("Daily report settings saved.");
    },
    onError: error => toast.error(error.message),
  });
  const dryRunMutation = trpc.dailyReport.runManualDryRun.useMutation({
    onSuccess: async result => {
      await utils.dailyReport.get.invalidate();
      if (result.run.status === "DRY_RUN_READY") {
        toast.success("Dry run recorded. No email was sent.");
      } else {
        toast.warning(result.run.error ?? "Dry run was skipped.");
      }
    },
    onError: error => toast.error(error.message),
  });

  const hasChanges = useMemo(() => {
    const stored = reportQuery.data;
    if (!stored) return false;
    return (
      enabled !== stored.enabled ||
      scheduleTime !== stored.scheduleTime ||
      timezone !== stored.timezone ||
      recipient.trim().toLowerCase() !== stored.recipient
    );
  }, [enabled, reportQuery.data, recipient, scheduleTime, timezone]);

  const data = reportQuery.data;
  const unavailable = data && !data.persistenceAvailable;
  const busy = saveMutation.isPending || dryRunMutation.isPending;

  return (
    <div className="min-h-screen bg-[#f5f4ef] px-5 py-8 sm:px-8 lg:px-12 lg:py-11">
      <div className="mx-auto max-w-5xl">
        <header className="border-b border-[#d9e0d8] pb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#3f7465] transition hover:text-[#245548]"
          >
            <ArrowLeft className="h-4 w-4" />
            Tool hub
          </Link>
          <div className="mt-6 flex items-center gap-2 text-[#4d8977]">
            <CalendarClock className="h-4 w-4" />
            <p className="text-[11px] font-bold uppercase tracking-[0.18em]">
              Report control
            </p>
          </div>
          <h1 className="mt-4 font-serif text-4xl text-[#172b29] sm:text-5xl">
            Daily 6:00 AM Report
          </h1>
        </header>

        {reportQuery.isLoading ? (
          <div className="space-y-5 pt-8">
            <Skeleton className="h-24 rounded-2xl bg-[#e7ebe5]" />
            <Skeleton className="h-80 rounded-2xl bg-[#e7ebe5]" />
          </div>
        ) : reportQuery.isError || !data ? (
          <Card className="mt-8 rounded-2xl border-[#e3cfc6] bg-[#fffaf7]">
            <CardContent className="p-6 text-[#78433b]">
              <p className="font-semibold">
                Report settings could not be loaded.
              </p>
              <p className="mt-1 text-sm">Refresh the page and try again.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <section
              className="mt-8 flex items-start gap-4 border-y border-[#e2cfaa] bg-[#fff8e6] px-5 py-5 text-[#725b28] sm:px-6"
              aria-live="polite"
            >
              <CloudOff className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">
                  Cloud delivery is not configured.
                </p>
                <p className="mt-1 text-sm leading-6 text-[#806d43]">
                  {data.cloudExecution.detail}
                </p>
              </div>
            </section>

            {unavailable && (
              <section className="mt-5 flex items-start gap-4 border-y border-[#e3c5be] bg-[#fff4f1] px-5 py-5 text-[#824b42] sm:px-6">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">Persistence is unavailable.</p>
                  <p className="mt-1 text-sm leading-6">
                    Configure the database and apply the checked-in migration
                    before saving or running a test.
                  </p>
                </div>
              </section>
            )}

            <section className="pt-8" aria-labelledby="report-schedule-heading">
              <div className="mb-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#5a8d7d]">
                  Configuration
                </p>
                <h2
                  id="report-schedule-heading"
                  className="mt-1.5 text-xl font-semibold text-[#203633]"
                >
                  Schedule and recipient
                </h2>
              </div>

              <Card className="rounded-2xl border-[#dbe2da] bg-white shadow-[0_1px_0_rgba(20,45,40,0.04)]">
                <CardContent className="p-6 sm:p-8">
                  <div className="flex items-center justify-between gap-5 border-b border-[#e1e6df] pb-6">
                    <div>
                      <Label
                        htmlFor="daily-report-enabled"
                        className="font-semibold text-[#213633]"
                      >
                        Daily report
                      </Label>
                      <p className="mt-1 text-xs text-[#74817d]">
                        {enabled ? "Enabled" : "Disabled"}
                      </p>
                    </div>
                    <Switch
                      id="daily-report-enabled"
                      checked={enabled}
                      onCheckedChange={setEnabled}
                      disabled={Boolean(unavailable) || busy}
                      className="data-[state=checked]:bg-[#2e6658]"
                    />
                  </div>

                  <div className="grid gap-6 pt-6 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label
                        htmlFor="daily-report-time"
                        className="font-semibold text-[#2b413d]"
                      >
                        Schedule time
                      </Label>
                      <Input
                        id="daily-report-time"
                        type="time"
                        value={scheduleTime}
                        onChange={event => setScheduleTime(event.target.value)}
                        disabled={Boolean(unavailable) || busy}
                        className="h-11 rounded-xl border-[#cfdad0] bg-[#fbfcfa] shadow-none focus-visible:ring-[#5c9784]"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label
                        id="daily-report-timezone-label"
                        className="font-semibold text-[#2b413d]"
                      >
                        Timezone
                      </Label>
                      <Select
                        value={timezone}
                        onValueChange={setTimezone}
                        disabled={Boolean(unavailable) || busy}
                      >
                        <SelectTrigger
                          aria-labelledby="daily-report-timezone-label"
                          className="h-11 w-full rounded-xl border-[#cfdad0] bg-[#fbfcfa] shadow-none focus-visible:ring-[#5c9784]"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMEZONES.map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-2">
                    <Label
                      htmlFor="daily-report-recipient"
                      className="font-semibold text-[#2b413d]"
                    >
                      Recipient
                    </Label>
                    <Input
                      id="daily-report-recipient"
                      type="email"
                      value={recipient}
                      onChange={event => setRecipient(event.target.value)}
                      placeholder="name@example.com"
                      disabled={Boolean(unavailable) || busy}
                      className="h-11 rounded-xl border-[#cfdad0] bg-[#fbfcfa] shadow-none focus-visible:ring-[#5c9784]"
                    />
                  </div>

                  <div className="mt-7 flex flex-wrap justify-end gap-3 border-t border-[#e1e6df] pt-6">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={Boolean(unavailable) || busy || hasChanges}
                      onClick={() => dryRunMutation.mutate()}
                      className="h-11 rounded-xl border-[#b9c9be] bg-white px-4 text-[#2e6658] hover:bg-[#eef4ee]"
                    >
                      <FlaskConical className="mr-2 h-4 w-4" />
                      {dryRunMutation.isPending
                        ? "Checking..."
                        : "Run dry check"}
                    </Button>
                    <Button
                      type="button"
                      disabled={Boolean(unavailable) || busy || !hasChanges}
                      onClick={() =>
                        saveMutation.mutate({
                          enabled,
                          scheduleTime,
                          timezone,
                          recipient,
                        })
                      }
                      className="h-11 rounded-xl bg-[#2e6658] px-4 text-white hover:bg-[#245548]"
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {saveMutation.isPending ? "Saving..." : "Save settings"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </section>

            <section
              className="mt-10 border-t border-[#d9e0d8] pt-8"
              aria-labelledby="report-state-heading"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#5a8d7d]">
                Durable state
              </p>
              <h2
                id="report-state-heading"
                className="mt-1.5 text-xl font-semibold text-[#203633]"
              >
                Latest run
              </h2>
              <dl className="mt-5 grid border-y border-[#d9e0d8] sm:grid-cols-2">
                {[
                  ["Last run", displayTimestamp(data.lastRunAt, data.timezone)],
                  [
                    "Next intended run",
                    displayTimestamp(data.nextRunAt, data.timezone),
                  ],
                  [
                    "Latest delivery status",
                    displayStatus(data.latestDeliveryStatus),
                  ],
                  [
                    "Cloud schedule",
                    data.cloudExecution.scheduleActive
                      ? "Active"
                      : "Not active",
                  ],
                  [
                    "Cloud delivery",
                    data.cloudExecution.deliveryActive
                      ? "Active"
                      : "Not active",
                  ],
                  ["Latest error", data.latestError || "None recorded"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="border-b border-[#d9e0d8] px-1 py-5 sm:odd:border-r sm:px-5"
                  >
                    <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7c8a85]">
                      {label}
                    </dt>
                    <dd className="mt-2 break-words text-sm font-semibold text-[#2b413d]">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
