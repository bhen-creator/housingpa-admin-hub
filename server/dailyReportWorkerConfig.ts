import { isValidScheduleTime, isValidTimeZone } from "@shared/dailyReport";

export const DAILY_REPORT_WORKER_ENV = {
  enabled: "DAILY_REPORT_WORKER_ENABLED",
  schedule: "DAILY_REPORT_SCHEDULE",
  timezone: "DAILY_REPORT_TIMEZONE",
  recipient: "DAILY_REPORT_RECIPIENT",
  providerAdapter: "DAILY_REPORT_PROVIDER_ADAPTER",
  maxAttempts: "DAILY_REPORT_MAX_ATTEMPTS",
  backoffSeconds: "DAILY_REPORT_BACKOFF_SECONDS",
  leaseSeconds: "DAILY_REPORT_LEASE_SECONDS",
  queueDatabaseUrl: "DAILY_REPORT_QUEUE_DATABASE_URL",
  runId: "DAILY_REPORT_RUN_ID",
  scheduledFor: "DAILY_REPORT_SCHEDULED_FOR",
} as const;

export type DailyReportWorkerRuntimeConfig = {
  enabled: boolean;
  schedule: string;
  timezone: string;
  recipient: string;
  providerAdapter: string;
  maxAttempts: number;
  backoffSeconds: number;
  leaseSeconds: number;
  queueDatabaseConfigured: boolean;
};

export class DailyReportWorkerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DailyReportWorkerConfigurationError";
  }
}

function parseBoolean(value: string | undefined) {
  if (!value) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new DailyReportWorkerConfigurationError(
    `${DAILY_REPORT_WORKER_ENV.enabled} must be true or false.`
  );
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
  maximum: number
) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new DailyReportWorkerConfigurationError(
      `${name} must be an integer between 1 and ${maximum}.`
    );
  }
  return parsed;
}

export function readDailyReportWorkerConfig(
  environment: NodeJS.ProcessEnv = process.env
): DailyReportWorkerRuntimeConfig {
  const schedule = environment[DAILY_REPORT_WORKER_ENV.schedule] ?? "06:00";
  const timezone =
    environment[DAILY_REPORT_WORKER_ENV.timezone] ?? "America/New_York";
  const recipient =
    environment[DAILY_REPORT_WORKER_ENV.recipient]?.trim().toLowerCase() ?? "";

  if (!isValidScheduleTime(schedule)) {
    throw new DailyReportWorkerConfigurationError(
      `${DAILY_REPORT_WORKER_ENV.schedule} must use 24-hour HH:MM format.`
    );
  }
  if (!isValidTimeZone(timezone)) {
    throw new DailyReportWorkerConfigurationError(
      `${DAILY_REPORT_WORKER_ENV.timezone} must be a valid IANA timezone.`
    );
  }
  if (recipient && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new DailyReportWorkerConfigurationError(
      `${DAILY_REPORT_WORKER_ENV.recipient} must be a valid email address.`
    );
  }

  const providerAdapter =
    environment[DAILY_REPORT_WORKER_ENV.providerAdapter]?.trim() ||
    "unconfigured";
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(providerAdapter)) {
    throw new DailyReportWorkerConfigurationError(
      `${DAILY_REPORT_WORKER_ENV.providerAdapter} must be a safe adapter identifier.`
    );
  }

  return {
    enabled: parseBoolean(environment[DAILY_REPORT_WORKER_ENV.enabled]),
    schedule,
    timezone,
    recipient,
    providerAdapter,
    maxAttempts: parsePositiveInteger(
      environment[DAILY_REPORT_WORKER_ENV.maxAttempts],
      3,
      DAILY_REPORT_WORKER_ENV.maxAttempts,
      20
    ),
    backoffSeconds: parsePositiveInteger(
      environment[DAILY_REPORT_WORKER_ENV.backoffSeconds],
      300,
      DAILY_REPORT_WORKER_ENV.backoffSeconds,
      86_400
    ),
    leaseSeconds: parsePositiveInteger(
      environment[DAILY_REPORT_WORKER_ENV.leaseSeconds],
      120,
      DAILY_REPORT_WORKER_ENV.leaseSeconds,
      3_600
    ),
    queueDatabaseConfigured: Boolean(
      environment[DAILY_REPORT_WORKER_ENV.queueDatabaseUrl] ||
        environment.DATABASE_URL
    ),
  };
}
