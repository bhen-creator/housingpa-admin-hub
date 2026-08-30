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

export type DailyReportGenerationRequest = {
  runId: string;
  scheduledFor: Date;
  recipient: string;
};

export type GeneratedDailyReport = {
  subject: string;
  text: string;
  fingerprint: string;
};

export interface DailyReportGenerator {
  readonly name: string;
  readonly configured: boolean;
  generate(
    request: DailyReportGenerationRequest
  ): Promise<GeneratedDailyReport>;
}

export type DailyReportDeliveryRequest = {
  runId: string;
  idempotencyKey: string;
  recipient: string;
  report: GeneratedDailyReport;
};

export type DailyReportDeliveryReceipt = {
  providerReceipt: string;
  acceptedAt: Date;
};

export interface DailyReportDeliveryAdapter {
  readonly name: string;
  readonly configured: boolean;
  readonly supportsIdempotency: boolean;
  deliver(
    request: DailyReportDeliveryRequest
  ): Promise<DailyReportDeliveryReceipt>;
}

export class DailyReportGeneratorUnavailableError extends Error {
  readonly retryable = false;

  constructor() {
    super("Daily report generation is not configured. No report was sent.");
    this.name = "DailyReportGeneratorUnavailableError";
  }
}

export class DailyReportDeliveryUnavailableError extends Error {
  readonly retryable = false;

  constructor() {
    super("Daily report delivery is not configured. No report was sent.");
    this.name = "DailyReportDeliveryUnavailableError";
  }
}

export const unconfiguredDailyReportGenerator: DailyReportGenerator = {
  name: "unconfigured",
  configured: false,
  async generate() {
    throw new DailyReportGeneratorUnavailableError();
  },
};

export const unconfiguredDailyReportDeliveryAdapter: DailyReportDeliveryAdapter =
  {
    name: "unconfigured",
    configured: false,
    supportsIdempotency: false,
    async deliver() {
      throw new DailyReportDeliveryUnavailableError();
    },
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
