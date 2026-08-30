import { describe, expect, it } from "vitest";
import {
  DAILY_REPORT_WORKER_ENV,
  DailyReportWorkerConfigurationError,
  readDailyReportWorkerConfig,
} from "./dailyReportWorkerConfig";
import {
  deriveDailyReportRunId,
  readDailyReportWorkerInvocation,
} from "./dailyReportWorkerRuntime";

describe("daily report worker configuration", () => {
  it("uses deployment-safe defaults without exposing connection values", () => {
    expect(readDailyReportWorkerConfig({})).toEqual({
      enabled: false,
      schedule: "06:00",
      timezone: "America/New_York",
      recipient: "",
      providerAdapter: "unconfigured",
      maxAttempts: 3,
      backoffSeconds: 300,
      leaseSeconds: 120,
      queueDatabaseConfigured: false,
    });
  });

  it("parses the documented configuration names", () => {
    const configuration = readDailyReportWorkerConfig({
      [DAILY_REPORT_WORKER_ENV.enabled]: "true",
      [DAILY_REPORT_WORKER_ENV.schedule]: "06:00",
      [DAILY_REPORT_WORKER_ENV.timezone]: "America/New_York",
      [DAILY_REPORT_WORKER_ENV.recipient]: "REPORTS@EXAMPLE.COM",
      [DAILY_REPORT_WORKER_ENV.providerAdapter]: "provider-name",
      [DAILY_REPORT_WORKER_ENV.maxAttempts]: "5",
      [DAILY_REPORT_WORKER_ENV.backoffSeconds]: "120",
      [DAILY_REPORT_WORKER_ENV.leaseSeconds]: "90",
      [DAILY_REPORT_WORKER_ENV.queueDatabaseUrl]: "redacted-test-value",
    });

    expect(configuration).toMatchObject({
      enabled: true,
      recipient: "reports@example.com",
      providerAdapter: "provider-name",
      maxAttempts: 5,
      backoffSeconds: 120,
      leaseSeconds: 90,
      queueDatabaseConfigured: true,
    });
    expect(JSON.stringify(configuration)).not.toContain("redacted-test-value");
  });

  it("derives one stable 64-character run ID from scheduled time", () => {
    const scheduledFor = new Date("2026-08-30T10:00:00Z");
    expect(deriveDailyReportRunId(scheduledFor)).toBe(
      deriveDailyReportRunId(new Date("2026-08-30T10:00:00Z"))
    );
    expect(deriveDailyReportRunId(scheduledFor)).toHaveLength(64);
    expect(
      readDailyReportWorkerInvocation({
        [DAILY_REPORT_WORKER_ENV.scheduledFor]: scheduledFor.toISOString(),
      }).runId
    ).toBe(deriveDailyReportRunId(scheduledFor));
  });

  it("rejects ambiguous scheduler invocations", () => {
    expect(() => readDailyReportWorkerInvocation({})).toThrow(
      DailyReportWorkerConfigurationError
    );
    expect(() =>
      readDailyReportWorkerConfig({
        [DAILY_REPORT_WORKER_ENV.enabled]: "yes",
      })
    ).toThrow(DailyReportWorkerConfigurationError);
  });
});
