import type { DailyReportRunRecord } from "@shared/dailyReport";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  DailyReportDeliveryAdapter,
  DailyReportGenerator,
} from "./dailyReportCloud";
import {
  createDailyReportWorker,
  type DailyReportRunClaim,
  type DailyReportRunSeed,
  type DailyReportRunTransition,
  type DailyReportWorkerRepository,
} from "./dailyReportWorker";
import type { DailyReportWorkerRuntimeConfig } from "./dailyReportWorkerConfig";

class MemoryWorkerRepository implements DailyReportWorkerRepository {
  runs = new Map<string, DailyReportRunRecord>();

  async queueRun(seed: DailyReportRunSeed) {
    const existing = this.runs.get(seed.runId);
    if (existing) return existing;
    const run: DailyReportRunRecord = {
      runId: seed.runId,
      trigger: "SCHEDULED",
      status: "QUEUED",
      scheduledFor: seed.scheduledFor,
      startedAt: seed.now,
      completedAt: null,
      deliveryResult: "Queued for provider-neutral cloud-worker execution.",
      error: null,
      errorClass: null,
      providerReceipt: null,
      retryCount: 0,
      maxAttempts: seed.maxAttempts,
      nextAttemptAt: null,
      lastAttemptAt: null,
      reportFingerprint: null,
      leaseToken: null,
      leaseExpiresAt: null,
    };
    this.runs.set(seed.runId, run);
    return run;
  }

  async claimRun(claim: DailyReportRunClaim) {
    const run = this.runs.get(claim.runId)!;
    if (
      ["DELIVERED", "FAILED", "FAILED_FINAL", "SKIPPED"].includes(run.status)
    ) {
      return { outcome: "TERMINAL" as const, run };
    }
    if (
      run.status === "FAILED_RETRYABLE" &&
      run.nextAttemptAt &&
      run.nextAttemptAt > claim.now
    ) {
      return { outcome: "NOT_DUE" as const, run };
    }
    if (
      run.status === "RUNNING" &&
      run.leaseExpiresAt &&
      run.leaseExpiresAt > claim.now
    ) {
      return { outcome: "LEASED" as const, run };
    }
    if (run.retryCount >= claim.maxAttempts) {
      return { outcome: "NOT_DUE" as const, run };
    }
    const claimed: DailyReportRunRecord = {
      ...run,
      status: "RUNNING",
      retryCount: run.retryCount + 1,
      maxAttempts: claim.maxAttempts,
      lastAttemptAt: claim.now,
      nextAttemptAt: null,
      leaseToken: claim.leaseToken,
      leaseExpiresAt: claim.leaseExpiresAt,
      completedAt: null,
      error: null,
      errorClass: null,
    };
    this.runs.set(run.runId, claimed);
    return { outcome: "CLAIMED" as const, run: claimed };
  }

  async transitionRun(transition: DailyReportRunTransition) {
    const run = this.runs.get(transition.runId)!;
    if (run.status !== "RUNNING" || run.leaseToken !== transition.leaseToken) {
      if (
        run.status === "DELIVERED" &&
        transition.status === "DELIVERED" &&
        run.providerReceipt === transition.providerReceipt
      ) {
        return run;
      }
      throw new Error("stale lease");
    }
    const updated: DailyReportRunRecord = {
      ...run,
      status: transition.status,
      completedAt:
        transition.status === "FAILED_RETRYABLE" ? null : transition.now,
      deliveryResult: transition.deliveryResult,
      error: transition.error,
      errorClass: transition.errorClass,
      providerReceipt: transition.providerReceipt,
      nextAttemptAt: transition.nextAttemptAt,
      reportFingerprint: transition.reportFingerprint,
      leaseToken: null,
      leaseExpiresAt: null,
    };
    this.runs.set(run.runId, updated);
    return updated;
  }

  async skipRun(runId: string, now: Date, reason: string, errorClass: string) {
    const run = this.runs.get(runId)!;
    const skipped: DailyReportRunRecord = {
      ...run,
      status: "SKIPPED",
      completedAt: now,
      deliveryResult: "No report was sent.",
      error: reason,
      errorClass,
      leaseToken: null,
      leaseExpiresAt: null,
    };
    this.runs.set(runId, skipped);
    return skipped;
  }
}

class RetryableProviderError extends Error {
  readonly retryable = true;

  constructor() {
    super("Synthetic provider failure.");
    this.name = "RetryableProviderError";
  }
}

function configuredGenerator(): DailyReportGenerator {
  return {
    name: "synthetic",
    configured: true,
    async generate(request) {
      return {
        subject: "Synthetic report",
        text: `Synthetic content for ${request.runId}`,
        fingerprint: createHash("sha256").update(request.runId).digest("hex"),
      };
    },
  };
}

function configuredAdapter(options: { failFirst?: boolean } = {}) {
  const calls: string[] = [];
  const receipts = new Map<string, string>();
  let failuresRemaining = options.failFirst ? 1 : 0;
  const adapter: DailyReportDeliveryAdapter = {
    name: "synthetic",
    configured: true,
    supportsIdempotency: true,
    async deliver(request) {
      calls.push(request.idempotencyKey);
      if (failuresRemaining > 0) {
        failuresRemaining -= 1;
        throw new RetryableProviderError();
      }
      const providerReceipt =
        receipts.get(request.idempotencyKey) ??
        `receipt-${request.idempotencyKey}`;
      receipts.set(request.idempotencyKey, providerReceipt);
      return {
        providerReceipt,
        acceptedAt: new Date("2026-08-30T10:00:00Z"),
      };
    },
  };
  return { adapter, calls, receipts };
}

function workerConfig(
  overrides: Partial<DailyReportWorkerRuntimeConfig> = {}
): DailyReportWorkerRuntimeConfig {
  return {
    enabled: true,
    schedule: "06:00",
    timezone: "America/New_York",
    recipient: "reports@example.com",
    providerAdapter: "synthetic",
    maxAttempts: 3,
    backoffSeconds: 60,
    leaseSeconds: 120,
    queueDatabaseConfigured: true,
    ...overrides,
  };
}

const REQUEST = {
  runId: "daily-report-2026-08-30",
  scheduledFor: new Date("2026-08-30T10:00:00Z"),
};

describe("daily report cloud worker", () => {
  it("delivers one logical run once and replays without duplicate delivery", async () => {
    const repository = new MemoryWorkerRepository();
    const provider = configuredAdapter();
    const worker = createDailyReportWorker({
      repository,
      generator: configuredGenerator(),
      deliveryAdapter: provider.adapter,
      config: workerConfig(),
      now: () => new Date("2026-08-30T10:00:00Z"),
      createLeaseToken: () => "lease-1",
    });

    const first = await worker.execute(REQUEST);
    const replay = await worker.execute(REQUEST);

    expect(first.run).toMatchObject({
      status: "DELIVERED",
      retryCount: 1,
      providerReceipt: `receipt-${REQUEST.runId}`,
    });
    expect(replay.replayed).toBe(true);
    expect(repository.runs.size).toBe(1);
    expect(provider.calls).toEqual([REQUEST.runId]);
  });

  it("retries the same run ID after backoff and preserves one row", async () => {
    const repository = new MemoryWorkerRepository();
    const provider = configuredAdapter({ failFirst: true });
    let clock = new Date("2026-08-30T10:00:00Z");
    let lease = 0;
    const createWorker = () =>
      createDailyReportWorker({
        repository,
        generator: configuredGenerator(),
        deliveryAdapter: provider.adapter,
        config: workerConfig(),
        now: () => clock,
        createLeaseToken: () => `lease-${++lease}`,
      });

    const failed = await createWorker().execute(REQUEST);
    expect(failed.run).toMatchObject({
      status: "FAILED_RETRYABLE",
      retryCount: 1,
      errorClass: "RetryableProviderError",
    });

    const tooSoon = await createWorker().execute(REQUEST);
    expect(tooSoon.run.status).toBe("FAILED_RETRYABLE");
    expect(tooSoon.deliveryAttempted).toBe(false);

    clock = new Date("2026-08-30T10:01:01Z");
    const delivered = await createWorker().execute(REQUEST);
    expect(delivered.run).toMatchObject({
      status: "DELIVERED",
      retryCount: 2,
      reportFingerprint: createHash("sha256")
        .update(REQUEST.runId)
        .digest("hex"),
    });
    expect(repository.runs.size).toBe(1);
    expect(provider.calls).toEqual([REQUEST.runId, REQUEST.runId]);
    expect(provider.receipts.size).toBe(1);
  });

  it("preserves delivered state across worker re-instantiation", async () => {
    const repository = new MemoryWorkerRepository();
    const provider = configuredAdapter();
    const options = {
      repository,
      generator: configuredGenerator(),
      deliveryAdapter: provider.adapter,
      config: workerConfig(),
      now: () => new Date("2026-08-30T10:00:00Z"),
      createLeaseToken: () => "restart-lease",
    };

    await createDailyReportWorker(options).execute(REQUEST);
    const restarted = await createDailyReportWorker(options).execute(REQUEST);

    expect(restarted.run.status).toBe("DELIVERED");
    expect(restarted.replayed).toBe(true);
    expect(provider.calls).toHaveLength(1);
  });

  it("allows only one active lease for concurrent replay attempts", async () => {
    const repository = new MemoryWorkerRepository();
    const provider = configuredAdapter();
    let lease = 0;
    const worker = createDailyReportWorker({
      repository,
      generator: configuredGenerator(),
      deliveryAdapter: provider.adapter,
      config: workerConfig(),
      now: () => new Date("2026-08-30T10:00:00Z"),
      createLeaseToken: () => `concurrent-lease-${++lease}`,
    });

    const results = await Promise.all([
      worker.execute(REQUEST),
      worker.execute(REQUEST),
    ]);

    expect(repository.runs.size).toBe(1);
    expect(provider.calls).toEqual([REQUEST.runId]);
    expect(results.some(result => result.run.status === "DELIVERED")).toBe(
      true
    );
  });

  it("moves a retryable provider failure to FAILED_FINAL at the limit", async () => {
    const repository = new MemoryWorkerRepository();
    const provider = configuredAdapter({ failFirst: true });
    const worker = createDailyReportWorker({
      repository,
      generator: configuredGenerator(),
      deliveryAdapter: provider.adapter,
      config: workerConfig({ maxAttempts: 1 }),
      now: () => new Date("2026-08-30T10:00:00Z"),
      createLeaseToken: () => "final-failure-lease",
    });

    const result = await worker.execute({
      ...REQUEST,
      runId: "daily-report-final-failure",
    });

    expect(result.run).toMatchObject({
      status: "FAILED_FINAL",
      retryCount: 1,
      errorClass: "RetryableProviderError",
      nextAttemptAt: null,
    });
  });

  it("records SKIPPED while disabled and never calls generation or delivery", async () => {
    const repository = new MemoryWorkerRepository();
    const provider = configuredAdapter();
    let generated = 0;
    const generator = configuredGenerator();
    const originalGenerate = generator.generate;
    generator.generate = async request => {
      generated += 1;
      return originalGenerate(request);
    };
    const worker = createDailyReportWorker({
      repository,
      generator,
      deliveryAdapter: provider.adapter,
      config: workerConfig({ enabled: false }),
    });

    const result = await worker.execute(REQUEST);

    expect(result.run).toMatchObject({
      status: "SKIPPED",
      errorClass: "WORKER_DISABLED",
    });
    expect(generated).toBe(0);
    expect(provider.calls).toHaveLength(0);
  });

  it("fails closed when the provider is unconfigured", async () => {
    const repository = new MemoryWorkerRepository();
    let deliveryCalls = 0;
    const worker = createDailyReportWorker({
      repository,
      generator: configuredGenerator(),
      deliveryAdapter: {
        name: "unconfigured",
        configured: false,
        supportsIdempotency: false,
        async deliver() {
          deliveryCalls += 1;
          throw new Error("must not run");
        },
      },
      config: workerConfig({ providerAdapter: "unconfigured" }),
      now: () => new Date("2026-08-30T10:00:00Z"),
      createLeaseToken: () => "provider-gate-lease",
    });

    const result = await worker.execute(REQUEST);

    expect(result.run).toMatchObject({
      status: "FAILED_FINAL",
      retryCount: 1,
      errorClass: "DailyReportWorkerInvariantError",
    });
    expect(result.deliveryAttempted).toBe(false);
    expect(deliveryCalls).toBe(0);
  });
});
