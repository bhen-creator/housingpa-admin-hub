import { drizzle } from "drizzle-orm/mysql2";
import { InsertInternalTool, internalTools } from "../drizzle/schema";

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
