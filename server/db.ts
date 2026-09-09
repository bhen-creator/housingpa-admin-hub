import crypto from 'node:crypto';
import {DatabaseSync, type StatementSync} from 'node:sqlite';
import {env} from './env';
import type {Association, Meeting, MeetingSummaryRow} from '../shared/types';

export const db = new DatabaseSync(env.dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

/** node:sqlite only binds null/number/bigint/string/Uint8Array. */
type Bindable = null | number | bigint | string | Uint8Array;
const nn = (v: string | undefined | null): string | null => (v === undefined || v === null || v === '' ? null : v);
const flag = (v: boolean | undefined): number => (v ? 1 : 0);

const cache = new Map<string, StatementSync>();
function q(sql: string): StatementSync {
  let s = cache.get(sql);
  if (!s) {
    s = db.prepare(sql);
    cache.set(sql, s);
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* schema                                                              */
/* ------------------------------------------------------------------ */

db.exec(`
CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS access_codes (
  id           TEXT PRIMARY KEY,
  label        TEXT NOT NULL,
  code_hash    TEXT NOT NULL,
  code_salt    TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'manager',
  disabled     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  code_id    TEXT NOT NULL REFERENCES access_codes(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS associations (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  archived   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  data       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assoc_archived ON associations(archived, name);

CREATE TABLE IF NOT EXISTS meetings (
  id             TEXT PRIMARY KEY,
  association_id TEXT NOT NULL,
  status         TEXT NOT NULL,
  meeting_date   TEXT NOT NULL,
  share_token    TEXT UNIQUE,
  finalized_at   TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  data           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_meetings_assoc ON meetings(association_id, meeting_date DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);

CREATE TABLE IF NOT EXISTS agenda_files (
  meeting_id  TEXT PRIMARY KEY,
  filename    TEXT NOT NULL,
  mime        TEXT NOT NULL,
  bytes       BLOB NOT NULL,
  size        INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         TEXT NOT NULL,
  actor      TEXT,
  action     TEXT NOT NULL,
  subject_id TEXT,
  detail     TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at DESC);
`);
db.exec(`INSERT OR IGNORE INTO schema_meta(key, value) VALUES ('version', '1')`);

/* ------------------------------------------------------------------ */
/* access codes                                                        */
/* ------------------------------------------------------------------ */

export function hashCode(code: string, salt: string): string {
  return crypto.scryptSync(code.normalize('NFKC'), salt, 32).toString('hex');
}

export interface AccessCodeRecord {
  id: string;
  label: string;
  code_hash: string;
  code_salt: string;
  role: 'admin' | 'manager';
  disabled: number;
  created_at: string;
  last_used_at: string | null;
}

export function createAccessCode(label: string, code: string, role: 'admin' | 'manager'): string {
  const id = 'code_' + crypto.randomBytes(8).toString('hex');
  const salt = crypto.randomBytes(16).toString('hex');
  q(`INSERT INTO access_codes (id, label, code_hash, code_salt, role, disabled, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`).run(id, label, hashCode(code, salt), salt, role, new Date().toISOString());
  return id;
}

export function findMatchingCode(code: string): AccessCodeRecord | null {
  const rows = q(`SELECT * FROM access_codes WHERE disabled = 0`).all() as unknown as AccessCodeRecord[];
  for (const row of rows) {
    const candidate = Buffer.from(hashCode(code, row.code_salt), 'hex');
    const stored = Buffer.from(row.code_hash, 'hex');
    if (candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored)) return row;
  }
  return null;
}

export function listAccessCodes(): AccessCodeRecord[] {
  return q(`SELECT * FROM access_codes ORDER BY created_at ASC`).all() as unknown as AccessCodeRecord[];
}

export function countAccessCodes(): number {
  return Number((q(`SELECT COUNT(*) AS n FROM access_codes`).get() as {n: number}).n);
}

export function setAccessCodeDisabled(id: string, disabled: boolean): boolean {
  const info = q(`UPDATE access_codes SET disabled = ? WHERE id = ?`).run(flag(disabled), id);
  if (disabled) q(`DELETE FROM sessions WHERE code_id = ?`).run(id);
  return Number(info.changes) > 0;
}

export function removeAccessCode(id: string): void {
  q(`DELETE FROM access_codes WHERE id = ?`).run(id);
}

/* ------------------------------------------------------------------ */
/* sessions                                                            */
/* ------------------------------------------------------------------ */

export function createSession(codeId: string, userAgent: string | undefined): string {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + env.sessionDays * 86400_000);
  q(`INSERT INTO sessions (token, code_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)`).run(
    token,
    codeId,
    now.toISOString(),
    expires.toISOString(),
    (userAgent || '').slice(0, 200),
  );
  q(`UPDATE access_codes SET last_used_at = ? WHERE id = ?`).run(now.toISOString(), codeId);
  return token;
}

export function resolveSession(token: string): {label: string; role: 'admin' | 'manager'; codeId: string} | null {
  const row = q(
    `SELECT s.expires_at, c.id AS code_id, c.label, c.role, c.disabled
       FROM sessions s JOIN access_codes c ON c.id = s.code_id
      WHERE s.token = ?`,
  ).get(token) as {expires_at: string; code_id: string; label: string; role: 'admin' | 'manager'; disabled: number} | undefined;

  if (!row || row.disabled) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    q(`DELETE FROM sessions WHERE token = ?`).run(token);
    return null;
  }
  return {label: row.label, role: row.role, codeId: row.code_id};
}

export function destroySession(token: string): void {
  q(`DELETE FROM sessions WHERE token = ?`).run(token);
}

export function purgeExpiredSessions(): void {
  q(`DELETE FROM sessions WHERE expires_at < ?`).run(new Date().toISOString());
}

/* ------------------------------------------------------------------ */
/* associations                                                        */
/* ------------------------------------------------------------------ */

export function listAssociations(includeArchived = false): Association[] {
  const rows = q(
    includeArchived
      ? `SELECT data FROM associations ORDER BY name COLLATE NOCASE`
      : `SELECT data FROM associations WHERE archived = 0 ORDER BY name COLLATE NOCASE`,
  ).all() as unknown as {data: string}[];
  return rows.map((r) => JSON.parse(r.data) as Association);
}

export function getAssociation(id: string): Association | null {
  const row = q(`SELECT data FROM associations WHERE id = ?`).get(id) as {data: string} | undefined;
  return row ? (JSON.parse(row.data) as Association) : null;
}

export function saveAssociation(a: Association): Association {
  const now = new Date().toISOString();
  const next: Association = {...a, updatedAt: now, createdAt: a.createdAt || now};
  q(`INSERT INTO associations (id, name, archived, created_at, updated_at, data)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, archived = excluded.archived,
       updated_at = excluded.updated_at, data = excluded.data`).run(
    next.id,
    next.name,
    flag(next.archived),
    next.createdAt,
    next.updatedAt,
    JSON.stringify(next),
  );
  return next;
}

export function deleteAssociation(id: string): void {
  q(`DELETE FROM associations WHERE id = ?`).run(id);
}

/* ------------------------------------------------------------------ */
/* meetings                                                            */
/* ------------------------------------------------------------------ */

export function saveMeeting(m: Meeting): Meeting {
  const next: Meeting = {...m, updatedAt: new Date().toISOString()};
  q(`INSERT INTO meetings (id, association_id, status, meeting_date, share_token, finalized_at, created_at, updated_at, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       association_id = excluded.association_id, status = excluded.status,
       meeting_date = excluded.meeting_date, share_token = excluded.share_token,
       finalized_at = excluded.finalized_at, updated_at = excluded.updated_at,
       data = excluded.data`).run(
    next.id,
    next.associationId,
    next.status,
    next.date,
    nn(next.shareToken),
    nn(next.finalizedAt),
    next.createdAt,
    next.updatedAt,
    JSON.stringify(next),
  );
  return next;
}

export function getMeeting(id: string): Meeting | null {
  const row = q(`SELECT data FROM meetings WHERE id = ?`).get(id) as {data: string} | undefined;
  return row ? (JSON.parse(row.data) as Meeting) : null;
}

export function getMeetingByShareToken(token: string): Meeting | null {
  const row = q(`SELECT data FROM meetings WHERE share_token = ?`).get(token) as {data: string} | undefined;
  return row ? (JSON.parse(row.data) as Meeting) : null;
}

export function deleteMeeting(id: string): void {
  q(`DELETE FROM agenda_files WHERE meeting_id = ?`).run(id);
  q(`DELETE FROM meetings WHERE id = ?`).run(id);
}

export function listMeetings(opts: {associationId?: string; limit?: number; status?: string} = {}): MeetingSummaryRow[] {
  const clauses: string[] = [];
  const params: Bindable[] = [];
  if (opts.associationId) {
    clauses.push('association_id = ?');
    params.push(opts.associationId);
  }
  if (opts.status) {
    clauses.push('status = ?');
    params.push(opts.status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(opts.limit ?? 200);

  const rows = q(
    `SELECT data FROM meetings ${where} ORDER BY meeting_date DESC, updated_at DESC LIMIT ?`,
  ).all(...params) as unknown as {data: string}[];

  return rows.map((r) => {
    const m = JSON.parse(r.data) as Meeting;
    return {
      id: m.id,
      associationId: m.associationId,
      associationName: m.associationName,
      type: m.type,
      date: m.date,
      status: m.status,
      entryCount: m.entries.length,
      motionCount: m.entries.filter((e) => e.kind === 'MOTION').length,
      updatedAt: m.updatedAt,
      shareToken: m.shareToken,
    };
  });
}

/** The meeting still open for this association, if any. */
export function findOpenMeeting(associationId: string): Meeting | null {
  const row = q(
    `SELECT data FROM meetings
      WHERE association_id = ? AND status IN ('DRAFT','IN_SESSION')
      ORDER BY updated_at DESC LIMIT 1`,
  ).get(associationId) as {data: string} | undefined;
  return row ? (JSON.parse(row.data) as Meeting) : null;
}

/* ------------------------------------------------------------------ */
/* agenda files                                                        */
/* ------------------------------------------------------------------ */

export function saveAgendaFile(meetingId: string, filename: string, mime: string, bytes: Buffer): void {
  q(`INSERT INTO agenda_files (meeting_id, filename, mime, bytes, size, uploaded_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(meeting_id) DO UPDATE SET
       filename = excluded.filename, mime = excluded.mime, bytes = excluded.bytes,
       size = excluded.size, uploaded_at = excluded.uploaded_at`).run(
    meetingId,
    filename,
    mime,
    new Uint8Array(bytes),
    bytes.length,
    new Date().toISOString(),
  );
}

export function getAgendaFile(meetingId: string): {filename: string; mime: string; bytes: Buffer} | null {
  const row = q(`SELECT filename, mime, bytes FROM agenda_files WHERE meeting_id = ?`).get(meetingId) as
    | {filename: string; mime: string; bytes: Uint8Array}
    | undefined;
  return row ? {filename: row.filename, mime: row.mime, bytes: Buffer.from(row.bytes)} : null;
}

export function deleteAgendaFile(meetingId: string): void {
  q(`DELETE FROM agenda_files WHERE meeting_id = ?`).run(meetingId);
}

/* ------------------------------------------------------------------ */
/* audit                                                               */
/* ------------------------------------------------------------------ */

let auditWrites = 0;

export function audit(actor: string | undefined, action: string, subjectId?: string, detail?: string): void {
  q(`INSERT INTO audit_log (at, actor, action, subject_id, detail) VALUES (?, ?, ?, ?, ?)`).run(
    new Date().toISOString(),
    nn(actor),
    action,
    nn(subjectId),
    nn(detail),
  );
  // Keep the trail useful without letting it grow forever.
  if (++auditWrites % 200 === 0) {
    q(`DELETE FROM audit_log WHERE id < (SELECT MAX(id) - 20000 FROM audit_log)`).run();
  }
}

export function countMeetings(): number {
  return Number((q(`SELECT COUNT(*) AS n FROM meetings`).get() as {n: number}).n);
}

/* ------------------------------------------------------------------ */
/* first boot                                                          */
/* ------------------------------------------------------------------ */

export function bootstrap(): {generatedCode?: string} {
  purgeExpiredSessions();
  if (countAccessCodes() > 0) return {};

  if (env.bootstrapCode) {
    createAccessCode('Owner', env.bootstrapCode, 'admin');
    console.log('[db] created the first administrator code from ACCESS_CODE');
    return {};
  }
  const raw = crypto.randomBytes(6).toString('base64url').replace(/[-_]/g, '').toUpperCase().slice(0, 8);
  const generated = `${raw.slice(0, 4)}-${raw.slice(4)}`;
  createAccessCode('Owner', generated, 'admin');
  return {generatedCode: generated};
}
