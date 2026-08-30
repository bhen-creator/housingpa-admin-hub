import type {
  DailyReportRunRecord,
  DailyReportSettingsInput,
} from "@shared/dailyReport";
import {
  DAILY_REPORT_SETTINGS_ID,
  DEFAULT_DAILY_REPORT_SETTINGS,
} from "@shared/dailyReport";
import { and, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  dailyReportRuns,
  dailyReportSettings,
  InsertInternalTool,
  internalTools,
} from "../drizzle/schema";
import type {
  DailyReportRunClaim,
  DailyReportRunSeed,
  DailyReportRunTransition,
} from "./dailyReportWorker";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  const databaseUrl =
    process.env.DAILY_REPORT_QUEUE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!_db && databaseUrl) {
    try {
      _db = drizzle(databaseUrl);
    } catch {
      console.warn("[Database] Failed to initialize the connection.");
      _db = null;
    }
  }
  return _db;
}

export async function listInternalTools() {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(internalTools);
}

export async function upsertInternalTool(tool: InsertInternalTool) {
  const db = await getDb();
  if (!db) {
    throw new Error(
      "The tool directory is unavailable. Please try again shortly."
    );
  }

  await db
    .insert(internalTools)
    .values(tool)
    .onDuplicateKeyUpdate({
      set: {
        name: tool.name,
        description: tool.description,
        destinationUrl: tool.destinationUrl,
        category: tool.category,
        sortOrder: tool.sortOrder,
        isActive: tool.isActive,
        operationalState: tool.operationalState,
        verificationEvidence: tool.verificationEvidence,
        verifiedAt: tool.verifiedAt,
        blockedReason: tool.blockedReason,
      },
    });
}

export async function readDailyReportSettings() {
  const db = await getDb();
  if (!db) return undefined;

  const rows = await db
    .select()
    .from(dailyReportSettings)
    .where(eq(dailyReportSettings.id, DAILY_REPORT_SETTINGS_ID))
    .limit(1);
  return rows[0] ?? null;
}

export async function saveDailyReportSettings(
  settings: DailyReportSettingsInput
) {
  const db = await getDb();
  if (!db) {
    throw new Error(
      "Report settings are unavailable. Please try again after database configuration is complete."
    );
  }

  await db
    .insert(dailyReportSettings)
    .values({ id: DAILY_REPORT_SETTINGS_ID, ...settings })
    .onDuplicateKeyUpdate({
      set: {
        enabled: settings.enabled,
        scheduleTime: settings.scheduleTime,
        timezone: settings.timezone,
        recipient: settings.recipient,
      },
    });

  const saved = await readDailyReportSettings();
  if (!saved) throw new Error("Saved report settings could not be reloaded.");
  return saved;
}

export async function readDailyReportRun(runId: string) {
  const db = await getDb();
  if (!db) return undefined;

  const rows = await db
    .select()
    .from(dailyReportRuns)
    .where(eq(dailyReportRuns.runId, runId))
    .limit(1);
  return rows[0] ?? null;
}

export async function recordDailyReportRun(run: DailyReportRunRecord) {
  const db = await getDb();
  if (!db) {
    throw new Error(
      "Report runs are unavailable. Please try again after database configuration is complete."
    );
  }

  return db.transaction(async transaction => {
    await transaction
      .insert(dailyReportSettings)
      .values({
        id: DAILY_REPORT_SETTINGS_ID,
        ...DEFAULT_DAILY_REPORT_SETTINGS,
      })
      .onDuplicateKeyUpdate({
        set: { id: DAILY_REPORT_SETTINGS_ID },
      });
    await transaction
      .insert(dailyReportRuns)
      .values(run)
      .onDuplicateKeyUpdate({ set: { runId: run.runId } });

    const insertedRows = await transaction
      .select()
      .from(dailyReportRuns)
      .where(eq(dailyReportRuns.runId, run.runId))
      .limit(1);
    if (!insertedRows[0]) {
      throw new Error("The report run could not be verified after insertion.");
    }
    const recorded = insertedRows[0];
    await transaction
      .update(dailyReportSettings)
      .set({
        lastRunAt: recorded.completedAt ?? recorded.startedAt,
        latestDeliveryStatus: recorded.status,
        latestError: recorded.error,
      })
      .where(eq(dailyReportSettings.id, DAILY_REPORT_SETTINGS_ID));
    return recorded;
  });
}

async function requireDailyReportDb() {
  const db = await getDb();
  if (!db) {
    throw new Error(
      "The daily report worker database is unavailable. No report was sent."
    );
  }
  return db;
}

type DailyReportDatabaseExecutor = Pick<
  NonNullable<Awaited<ReturnType<typeof getDb>>>,
  "select" | "update"
>;

async function readRunFrom(
  database: DailyReportDatabaseExecutor,
  runId: string
) {
  const rows = await database
    .select()
    .from(dailyReportRuns)
    .where(eq(dailyReportRuns.runId, runId))
    .limit(1);
  if (!rows[0]) throw new Error("The daily report run could not be reloaded.");
  return rows[0];
}

async function updateLatestRunState(
  database: DailyReportDatabaseExecutor,
  run: DailyReportRunRecord
) {
  await database
    .update(dailyReportSettings)
    .set({
      lastRunAt: run.completedAt ?? run.lastAttemptAt ?? run.startedAt,
      latestDeliveryStatus: run.status,
      latestError: run.error,
    })
    .where(eq(dailyReportSettings.id, DAILY_REPORT_SETTINGS_ID));
}

export async function queueDailyReportWorkerRun(seed: DailyReportRunSeed) {
  const db = await requireDailyReportDb();
  await db
    .insert(dailyReportSettings)
    .values({
      id: DAILY_REPORT_SETTINGS_ID,
      ...DEFAULT_DAILY_REPORT_SETTINGS,
    })
    .onDuplicateKeyUpdate({ set: { id: DAILY_REPORT_SETTINGS_ID } });

  await db
    .insert(dailyReportRuns)
    .values({
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
    })
    .onDuplicateKeyUpdate({ set: { runId: seed.runId } });

  const run = await readRunFrom(db, seed.runId);
  return run;
}

export async function claimDailyReportWorkerRun(claim: DailyReportRunClaim) {
  const db = await requireDailyReportDb();
  const [result] = await db
    .update(dailyReportRuns)
    .set({
      status: "RUNNING",
      retryCount: sql`${dailyReportRuns.retryCount} + 1`,
      maxAttempts: claim.maxAttempts,
      lastAttemptAt: claim.now,
      nextAttemptAt: null,
      leaseToken: claim.leaseToken,
      leaseExpiresAt: claim.leaseExpiresAt,
      completedAt: null,
      deliveryResult: "Worker lease acquired.",
      error: null,
      errorClass: null,
    })
    .where(
      and(
        eq(dailyReportRuns.runId, claim.runId),
        lt(dailyReportRuns.retryCount, claim.maxAttempts),
        or(
          eq(dailyReportRuns.status, "QUEUED"),
          and(
            eq(dailyReportRuns.status, "FAILED_RETRYABLE"),
            or(
              isNull(dailyReportRuns.nextAttemptAt),
              lte(dailyReportRuns.nextAttemptAt, claim.now)
            )
          ),
          and(
            eq(dailyReportRuns.status, "RUNNING"),
            or(
              isNull(dailyReportRuns.leaseExpiresAt),
              lte(dailyReportRuns.leaseExpiresAt, claim.now)
            )
          )
        )
      )
    );

  const run = await readRunFrom(db, claim.runId);
  if (result.affectedRows === 1) {
    await updateLatestRunState(db, run);
    return { outcome: "CLAIMED" as const, run };
  }
  if (["DELIVERED", "FAILED", "FAILED_FINAL", "SKIPPED"].includes(run.status)) {
    return { outcome: "TERMINAL" as const, run };
  }
  if (run.status === "RUNNING") {
    return { outcome: "LEASED" as const, run };
  }
  return { outcome: "NOT_DUE" as const, run };
}

export async function transitionDailyReportWorkerRun(
  transition: DailyReportRunTransition
) {
  const db = await requireDailyReportDb();
  const completedAt =
    transition.status === "FAILED_RETRYABLE" ? null : transition.now;
  const [result] = await db
    .update(dailyReportRuns)
    .set({
      status: transition.status,
      completedAt,
      deliveryResult: transition.deliveryResult,
      error: transition.error,
      errorClass: transition.errorClass,
      providerReceipt: transition.providerReceipt,
      nextAttemptAt: transition.nextAttemptAt,
      reportFingerprint: transition.reportFingerprint,
      leaseToken: null,
      leaseExpiresAt: null,
    })
    .where(
      and(
        eq(dailyReportRuns.runId, transition.runId),
        eq(dailyReportRuns.status, "RUNNING"),
        eq(dailyReportRuns.leaseToken, transition.leaseToken)
      )
    );

  const run = await readRunFrom(db, transition.runId);
  if (result.affectedRows !== 1) {
    if (
      run.status === "DELIVERED" &&
      transition.status === "DELIVERED" &&
      run.providerReceipt === transition.providerReceipt
    ) {
      return run;
    }
    throw new Error(
      "The worker lease is stale; no duplicate transition was written."
    );
  }
  await updateLatestRunState(db, run);
  return run;
}

export async function skipDailyReportWorkerRun(
  runId: string,
  now: Date,
  reason: string,
  errorClass: string
) {
  const db = await requireDailyReportDb();
  await db
    .update(dailyReportRuns)
    .set({
      status: "SKIPPED",
      completedAt: now,
      deliveryResult: "No report was sent.",
      error: reason,
      errorClass,
      nextAttemptAt: null,
      leaseToken: null,
      leaseExpiresAt: null,
    })
    .where(
      and(
        eq(dailyReportRuns.runId, runId),
        inArray(dailyReportRuns.status, ["QUEUED", "FAILED_RETRYABLE"])
      )
    );

  const run = await readRunFrom(db, runId);
  await updateLatestRunState(db, run);
  return run;
}
