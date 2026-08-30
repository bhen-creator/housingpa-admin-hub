import {
  boolean,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Historical external identity field retained for schema compatibility. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const internalTools = mysqlTable("internalTools", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 96 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description").notNull(),
  destinationUrl: varchar("destinationUrl", { length: 2048 })
    .notNull()
    .default(""),
  category: mysqlEnum("category", ["featured", "future"])
    .notNull()
    .default("future"),
  sortOrder: int("sortOrder").notNull().default(100),
  isActive: boolean("isActive").notNull().default(true),
  operationalState: mysqlEnum("operationalState", [
    "UNCONFIGURED",
    "CONFIGURED_UNVERIFIED",
    "VERIFIED_USABLE",
    "BLOCKED",
  ])
    .notNull()
    .default("UNCONFIGURED"),
  verificationEvidence: text("verificationEvidence"),
  verifiedAt: timestamp("verifiedAt"),
  blockedReason: text("blockedReason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InternalTool = typeof internalTools.$inferSelect;
export type InsertInternalTool = typeof internalTools.$inferInsert;

export const dailyReportSettings = mysqlTable("dailyReportSettings", {
  id: int("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  scheduleTime: varchar("scheduleTime", { length: 5 })
    .notNull()
    .default("06:00"),
  timezone: varchar("timezone", { length: 64 })
    .notNull()
    .default("America/New_York"),
  recipient: varchar("recipient", { length: 320 }).notNull().default(""),
  lastRunAt: timestamp("lastRunAt"),
  latestDeliveryStatus: mysqlEnum("latestDeliveryStatus", [
    "NEVER_RUN",
    "DRY_RUN_READY",
    "QUEUED",
    "RUNNING",
    "DELIVERED",
    "FAILED",
    "FAILED_RETRYABLE",
    "FAILED_FINAL",
    "SKIPPED",
  ])
    .notNull()
    .default("NEVER_RUN"),
  latestError: text("latestError"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DailyReportSettings = typeof dailyReportSettings.$inferSelect;
export type InsertDailyReportSettings = typeof dailyReportSettings.$inferInsert;

export const dailyReportRuns = mysqlTable("dailyReportRuns", {
  id: int("id").autoincrement().primaryKey(),
  runId: varchar("runId", { length: 64 }).notNull().unique(),
  trigger: mysqlEnum("trigger", ["MANUAL_DRY_RUN", "SCHEDULED"]).notNull(),
  status: mysqlEnum("status", [
    "NEVER_RUN",
    "DRY_RUN_READY",
    "QUEUED",
    "RUNNING",
    "DELIVERED",
    "FAILED",
    "FAILED_RETRYABLE",
    "FAILED_FINAL",
    "SKIPPED",
  ]).notNull(),
  scheduledFor: timestamp("scheduledFor"),
  startedAt: timestamp("startedAt").notNull(),
  completedAt: timestamp("completedAt"),
  deliveryResult: text("deliveryResult"),
  error: text("error"),
  errorClass: varchar("errorClass", { length: 96 }),
  providerReceipt: varchar("providerReceipt", { length: 512 }),
  retryCount: int("retryCount").notNull().default(0),
  maxAttempts: int("maxAttempts").notNull().default(3),
  nextAttemptAt: timestamp("nextAttemptAt"),
  lastAttemptAt: timestamp("lastAttemptAt"),
  reportFingerprint: varchar("reportFingerprint", { length: 64 }),
  leaseToken: varchar("leaseToken", { length: 64 }),
  leaseExpiresAt: timestamp("leaseExpiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DailyReportRun = typeof dailyReportRuns.$inferSelect;
export type InsertDailyReportRun = typeof dailyReportRuns.$inferInsert;
