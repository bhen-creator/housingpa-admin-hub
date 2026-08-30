import { createDailyReportWorkerRuntime } from "./dailyReportWorkerRuntime";

async function main() {
  const runtime = createDailyReportWorkerRuntime();
  const result = await runtime.worker.execute(runtime.invocation);

  // Observability is intentionally limited to non-content run metadata.
  process.stdout.write(
    `${JSON.stringify({
      runId: result.run.runId,
      status: result.run.status,
      scheduledFor: result.run.scheduledFor?.toISOString() ?? null,
      lastAttemptAt: result.run.lastAttemptAt?.toISOString() ?? null,
      completedAt: result.run.completedAt?.toISOString() ?? null,
      errorClass: result.run.errorClass,
      providerReceipt: result.run.providerReceipt,
      retryCount: result.run.retryCount,
      maxAttempts: result.run.maxAttempts,
      replayed: result.replayed,
      deliveryAttempted: result.deliveryAttempted,
    })}\n`,
    () => process.exit(0)
  );
}

main().catch(error => {
  process.stderr.write(
    `${JSON.stringify({
      status: "FAILED_SAFE",
      errorClass: error instanceof Error ? error.name : "WorkerError",
    })}\n`,
    () => process.exit(1)
  );
});
