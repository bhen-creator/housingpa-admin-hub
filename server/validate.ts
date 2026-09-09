/**
 * Hand-rolled validation. Everything written to the database passes through
 * here, so a malformed or hostile client cannot corrupt a record.
 */
import {
  type AttendanceStatus,
  type Association,
  type Ballot,
  type BoardMember,
  MEETING_TYPES,
  type Meeting,
  type MinuteEntry,
  SECTIONS,
  type SectionKey,
} from '../shared/types';
import {HttpError} from './http';

export class ValidationError extends HttpError {
  constructor(message: string) {
    super(400, message);
  }
}

const fail = (message: string): never => {
  throw new ValidationError(message);
};

export function str(value: unknown, field: string, opts: {max?: number; required?: boolean; dflt?: string} = {}): string {
  const {max = 500, required = false, dflt = ''} = opts;
  if (value === undefined || value === null) {
    if (required) fail(`${field} is required`);
    return dflt;
  }
  if (typeof value !== 'string') fail(`${field} must be text`);
  const s = (value as string).trim();
  if (required && !s) fail(`${field} is required`);
  if (s.length > max) fail(`${field} is too long (limit ${max} characters)`);
  return s;
}

export function num(value: unknown, field: string, opts: {min?: number; max?: number; dflt?: number} = {}): number {
  const {min = 0, max = 1e9, dflt = 0} = opts;
  if (value === undefined || value === null || value === '') return dflt;
  const n = Number(value);
  if (!Number.isFinite(n)) fail(`${field} must be a number`);
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function bool(value: unknown, dflt = false): boolean {
  if (value === undefined || value === null) return dflt;
  return value === true || value === 'true' || value === 1 || value === '1';
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string, dflt: T): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  if (value === undefined || value === null || value === '') return dflt;
  return fail(`${field} must be one of: ${allowed.join(', ')}`);
}

export function isoDate(value: unknown, field: string, dflt = ''): string {
  const s = str(value, field, {max: 10, dflt});
  if (!s) return dflt;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) fail(`${field} must be a date in YYYY-MM-DD form`);
  return s;
}

export function email(value: unknown, field: string): string {
  const s = str(value, field, {max: 254});
  if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) fail(`${field} is not a valid email address`);
  return s.toLowerCase();
}

function optional(value: string): string | undefined {
  return value === '' ? undefined : value;
}

/* ------------------------------------------------------------------ */
/* associations                                                        */
/* ------------------------------------------------------------------ */

export function cleanMember(raw: unknown, index: number): BoardMember {
  const m = (raw ?? {}) as Record<string, unknown>;
  return {
    id: str(m.id, `member[${index}].id`, {max: 64}) || `mem_${Date.now().toString(36)}_${index}`,
    name: str(m.name, `Board member name`, {max: 120, required: true}),
    role: str(m.role, `Board member role`, {max: 60, dflt: 'Director'}) || 'Director',
    email: email(m.email, `Email for ${str(m.name, 'member', {max: 120}) || 'a board member'}`),
    voting: bool(m.voting, true),
    active: bool(m.active, true),
  };
}

export function cleanAssociation(raw: unknown, existing?: Association): Association {
  const a = (raw ?? {}) as Record<string, unknown>;
  const members = Array.isArray(a.members) ? a.members.map(cleanMember) : (existing?.members ?? []);
  if (members.length > 60) fail('An association can have at most 60 board seats');

  const seen = new Set<string>();
  for (const m of members) {
    if (seen.has(m.id)) fail('Duplicate board member id');
    seen.add(m.id);
  }

  const now = new Date().toISOString();
  return {
    id: existing?.id ?? str(a.id, 'id', {max: 64}),
    name: str(a.name, 'Association name', {max: 160, required: true}),
    address: str(a.address, 'Address', {max: 240}),
    county: optional(str(a.county, 'County', {max: 80})),
    unitCount: a.unitCount === undefined || a.unitCount === null || a.unitCount === '' ? undefined : num(a.unitCount, 'Unit count', {max: 100000}),
    quorumRule: oneOf(a.quorumRule, ['MAJORITY', 'TWO_THIRDS', 'FIXED'] as const, 'Quorum rule', 'MAJORITY'),
    quorumFixed:
      a.quorumFixed === undefined || a.quorumFixed === null || a.quorumFixed === ''
        ? undefined
        : num(a.quorumFixed, 'Fixed quorum', {min: 1, max: 60, dflt: 1}),
    defaultLocation: optional(str(a.defaultLocation, 'Default location', {max: 200})),
    members,
    archived: bool(a.archived, existing?.archived ?? false),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

/* ------------------------------------------------------------------ */
/* meetings                                                            */
/* ------------------------------------------------------------------ */

const ENTRY_KINDS = [
  'CALL_TO_ORDER',
  'QUORUM',
  'MOTION',
  'OFFICER_REPORT',
  'COMMITTEE_REPORT',
  'MANAGER_REPORT',
  'DISCUSSION',
  'HOMEOWNER_COMMENT',
  'ACTION_ITEM',
  'EXEC_SESSION_IN',
  'EXEC_SESSION_OUT',
  'RECESS',
  'ATTENDANCE_CHANGE',
  'NEXT_MEETING',
  'ADJOURNMENT',
] as const;

const BALLOTS = ['AYE', 'NAY', 'ABSTAIN', 'RECUSED', 'ABSENT'] as const;

function cleanBallots(raw: unknown): Record<string, Ballot> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, Ballot> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>).slice(0, 60)) {
    if (key.length > 64) continue;
    if (typeof value === 'string' && (BALLOTS as readonly string[]).includes(value)) out[key] = value as Ballot;
  }
  return Object.keys(out).length ? out : undefined;
}

function cleanEntry(raw: unknown, index: number): MinuteEntry {
  const e = (raw ?? {}) as Record<string, unknown>;
  const motionRaw = (e.motion ?? undefined) as Record<string, unknown> | undefined;
  const voteRaw = (motionRaw?.vote ?? undefined) as Record<string, unknown> | undefined;

  return {
    id: str(e.id, `entry[${index}].id`, {max: 64, required: true}),
    section: oneOf(e.section, SECTIONS, 'Section', 'NEW_BUSINESS') as SectionKey,
    agendaItemId: optional(str(e.agendaItemId, 'agendaItemId', {max: 64})),
    kind: oneOf(e.kind, ENTRY_KINDS, 'Entry kind', 'DISCUSSION'),
    time: str(e.time, 'time', {max: 20}),
    timeIso: str(e.timeIso, 'timeIso', {max: 40}),
    title: str(e.title, 'Entry title', {max: 300}),
    body: str(e.body, 'Entry text', {max: 12000}),
    order: num(e.order, 'order', {max: 1000000, dflt: index + 1}),
    aiAssisted: bool(e.aiAssisted),
    edited: bool(e.edited),
    motion: motionRaw
      ? {
          text: str(motionRaw.text, 'Motion text', {max: 2000}),
          movedById: optional(str(motionRaw.movedById, 'movedById', {max: 64})),
          movedByName: optional(str(motionRaw.movedByName, 'movedByName', {max: 160})),
          secondedById: optional(str(motionRaw.secondedById, 'secondedById', {max: 64})),
          secondedByName: optional(str(motionRaw.secondedByName, 'secondedByName', {max: 160})),
          vote: voteRaw
            ? {
                method: oneOf(voteRaw.method, ['UNANIMOUS', 'VOICE', 'ROLL_CALL', 'BALLOT', 'CONSENT'] as const, 'Vote method', 'VOICE'),
                ayes: num(voteRaw.ayes, 'ayes', {max: 200}),
                nays: num(voteRaw.nays, 'nays', {max: 200}),
                abstentions: num(voteRaw.abstentions, 'abstentions', {max: 200}),
                recusals: num(voteRaw.recusals, 'recusals', {max: 200}),
                perMember: cleanBallots(voteRaw.perMember),
                result: oneOf(voteRaw.result, ['CARRIED', 'FAILED', 'TABLED', 'WITHDRAWN'] as const, 'Vote result', 'CARRIED'),
              }
            : undefined,
        }
      : undefined,
    actionItems: Array.isArray(e.actionItems)
      ? e.actionItems.slice(0, 40).map((item, j) => {
          const a = (item ?? {}) as Record<string, unknown>;
          return {
            id: str(a.id, 'action id', {max: 64}) || `act_${index}_${j}`,
            text: str(a.text, 'Action item', {max: 1000}),
            ownerName: optional(str(a.ownerName, 'Action owner', {max: 160})),
            dueDate: optional(isoDate(a.dueDate, 'Action due date')),
          };
        })
      : undefined,
  };
}

export function cleanMeeting(raw: unknown, existing: Meeting): Meeting {
  const m = (raw ?? {}) as Record<string, unknown>;

  if (existing.status === 'FINALIZED') {
    fail('These minutes are finalized. Reopen them before making changes.');
  }

  const entries = Array.isArray(m.entries) ? m.entries : existing.entries;
  if (entries.length > 800) fail('Too many entries in one meeting');

  const attendance = Array.isArray(m.attendance) ? m.attendance : existing.attendance;

  return {
    ...existing,
    type: oneOf(m.type, MEETING_TYPES, 'Meeting type', existing.type),
    date: isoDate(m.date, 'Meeting date', existing.date),
    scheduledTime: optional(str(m.scheduledTime, 'Scheduled time', {max: 20})),
    location: str(m.location, 'Location', {max: 240}),
    status: oneOf(m.status, ['DRAFT', 'IN_SESSION', 'ADJOURNED', 'FINALIZED'] as const, 'Status', existing.status),
    calledToOrderAt: optional(str(m.calledToOrderAt, 'calledToOrderAt', {max: 20})),
    calledToOrderIso: optional(str(m.calledToOrderIso, 'calledToOrderIso', {max: 40})),
    adjournedAt: optional(str(m.adjournedAt, 'adjournedAt', {max: 20})),
    adjournedIso: optional(str(m.adjournedIso, 'adjournedIso', {max: 40})),
    presidingMemberId: optional(str(m.presidingMemberId, 'presidingMemberId', {max: 64})),
    presidingName: optional(str(m.presidingName, 'Presiding officer', {max: 160})),
    recordingSecretaryName: optional(str(m.recordingSecretaryName, 'Recording secretary', {max: 160})),
    quorumRequired: num(m.quorumRequired, 'Quorum required', {min: 1, max: 60, dflt: existing.quorumRequired}),

    attendance: attendance.slice(0, 60).map((record, i) => {
      const a = (record ?? {}) as Record<string, unknown>;
      return {
        memberId: str(a.memberId, `attendance[${i}].memberId`, {max: 64, required: true}),
        name: str(a.name, 'Attendee name', {max: 120, required: true}),
        role: str(a.role, 'Attendee role', {max: 60, dflt: 'Director'}),
        email: email(a.email, 'Attendee email'),
        voting: bool(a.voting, true),
        status: oneOf(a.status, ['PRESENT', 'REMOTE', 'ABSENT', 'EXCUSED'] as const, 'Attendance', 'PRESENT') as AttendanceStatus,
        arrivedAt: optional(str(a.arrivedAt, 'arrivedAt', {max: 20})),
        departedAt: optional(str(a.departedAt, 'departedAt', {max: 20})),
      };
    }),

    guests: (Array.isArray(m.guests) ? m.guests : existing.guests).slice(0, 100).map((guest, i) => {
      const g = (guest ?? {}) as Record<string, unknown>;
      return {
        id: str(g.id, 'guest id', {max: 64}) || `gst_${i}`,
        name: str(g.name, 'Guest name', {max: 120, required: true}),
        affiliation: optional(str(g.affiliation, 'Guest affiliation', {max: 160})),
        kind: oneOf(g.kind, ['HOMEOWNER', 'VENDOR', 'COUNSEL', 'GUEST'] as const, 'Guest kind', 'HOMEOWNER'),
      };
    }),

    agenda: (Array.isArray(m.agenda) ? m.agenda : existing.agenda).slice(0, 150).map((item, i) => {
      const a = (item ?? {}) as Record<string, unknown>;
      return {
        id: str(a.id, 'agenda id', {max: 64}) || `agd_${i}`,
        section: oneOf(a.section, SECTIONS, 'Agenda section', 'NEW_BUSINESS') as SectionKey,
        title: str(a.title, 'Agenda item', {max: 300, required: true}),
        notes: optional(str(a.notes, 'Agenda notes', {max: 4000})),
        order: num(a.order, 'order', {max: 10000, dflt: i + 1}),
        status: oneOf(a.status, ['PENDING', 'ACTIVE', 'DONE', 'TABLED', 'SKIPPED'] as const, 'Agenda status', 'PENDING'),
      };
    }),

    entries: entries.map(cleanEntry),

    executiveSummary: optional(str(m.executiveSummary, 'Summary', {max: 6000})),
    keyOutcomes: Array.isArray(m.keyOutcomes)
      ? m.keyOutcomes.slice(0, 20).map((k, i) => str(k, `keyOutcomes[${i}]`, {max: 500})).filter(Boolean)
      : undefined,
    nextMeeting: m.nextMeeting
      ? {
          date: optional(isoDate((m.nextMeeting as Record<string, unknown>).date, 'Next meeting date')),
          time: optional(str((m.nextMeeting as Record<string, unknown>).time, 'Next meeting time', {max: 20})),
          location: optional(str((m.nextMeeting as Record<string, unknown>).location, 'Next meeting location', {max: 240})),
        }
      : undefined,
    updatedAt: new Date().toISOString(),
  };
}
