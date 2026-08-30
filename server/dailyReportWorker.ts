import type {
  DailyReportCloudRunStatus,
  DailyReportRunRecord,
} from "@shared/dailyReport";
import { randomUUID } from "node:crypto";
import type {
  DailyReportDeliveryAdapter,
  DailyReportGenerator,
} from "./dailyReportCloud";
import type { DailyReportWorkerRuntimeConfig } from "./dailyReportWorkerConfig";

export type DailyReportRunRequest = {
  runId: string;
  scheduledFor: Date;
};

export type DailyReportRunSeed = DailyReportRunRequest & {
  maxAttempts: number;
  now: Date;
};

export type DailyReportRunClaim = {
  runId: string;
  leaseToken: string;
  leaseExpiresAt: Date;
  now: Date;
  maxAttempts: number;
};

export type DailyReportClaimResult = {
  outcome: "CLAIMED" | "TERMINAL" | "NOT_DUE" | "LEASED";
  run: DailyReportRunRecord;
};

export type DailyReportRunTransition = {
  runId: string;
  leaseToken: string;
  status: Extract<
    DailyReportCloudRunStatus,
    "DELIVERED" | "FAILED_RETRYABLE" | "FAILED_FINAL"
  >;
  now: Date;
  deliveryResult: string;
  error: string | null;
  errorClass: string | null;
  providerReceipt: string | null;
  nextAttemptAt: Date | null;
  reportFingerprint: string | null;
};

export interface DailyReportWorkerRepository {
  queueRun(seed: DailyReportRunSeed): Promise<DailyReportRunRecord>;
  claimRun(claim: DailyReportRunClaim): Promise<DailyReportClaimResult>;
  transitionRun(
    transition: DailyReportRunTransition
  ): Promise<DailyReportRunRecord>;
  skipRun(
    runId: string,
    now: Date,
    reason: string,
    errorClass: string
  ): Promise<DailyReportRunRecord>;
}

export type DailyReportWorkerResult = {
  run: DailyReportRunRecord;
  replayed: boolean;
  deliveryAttempted: boolean;
};

export class DailyReportWorkerInvariantError extends Error {
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = "DailyReportWorkerInvariantError";
  }
}

function safeErrorClass(error: unknown) {
  if (error instanceof Error && /^[A-Za-z0-9_.-]{1,96}$/.test(error.name)) {
    return error.name;
  }
  return "DailyReportWorkerError";
}

function safeErrorMessage(error: unknown) {
  return `Daily report execution failed (${safeErrorClass(error)}). No delivery was confirmed.`;
}

function isRetryable(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "retryable" in error &&
      error.retryable === true
  );
}

function backoffDate(now: Date, baseSeconds: number, retryCount: number) {
  const multiplier = Math.min(2 ** Math.max(retryCount - 1, 0), 64);
  return new Date(now.getTime() + baseSeconds * multiplier * 1_000);
}

function terminal(status: DailyReportRunRecord["status"]) {
  return ["DELIVERED", "FAILED", "FAILED_FINAL", "SKIPPED"].includes(status);
}

export function createDailyReportWorker(options: {
  repository: DailyReportWorkerRepository;
  generator: DailyReportGenerator;
  deliveryAdapter: DailyReportDeliveryAdapter;
  config: DailyReportWorkerRuntimeConfig;
  now?: () => Date;
  createLeaseToken?: () => string;
}) {
  const now = options.now ?? (() => new Date());
  const createLeaseToken = options.createLeaseToken ?? (() => randomUUID());

  async function failWithoutDelivery(
    run: DailyReportRunRecord,
    leaseToken: string,
    error: unknown,
    reportFingerprint: string | null,
    deliveryAttempted: boolean
  ): Promise<DailyReportWorkerResult> {
    const failureTime = now();
    const retryable = isRetryable(error);
    const exhausted = run.retryCount >= run.maxAttempts;
    const status =
      retryable && !exhausted ? "FAILED_RETRYABLE" : "FAILED_FINAL";
    const failed = await options.repository.transitionRun({
      runId: run.runId,
      leaseToken,
      status,
      now: failureTime,
      deliveryResult: "No report delivery was confirmed.",
      error: safeErrorMessage(error),
      errorClass: safeErrorClass(error),
      providerReceipt: null,
      nextAttemptAt:
        status === "FAILED_RETRYABLE"
          ? backoffDate(
              failureTime,
              options.config.backoffSeconds,
              run.retryCount
            )
          : null,
      reportFingerprint,
    });

    return { run: failed, replayed: false, deliveryAttempted };
  }

  return {
    async execute(
      request: DailyReportRunRequest
    ): Promise<DailyReportWorkerResult> {
      if (!/^[A-Za-z0-9._:-]{1,64}$/.test(request.runId)) {
        throw new DailyReportWorkerInvariantError(
          "The daily report run ID must be a safe 1 to 64 character identifier."
        );
      }
      if (Number.isNaN(request.scheduledFor.getTime())) {
        throw new DailyReportWorkerInvariantError(
          "The daily report scheduled timestamp is invalid."
        );
      }

      const queued = await options.repository.queueRun({
        ...request,
        maxAttempts: options.config.maxAttempts,
        now: now(),
      });

      if (terminal(queued.status)) {
        return { run: queued, replayed: true, deliveryAttempted: false };
      }

      if (!options.config.enabled) {
        const skipped = await options.repository.skipRun(
          request.runId,
          now(),
          "The cloud worker is disabled. No report was sent.",
          "WORKER_DISABLED"
        );
        return { run: skipped, replayed: false, deliveryAttempted: false };
      }

      const leaseToken = createLeaseToken();
      const claimTime = now();
      const claimed = await options.repository.claimRun({
        runId: request.runId,
        leaseToken,
        leaseExpiresAt: new Date(
          claimTime.getTime() + options.config.leaseSeconds * 1_000
        ),
        now: claimTime,
        maxAttempts: queued.maxAttempts,
      });

      if (claimed.outcome !== "CLAIMED") {
        return {
          run: claimed.run,
          replayed: claimed.outcome === "TERMINAL",
          deliveryAttempted: false,
        };
      }

      const run = claimed.run;
      if (!options.config.recipient) {
        return failWithoutDelivery(
          run,
          leaseToken,
          new DailyReportWorkerInvariantError(
            "The report recipient is not configured."
          ),
          null,
          false
        );
      }
      if (!options.generator.configured) {
        return failWithoutDelivery(
          run,
          leaseToken,
          new DailyReportWorkerInvariantError(
            "The report generator is not configured."
          ),
          null,
          false
        );
      }
      if (
        !options.deliveryAdapter.configured ||
        !options.deliveryAdapter.supportsIdempotency ||
        options.config.providerAdapter !== options.deliveryAdapter.name
      ) {
        return failWithoutDelivery(
          run,
          leaseToken,
          new DailyReportWorkerInvariantError(
            "The selected delivery adapter must be configured, idempotent, and match the worker configuration."
          ),
          null,
          false
        );
      }

      let reportFingerprint: string | null = null;
      let deliveryAttempted = false;
      try {
        const report = await options.generator.generate({
          runId: request.runId,
          scheduledFor: request.scheduledFor,
          recipient: options.config.recipient,
        });
        reportFingerprint = report.fingerprint;
        if (!/^[a-f0-9]{64}$/.test(reportFingerprint)) {
          throw new DailyReportWorkerInvariantError(
            "The report generator must return a SHA-256 fingerprint."
          );
        }
        if (
          run.reportFingerprint &&
          run.reportFingerprint !== reportFingerprint
        ) {
          throw new DailyReportWorkerInvariantError(
            "The regenerated report fingerprint changed for the same run ID."
          );
        }

        deliveryAttempted = true;
        const receipt = await options.deliveryAdapter.deliver({
          runId: request.runId,
          idempotencyKey: request.runId,
          recipient: options.config.recipient,
          report,
        });
        const providerReceipt = receipt.providerReceipt.trim();
        if (!/^[A-Za-z0-9._:-]{1,512}$/.test(providerReceipt)) {
          throw new DailyReportWorkerInvariantError(
            "The delivery provider did not return a safe receipt identifier."
          );
        }

        const delivered = await options.repository.transitionRun({
          runId: request.runId,
          leaseToken,
          status: "DELIVERED",
          now: now(),
          deliveryResult: "Delivery confirmed by the configured provider.",
          error: null,
          errorClass: null,
          providerReceipt,
          nextAttemptAt: null,
          reportFingerprint,
        });
        return { run: delivered, replayed: false, deliveryAttempted: true };
      } catch (error) {
        return failWithoutDelivery(
          run,
          leaseToken,
          error,
          reportFingerprint,
          deliveryAttempted
        );
      }
    },
  };
}
