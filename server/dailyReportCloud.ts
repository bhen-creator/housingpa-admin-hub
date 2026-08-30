import type { DailyReportCloudBoundary } from "@shared/dailyReport";

export type DailyReportCloudRunRequest = {
  runId: string;
  scheduledFor: Date;
  settingsVersion: string;
};

export type DailyReportCloudRunResult = {
  runId: string;
  accepted: boolean;
  providerReference: string | null;
};

export interface DailyReportCloudWorker {
  readonly boundary: DailyReportCloudBoundary;
  enqueue(
    request: DailyReportCloudRunRequest
  ): Promise<DailyReportCloudRunResult>;
}

export class DailyReportCloudWorkerUnavailableError extends Error {
  constructor() {
    super(
      "Cloud scheduling and delivery are not configured. No report was queued or sent."
    );
    this.name = "DailyReportCloudWorkerUnavailableError";
  }
}

export const unconfiguredDailyReportCloudWorker: DailyReportCloudWorker = {
  boundary: {
    state: "UNCONFIGURED",
    scheduleActive: false,
    deliveryActive: false,
    detail:
      "No cloud scheduler, durable worker, delivery adapter, or verified provider configuration is present in this source package.",
  },
  async enqueue() {
    throw new DailyReportCloudWorkerUnavailableError();
  },
};
