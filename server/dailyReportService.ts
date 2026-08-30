import {
  DAILY_REPORT_SETTINGS_ID,
  DEFAULT_DAILY_REPORT_SETTINGS,
  nextDailyReportRun,
  type DailyReportCloudBoundary,
  type DailyReportRunRecord,
  type DailyReportSettingsInput,
  type DailyReportSettingsRecord,
} from "@shared/dailyReport";
import { randomUUID } from "node:crypto";
import { unconfiguredDailyReportCloudWorker } from "./dailyReportCloud";

export type DailyReportSettingsRead =
  | DailyReportSettingsRecord
  | null
  | undefined;

export interface DailyReportRepository {
  readSettings(): Promise<DailyReportSettingsRead>;
  saveSettings(
    settings: DailyReportSettingsInput
  ): Promise<DailyReportSettingsRecord>;
  readRun(runId: string): Promise<DailyReportRunRecord | null | undefined>;
  recordRun(run: DailyReportRunRecord): Promise<DailyReportRunRecord>;
}

export type DailyReportSettingsView = DailyReportSettingsRecord & {
  nextRunAt: Date | null;
  persistenceAvailable: boolean;
  cloudExecution: DailyReportCloudBoundary;
};

export class DailyReportPersistenceUnavailableError extends Error {
  constructor() {
    super(
      "Report settings are unavailable until DATABASE_URL is configured and the checked-in migration is applied."
    );
    this.name = "DailyReportPersistenceUnavailableError";
  }
}

function defaultSettings(): DailyReportSettingsRecord {
  return {
    id: DAILY_REPORT_SETTINGS_ID,
    ...DEFAULT_DAILY_REPORT_SETTINGS,
    lastRunAt: null,
    latestDeliveryStatus: "NEVER_RUN",
    latestError: null,
  };
}

export function createDailyReportService(
  repository: DailyReportRepository,
  options: {
    cloudBoundary?: DailyReportCloudBoundary;
    now?: () => Date;
    createRunId?: () => string;
  } = {}
) {
  const cloudBoundary =
    options.cloudBoundary ?? unconfiguredDailyReportCloudWorker.boundary;
  const now = options.now ?? (() => new Date());
  const createRunId = options.createRunId ?? (() => randomUUID());

  async function readView(): Promise<DailyReportSettingsView> {
    const stored = await repository.readSettings();
    const persistenceAvailable = stored !== undefined;
    const settings = stored ?? defaultSettings();

    return {
      ...settings,
      nextRunAt: nextDailyReportRun(settings, now()),
      persistenceAvailable,
      cloudExecution: cloudBoundary,
    };
  }

  return {
    readView,

    async saveSettings(input: DailyReportSettingsInput) {
      const current = await repository.readSettings();
      if (current === undefined) {
        throw new DailyReportPersistenceUnavailableError();
      }

      const saved = await repository.saveSettings({
        ...input,
        scheduleTime: input.scheduleTime.trim(),
        timezone: input.timezone.trim(),
        recipient: input.recipient.trim().toLowerCase(),
      });

      return {
        ...saved,
        nextRunAt: nextDailyReportRun(saved, now()),
        persistenceAvailable: true,
        cloudExecution: cloudBoundary,
      } satisfies DailyReportSettingsView;
    },

    async runManualDryRun(runId = createRunId()) {
      const existing = await repository.readRun(runId);
      if (existing === undefined) {
        throw new DailyReportPersistenceUnavailableError();
      }
      if (existing) {
        return { run: existing, settings: await readView(), replayed: true };
      }

      const settings = await repository.readSettings();
      if (settings === undefined) {
        throw new DailyReportPersistenceUnavailableError();
      }

      const effectiveSettings = settings ?? defaultSettings();
      const startedAt = now();
      const blocker = !effectiveSettings.enabled
        ? "The daily report is disabled."
        : !effectiveSettings.recipient
          ? "A recipient is required before a report test can be prepared."
          : null;
      const status = blocker ? "SKIPPED" : "DRY_RUN_READY";
      const run: DailyReportRunRecord = {
        runId,
        trigger: "MANUAL_DRY_RUN",
        status,
        scheduledFor: null,
        startedAt,
        completedAt: startedAt,
        deliveryResult: blocker
          ? "No email was sent."
          : "Settings and the provider-neutral run contract validated. No email was sent.",
        error: blocker,
      };

      const recorded = await repository.recordRun(run);
      return { run: recorded, settings: await readView(), replayed: false };
    },
  };
}
