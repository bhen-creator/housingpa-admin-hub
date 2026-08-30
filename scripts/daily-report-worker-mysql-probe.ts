import type {
  DailyReportDeliveryAdapter,
  DailyReportGenerator,
} from "../server/dailyReportCloud";
import { createHash } from "node:crypto";
import {
  claimDailyReportWorkerRun,
  queueDailyReportWorkerRun,
  skipDailyReportWorkerRun,
  transitionDailyReportWorkerRun,
} from "../server/db";
import { createDailyReportWorker } from "../server/dailyReportWorker";

class SyntheticRetryableProviderError extends Error {
  readonly retryable = true;

  constructor() {
    super("Synthetic provider failure.");
    this.name = "SyntheticRetryableProviderError";
  }
}

async function main() {
  const mode = process.argv[2];
  const runId = process.env.SYNTHETIC_DAILY_REPORT_RUN_ID;
  if (!mode || !runId) {
    throw new Error(
      "A probe mode and SYNTHETIC_DAILY_REPORT_RUN_ID are required."
    );
  }

  let deliveryCalls = 0;
  let generationCalls = 0;
  const generator: DailyReportGenerator = {
    name: "synthetic",
    configured: true,
    async generate(request) {
      generationCalls += 1;
      return {
        subject: "Synthetic report",
        text: "Synthetic non-private validation content.",
        fingerprint: createHash("sha256").update(request.runId).digest("hex"),
      };
    },
  };
  const adapter: DailyReportDeliveryAdapter = {
    name: mode === "unconfigured" ? "unconfigured" : "synthetic",
    configured: mode !== "unconfigured",
    supportsIdempotency: mode !== "unconfigured",
    async deliver(request) {
      deliveryCalls += 1;
      if (mode === "retry-first") {
        throw new SyntheticRetryableProviderError();
      }
      return {
        providerReceipt: `synthetic-receipt-${request.idempotencyKey}`,
        acceptedAt: new Date("2026-08-30T10:00:00Z"),
      };
    },
  };
  const clock =
    mode === "retry-second"
      ? new Date("2026-08-30T10:00:02Z")
      : new Date("2026-08-30T10:00:00Z");
  const worker = createDailyReportWorker({
    repository: {
      queueRun: queueDailyReportWorkerRun,
      claimRun: claimDailyReportWorkerRun,
      transitionRun: transitionDailyReportWorkerRun,
      skipRun: skipDailyReportWorkerRun,
    },
    generator,
    deliveryAdapter: adapter,
    config: {
      enabled: mode !== "disabled",
      schedule: "06:00",
      timezone: "America/New_York",
      recipient: "synthetic@example.invalid",
      providerAdapter: adapter.name,
      maxAttempts: 3,
      backoffSeconds: 1,
      leaseSeconds: 1,
      queueDatabaseConfigured: true,
    },
    now: () => clock,
    createLeaseToken: () => `lease-${mode}`,
  });

  const result = await worker.execute({
    runId,
    scheduledFor: new Date("2026-08-30T10:00:00Z"),
  });
  process.stdout.write(
    `${JSON.stringify({
      mode,
      runId: result.run.runId,
      status: result.run.status,
      retryCount: result.run.retryCount,
      providerReceipt: result.run.providerReceipt,
      errorClass: result.run.errorClass,
      replayed: result.replayed,
      generationCalls,
      deliveryCalls,
    })}\n`,
    () => process.exit(0)
  );
}

main().catch(error => {
  process.stderr.write(
    `${JSON.stringify({
      status: "PROBE_FAILED",
      errorClass: error instanceof Error ? error.name : "ProbeError",
    })}\n`,
    () => process.exit(1)
  );
});
