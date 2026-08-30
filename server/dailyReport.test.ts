import {
  DEFAULT_DAILY_REPORT_SETTINGS,
  nextDailyReportRun,
  type DailyReportRunRecord,
  type DailyReportSettingsInput,
  type DailyReportSettingsRecord,
} from "@shared/dailyReport";
import { describe, expect, it } from "vitest";
import {
  createDailyReportService,
  DailyReportPersistenceUnavailableError,
  type DailyReportRepository,
} from "./dailyReportService";
import {
  DailyReportCloudWorkerUnavailableError,
  unconfiguredDailyReportCloudWorker,
} from "./dailyReportCloud";

class MemoryDailyReportRepository implements DailyReportRepository {
  available = true;
  settings: DailyReportSettingsRecord | null = null;
  runs = new Map<string, DailyReportRunRecord>();

  async readSettings() {
    return this.available ? this.settings : undefined;
  }

  async saveSettings(input: DailyReportSettingsInput) {
    const now = new Date("2026-08-30T12:00:00Z");
    this.settings = {
      id: 1,
      ...input,
      lastRunAt: this.settings?.lastRunAt ?? null,
      latestDeliveryStatus: this.settings?.latestDeliveryStatus ?? "NEVER_RUN",
      latestError: this.settings?.latestError ?? null,
      createdAt: this.settings?.createdAt ?? now,
      updatedAt: now,
    };
    return this.settings;
  }

  async readRun(runId: string) {
    return this.available ? (this.runs.get(runId) ?? null) : undefined;
  }

  async recordRun(run: DailyReportRunRecord) {
    const existing = this.runs.get(run.runId);
    if (existing) return existing;
    this.runs.set(run.runId, run);
    if (this.settings) {
      this.settings = {
        ...this.settings,
        lastRunAt: run.completedAt ?? run.startedAt,
        latestDeliveryStatus: run.status,
        latestError: run.error,
      };
    }
    return run;
  }
}

const FIXED_NOW = new Date("2026-08-30T12:30:00Z");

describe("daily report control", () => {
  it("computes the next 6:00 AM run in the selected timezone", () => {
    expect(
      nextDailyReportRun(
        {
          enabled: true,
          scheduleTime: "06:00",
          timezone: "America/New_York",
        },
        FIXED_NOW
      )?.toISOString()
    ).toBe("2026-08-31T10:00:00.000Z");
  });

  it("persists settings across service re-instantiation", async () => {
    const repository = new MemoryDailyReportRepository();
    const firstProcess = createDailyReportService(repository, {
      now: () => FIXED_NOW,
    });
    await firstProcess.saveSettings({
      enabled: true,
      scheduleTime: "06:00",
      timezone: "America/New_York",
      recipient: "REPORTS@EXAMPLE.COM",
    });

    const restartedProcess = createDailyReportService(repository, {
      now: () => FIXED_NOW,
    });
    await expect(restartedProcess.readView()).resolves.toMatchObject({
      enabled: true,
      scheduleTime: "06:00",
      timezone: "America/New_York",
      recipient: "reports@example.com",
      persistenceAvailable: true,
    });
  });

  it("records a dry run without activating cloud schedule or delivery", async () => {
    const repository = new MemoryDailyReportRepository();
    await repository.saveSettings({
      enabled: true,
      scheduleTime: "06:00",
      timezone: "America/New_York",
      recipient: "reports@example.com",
    });
    const service = createDailyReportService(repository, {
      now: () => FIXED_NOW,
    });

    const result = await service.runManualDryRun("manual-test-001");

    expect(result).toMatchObject({
      replayed: false,
      run: {
        runId: "manual-test-001",
        trigger: "MANUAL_DRY_RUN",
        status: "DRY_RUN_READY",
        error: null,
      },
      settings: {
        latestDeliveryStatus: "DRY_RUN_READY",
        cloudExecution: {
          state: "UNCONFIGURED",
          scheduleActive: false,
          deliveryActive: false,
        },
      },
    });
    expect(result.run.deliveryResult).toContain("No email was sent");
    expect(repository.runs.size).toBe(1);
  });

  it("replays a run ID without creating a duplicate durable run", async () => {
    const repository = new MemoryDailyReportRepository();
    await repository.saveSettings({
      enabled: true,
      scheduleTime: "06:00",
      timezone: "America/New_York",
      recipient: "reports@example.com",
    });
    const service = createDailyReportService(repository, {
      now: () => FIXED_NOW,
    });

    const first = await service.runManualDryRun("manual-test-replay");
    const replay = await service.runManualDryRun("manual-test-replay");

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.run).toEqual(first.run);
    expect(repository.runs.size).toBe(1);
  });

  it("skips a disabled report and records the exact blocker", async () => {
    const repository = new MemoryDailyReportRepository();
    await repository.saveSettings({ ...DEFAULT_DAILY_REPORT_SETTINGS });
    const service = createDailyReportService(repository, {
      now: () => FIXED_NOW,
    });

    const result = await service.runManualDryRun("manual-test-disabled");

    expect(result.run).toMatchObject({
      status: "SKIPPED",
      error: "The daily report is disabled.",
      deliveryResult: "No email was sent.",
    });
  });

  it("returns honest defaults but blocks writes without persistence", async () => {
    const repository = new MemoryDailyReportRepository();
    repository.available = false;
    const service = createDailyReportService(repository, {
      now: () => FIXED_NOW,
    });

    await expect(service.readView()).resolves.toMatchObject({
      enabled: false,
      persistenceAvailable: false,
      cloudExecution: { state: "UNCONFIGURED" },
    });
    await expect(
      service.saveSettings({ ...DEFAULT_DAILY_REPORT_SETTINGS })
    ).rejects.toBeInstanceOf(DailyReportPersistenceUnavailableError);
    await expect(
      service.runManualDryRun("unavailable-run")
    ).rejects.toBeInstanceOf(DailyReportPersistenceUnavailableError);
  });

  it("fails closed when the unconfigured cloud worker is called", async () => {
    await expect(
      unconfiguredDailyReportCloudWorker.enqueue({
        runId: "cloud-unconfigured-test",
        scheduledFor: FIXED_NOW,
        settingsVersion: "synthetic-test",
      })
    ).rejects.toBeInstanceOf(DailyReportCloudWorkerUnavailableError);
    expect(unconfiguredDailyReportCloudWorker.boundary).toMatchObject({
      state: "UNCONFIGURED",
      scheduleActive: false,
      deliveryActive: false,
    });
  });
});
