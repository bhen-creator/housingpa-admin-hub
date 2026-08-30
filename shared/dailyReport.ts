export const DAILY_REPORT_TOOL_SLUG = "daily-report";
export const DAILY_REPORT_SETTINGS_ID = 1;

export const DAILY_REPORT_DELIVERY_STATUSES = [
  "NEVER_RUN",
  "DRY_RUN_READY",
  "QUEUED",
  "DELIVERED",
  "FAILED",
  "SKIPPED",
] as const;

export type DailyReportDeliveryStatus =
  (typeof DAILY_REPORT_DELIVERY_STATUSES)[number];

export const DAILY_REPORT_RUN_TRIGGERS = [
  "MANUAL_DRY_RUN",
  "SCHEDULED",
] as const;

export type DailyReportRunTrigger = (typeof DAILY_REPORT_RUN_TRIGGERS)[number];

export const DAILY_REPORT_CLOUD_STATES = [
  "UNCONFIGURED",
  "CONFIGURED_UNVERIFIED",
  "VERIFIED_USABLE",
  "BLOCKED",
] as const;

export type DailyReportCloudState = (typeof DAILY_REPORT_CLOUD_STATES)[number];

export const DEFAULT_DAILY_REPORT_SETTINGS = {
  enabled: false,
  scheduleTime: "06:00",
  timezone: "America/New_York",
  recipient: "",
} as const;

export type DailyReportSettingsInput = {
  enabled: boolean;
  scheduleTime: string;
  timezone: string;
  recipient: string;
};

export type DailyReportSettingsRecord = DailyReportSettingsInput & {
  id: number;
  lastRunAt: Date | null;
  latestDeliveryStatus: DailyReportDeliveryStatus;
  latestError: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export type DailyReportRunRecord = {
  runId: string;
  trigger: DailyReportRunTrigger;
  status: DailyReportDeliveryStatus;
  scheduledFor: Date | null;
  startedAt: Date;
  completedAt: Date | null;
  deliveryResult: string | null;
  error: string | null;
};

export type DailyReportCloudBoundary = {
  state: DailyReportCloudState;
  scheduleActive: boolean;
  deliveryActive: boolean;
  detail: string;
};

export function isValidScheduleTime(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find(part => part.type === type)?.value);

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function addUtcDays(
  parts: Pick<ReturnType<typeof zonedParts>, "year" | "month" | "day">,
  days: number
) {
  const date = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days)
  );
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function zonedDateTimeToUtc(
  local: ReturnType<typeof addUtcDays> & { hour: number; minute: number },
  timeZone: string
) {
  const targetEpoch = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute
  );
  let candidate = targetEpoch;

  // Recalculate twice to settle across daylight-saving boundaries.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const observed = zonedParts(new Date(candidate), timeZone);
    const observedEpoch = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second
    );
    candidate = targetEpoch - (observedEpoch - candidate);
  }

  return new Date(candidate);
}

export function nextDailyReportRun(
  settings: Pick<
    DailyReportSettingsInput,
    "enabled" | "scheduleTime" | "timezone"
  >,
  from = new Date()
) {
  if (
    !settings.enabled ||
    !isValidScheduleTime(settings.scheduleTime) ||
    !isValidTimeZone(settings.timezone)
  ) {
    return null;
  }

  const [hour, minute] = settings.scheduleTime.split(":").map(Number);
  const localNow = zonedParts(from, settings.timezone);
  const targetMinutes = hour * 60 + minute;
  const currentMinutes = localNow.hour * 60 + localNow.minute;
  const dayOffset = currentMinutes < targetMinutes ? 0 : 1;
  const targetDate = addUtcDays(localNow, dayOffset);
  const candidate = zonedDateTimeToUtc(
    { ...targetDate, hour, minute },
    settings.timezone
  );

  if (candidate.getTime() > from.getTime()) return candidate;

  const followingDate = addUtcDays(targetDate, 1);
  return zonedDateTimeToUtc(
    { ...followingDate, hour, minute },
    settings.timezone
  );
}
