/**
 * Pure domain logic shared by the API and the client.
 * No DOM, no Node built-ins - safe to import from either side.
 */
import {
  type ActionItem,
  type AgendaItem,
  type Association,
  type AttendanceRecord,
  type Ballot,
  type BoardMember,
  type Meeting,
  type Motion,
  type MinuteEntry,
  MEETING_TYPE_LABEL,
  SECTION_LABEL,
  SECTIONS,
  type SectionKey,
  type Vote,
  type VoteMethod,
  type VoteResult,
} from './types';

/* ------------------------------------------------------------------ */
/* ids & time                                                          */
/* ------------------------------------------------------------------ */

let counter = 0;
export function newId(prefix: string): string {
  counter = (counter + 1) % 100000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

/** "7:04 PM" - the form minutes use. */
export function clockTime(d: Date = new Date()): string {
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** "Tuesday, September 8, 2026" from an ISO yyyy-mm-dd. */
export function longDate(isoDate: string): string {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Minutes between two ISO timestamps, or null. */
export function durationMinutes(startIso?: string, endIso?: string): number | null {
  if (!startIso || !endIso) return null;
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round(ms / 60000);
}

export function formatDuration(minutes: number | null): string {
  if (minutes === null) return '';
  if (minutes === 0) return 'under a minute';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} minute${m === 1 ? '' : 's'}`;
  if (m === 0) return `${h} hour${h === 1 ? '' : 's'}`;
  return `${h} hr ${m} min`;
}

/* ------------------------------------------------------------------ */
/* quorum                                                              */
/* ------------------------------------------------------------------ */

export function votingSeats(members: Pick<BoardMember, 'voting' | 'active'>[]): number {
  return members.filter((m) => m.voting && m.active).length;
}

/** How many voting directors the bylaws require to transact business. */
export function requiredQuorum(assoc: Pick<Association, 'quorumRule' | 'quorumFixed' | 'members'>): number {
  const seats = votingSeats(assoc.members);
  switch (assoc.quorumRule) {
    case 'FIXED':
      return Math.max(1, Math.min(assoc.quorumFixed ?? 1, seats || 1));
    case 'TWO_THIRDS':
      return Math.max(1, Math.ceil((seats * 2) / 3));
    case 'MAJORITY':
    default:
      return Math.max(1, Math.floor(seats / 2) + 1);
  }
}

export function countPresent(attendance: AttendanceRecord[]): number {
  return attendance.filter((a) => a.voting && (a.status === 'PRESENT' || a.status === 'REMOTE')).length;
}

export function hasQuorum(meeting: Pick<Meeting, 'attendance' | 'quorumRequired'>): boolean {
  return countPresent(meeting.attendance) >= meeting.quorumRequired;
}

export function presentMembers(attendance: AttendanceRecord[]): AttendanceRecord[] {
  return attendance.filter((a) => a.status === 'PRESENT' || a.status === 'REMOTE');
}

export function absentMembers(attendance: AttendanceRecord[]): AttendanceRecord[] {
  return attendance.filter((a) => a.status === 'ABSENT' || a.status === 'EXCUSED');
}

/* ------------------------------------------------------------------ */
/* votes                                                               */
/* ------------------------------------------------------------------ */

export function tallyFromBallots(perMember: Record<string, Ballot>): Pick<Vote, 'ayes' | 'nays' | 'abstentions' | 'recusals'> {
  let ayes = 0;
  let nays = 0;
  let abstentions = 0;
  let recusals = 0;
  for (const b of Object.values(perMember)) {
    if (b === 'AYE') ayes++;
    else if (b === 'NAY') nays++;
    else if (b === 'ABSTAIN') abstentions++;
    else if (b === 'RECUSED') recusals++;
  }
  return {ayes, nays, abstentions, recusals};
}

/**
 * Robert's Rules default: a motion carries on a majority of votes cast.
 * Abstentions and recusals are recorded but do not count as votes cast.
 */
export function resolveVoteResult(v: Pick<Vote, 'ayes' | 'nays' | 'method'>): VoteResult {
  if (v.method === 'UNANIMOUS' || v.method === 'CONSENT') return 'CARRIED';
  return v.ayes > v.nays ? 'CARRIED' : 'FAILED';
}

export function describeVote(vote: Vote, attendance: AttendanceRecord[]): string {
  const total = vote.ayes + vote.nays + vote.abstentions + vote.recusals;
  const parts: string[] = [];

  if (vote.method === 'UNANIMOUS') {
    parts.push(`The motion carried unanimously${vote.ayes ? ` (${vote.ayes}-0)` : ''}`);
  } else if (vote.method === 'CONSENT') {
    parts.push('The item was adopted by unanimous consent');
  } else {
    const verb =
      vote.result === 'CARRIED'
        ? 'carried'
        : vote.result === 'FAILED'
          ? 'failed'
          : vote.result === 'TABLED'
            ? 'was tabled'
            : 'was withdrawn';
    const method =
      vote.method === 'ROLL_CALL' ? 'On a roll call vote, t' : vote.method === 'BALLOT' ? 'By written ballot, t' : 'T';
    parts.push(`${method}he motion ${verb} ${vote.ayes} in favor to ${vote.nays} opposed`);
    if (vote.abstentions > 0) parts.push(`with ${vote.abstentions} abstaining`);
    if (vote.recusals > 0) parts.push(`and ${vote.recusals} recused`);
  }

  let text = parts.join(', ') + '.';

  if (vote.method === 'ROLL_CALL' && vote.perMember && total > 0) {
    const byBallot: Record<string, string[]> = {AYE: [], NAY: [], ABSTAIN: [], RECUSED: []};
    for (const a of attendance) {
      const b = vote.perMember[a.memberId];
      if (b && byBallot[b]) byBallot[b].push(a.name);
    }
    const detail: string[] = [];
    if (byBallot.AYE.length) detail.push(`Aye: ${byBallot.AYE.join(', ')}`);
    if (byBallot.NAY.length) detail.push(`Nay: ${byBallot.NAY.join(', ')}`);
    if (byBallot.ABSTAIN.length) detail.push(`Abstain: ${byBallot.ABSTAIN.join(', ')}`);
    if (byBallot.RECUSED.length) detail.push(`Recused: ${byBallot.RECUSED.join(', ')}`);
    if (detail.length) text += ` (${detail.join('; ')}.)`;
  }

  return text;
}

export const VOTE_METHOD_LABEL: Record<VoteMethod, string> = {
  UNANIMOUS: 'Unanimous',
  VOICE: 'Voice vote',
  ROLL_CALL: 'Roll call',
  BALLOT: 'Written ballot',
  CONSENT: 'Unanimous consent',
};

export const VOTE_RESULT_LABEL: Record<VoteResult, string> = {
  CARRIED: 'Carried',
  FAILED: 'Failed',
  TABLED: 'Tabled',
  WITHDRAWN: 'Withdrawn',
};

/* ------------------------------------------------------------------ */
/* entries                                                             */
/* ------------------------------------------------------------------ */

export function sectionIndex(key: SectionKey): number {
  return SECTIONS.indexOf(key);
}

/** Entries grouped into the printed section order, each list in chronological order. */
export function groupEntries(entries: MinuteEntry[]): {section: SectionKey; entries: MinuteEntry[]}[] {
  const sorted = [...entries].sort((a, b) => a.order - b.order);
  return SECTIONS.map((section) => ({
    section,
    entries: sorted.filter((e) => e.section === section),
  })).filter((g) => g.entries.length > 0);
}

export function nextOrder(entries: MinuteEntry[]): number {
  return entries.reduce((max, e) => Math.max(max, e.order), 0) + 1;
}

export function collectActionItems(entries: MinuteEntry[]): ActionItem[] {
  const out: ActionItem[] = [];
  for (const e of [...entries].sort((a, b) => a.order - b.order)) {
    for (const item of e.actionItems ?? []) out.push({...item, entryId: e.id});
  }
  return out;
}

export function motionEntries(entries: MinuteEntry[]): MinuteEntry[] {
  return entries.filter((e) => e.kind === 'MOTION' && e.motion);
}

/** The formal motion sentence, e.g. "Upon motion by X, seconded by Y, ..." */
export function motionSentence(motion: Motion): string {
  const moved = motion.movedByName;
  const seconded = motion.secondedByName;
  const body = motion.text.trim().replace(/\.$/, '');
  if (moved && seconded) {
    return `Upon motion duly made by ${moved} and seconded by ${seconded}, it was moved ${lowerFirst(body)}.`;
  }
  if (moved) {
    return `${moved} moved ${lowerFirst(body)}.`;
  }
  return `A motion was made ${lowerFirst(body)}.`;
}

function lowerFirst(s: string): string {
  if (!s) return s;
  if (/^to\b/i.test(s)) return s.charAt(0).toLowerCase() + s.slice(1);
  return `to ${s.charAt(0).toLowerCase()}${s.slice(1)}`;
}

/* ------------------------------------------------------------------ */
/* agenda                                                              */
/* ------------------------------------------------------------------ */

export const DEFAULT_AGENDA: {section: SectionKey; title: string}[] = [
  {section: 'OPENING', title: 'Call to order and roll call'},
  {section: 'MINUTES_APPROVAL', title: 'Approval of minutes of the prior meeting'},
  {section: 'REPORTS', title: "Treasurer's report and financial statements"},
  {section: 'REPORTS', title: "Community manager's report"},
  {section: 'UNFINISHED', title: 'Unfinished business'},
  {section: 'NEW_BUSINESS', title: 'New business'},
  {section: 'FORUM', title: 'Homeowner open forum'},
  {section: 'CLOSING', title: 'Next meeting date and adjournment'},
];

export function buildDefaultAgenda(): AgendaItem[] {
  return DEFAULT_AGENDA.map((a, i) => ({
    id: newId('ag'),
    section: a.section,
    title: a.title,
    order: i + 1,
    status: 'PENDING' as const,
  }));
}

export function sortAgenda(items: AgendaItem[]): AgendaItem[] {
  return [...items].sort((a, b) => {
    const s = sectionIndex(a.section) - sectionIndex(b.section);
    return s !== 0 ? s : a.order - b.order;
  });
}

/* ------------------------------------------------------------------ */
/* plain-text rendering (email body, clipboard, share fallback)        */
/* ------------------------------------------------------------------ */

export function renderMinutesText(meeting: Meeting): string {
  const L: string[] = [];
  const present = presentMembers(meeting.attendance);
  const absent = absentMembers(meeting.attendance);

  L.push(meeting.associationName.toUpperCase());
  if (meeting.associationAddress) L.push(meeting.associationAddress);
  L.push('');
  L.push(MEETING_TYPE_LABEL[meeting.type].toUpperCase());
  L.push(longDate(meeting.date));
  if (meeting.location) L.push(meeting.location);
  L.push('');
  L.push(
    `Called to order: ${meeting.calledToOrderAt || 'not recorded'}    Adjourned: ${meeting.adjournedAt || 'in session'}`,
  );
  L.push('');
  L.push('-'.repeat(64));
  L.push('');

  if (meeting.executiveSummary) {
    L.push('SUMMARY');
    L.push(wrap(meeting.executiveSummary));
    L.push('');
    if (meeting.keyOutcomes?.length) {
      for (const k of meeting.keyOutcomes) L.push(`  - ${k}`);
      L.push('');
    }
  }

  L.push('ATTENDANCE');
  L.push(
    `Present: ${present.length ? present.map((m) => `${m.name}, ${m.role}${m.status === 'REMOTE' ? ' (remote)' : ''}`).join('; ') : 'none recorded'}`,
  );
  L.push(`Absent: ${absent.length ? absent.map((m) => `${m.name}, ${m.role}`).join('; ') : 'none'}`);
  if (meeting.guests.length) {
    L.push(`Also present: ${meeting.guests.map((g) => (g.affiliation ? `${g.name} (${g.affiliation})` : g.name)).join('; ')}`);
  }
  L.push(
    `Quorum: ${countPresent(meeting.attendance)} of ${meeting.quorumRequired} required voting directors present - ${hasQuorum(meeting) ? 'quorum established' : 'QUORUM NOT MET'}.`,
  );
  L.push('');

  const groups = groupEntries(meeting.entries);
  let n = 0;
  for (const g of groups) {
    n++;
    L.push(`${n}. ${SECTION_LABEL[g.section].toUpperCase()}`);
    L.push('');
    let sub = 0;
    for (const e of g.entries) {
      sub++;
      L.push(`${n}.${sub}  ${e.title}   [${e.time}]`);
      if (e.motion) {
        L.push(wrap(motionSentence(e.motion), '     '));
        if (e.motion.vote) L.push(wrap(describeVote(e.motion.vote, meeting.attendance), '     '));
      }
      if (e.body) L.push(wrap(e.body, '     '));
      for (const a of e.actionItems ?? []) {
        L.push(`     ACTION: ${a.text}${a.ownerName ? ` - ${a.ownerName}` : ''}${a.dueDate ? ` (due ${a.dueDate})` : ''}`);
      }
      L.push('');
    }
  }

  const actions = collectActionItems(meeting.entries);
  if (actions.length) {
    L.push(`${n + 1}. ACTION ITEM REGISTER`);
    L.push('');
    actions.forEach((a, i) => {
      L.push(`  ${i + 1}. ${a.text}${a.ownerName ? ` - ${a.ownerName}` : ''}${a.dueDate ? ` (due ${a.dueDate})` : ''}`);
    });
    L.push('');
  }

  if (meeting.nextMeeting?.date) {
    L.push(
      `Next meeting: ${longDate(meeting.nextMeeting.date)}${meeting.nextMeeting.time ? ` at ${meeting.nextMeeting.time}` : ''}${meeting.nextMeeting.location ? `, ${meeting.nextMeeting.location}` : ''}.`,
    );
    L.push('');
  }

  L.push('-'.repeat(64));
  L.push('');
  L.push(`Submitted by: ${meeting.recordingSecretaryName || '________________________'}, Recording Secretary`);
  L.push(`Approved by:  ${meeting.presidingName || '________________________'}, Presiding Officer`);
  L.push('');
  L.push(
    meeting.status === 'FINALIZED'
      ? 'These minutes were approved and finalized for distribution.'
      : 'DRAFT - subject to approval by the Board of Directors at its next meeting.',
  );

  return L.join('\n');
}

function wrap(text: string, indent = ''): string {
  const width = 76 - indent.length;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width) {
      lines.push(indent + line.trim());
      line = w;
    } else {
      line += ' ' + w;
    }
  }
  if (line.trim()) lines.push(indent + line.trim());
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* meeting factory                                                     */
/* ------------------------------------------------------------------ */

export function createMeeting(
  assoc: Association,
  opts: {type?: Meeting['type']; date?: string; scheduledTime?: string; location?: string} = {},
): Meeting {
  const now = new Date().toISOString();
  const secretary = assoc.members.find((m) => m.role === 'Secretary' && m.active);
  const president = assoc.members.find((m) => m.role === 'President' && m.active);
  return {
    id: newId('mtg'),
    associationId: assoc.id,
    associationName: assoc.name,
    associationAddress: assoc.address,
    type: opts.type ?? 'REGULAR',
    date: opts.date ?? todayIso(),
    scheduledTime: opts.scheduledTime,
    location: opts.location ?? assoc.defaultLocation ?? '',
    status: 'DRAFT',
    quorumRequired: requiredQuorum(assoc),
    presidingMemberId: president?.id,
    presidingName: president?.name,
    recordingSecretaryName: secretary?.name,
    attendance: assoc.members
      .filter((m) => m.active)
      .map((m) => ({
        memberId: m.id,
        name: m.name,
        role: m.role,
        email: m.email,
        voting: m.voting,
        status: 'PRESENT' as const,
      })),
    guests: [],
    agenda: buildDefaultAgenda(),
    entries: [],
    createdAt: now,
    updatedAt: now,
  };
}
