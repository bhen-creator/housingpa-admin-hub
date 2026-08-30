import type {
  DailyReportRunRecord,
  DailyReportSettingsInput,
} from "@shared/dailyReport";
import {
  DAILY_REPORT_SETTINGS_ID,
  DEFAULT_DAILY_REPORT_SETTINGS,
} from "@shared/dailyReport";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  dailyReportRuns,
  dailyReportSettings,
  InsertInternalTool,
  internalTools,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
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
