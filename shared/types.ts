/**
 * Shared domain model for the board minutes recorder.
 * Used by both the Express API and the React client.
 */

/* ------------------------------------------------------------------ */
/* Associations & people                                               */
/* ------------------------------------------------------------------ */

export const BOARD_ROLES = [
  'President',
  'Vice President',
  'Treasurer',
  'Secretary',
  'Director',
  'Community Manager',
] as const;

export type BoardRole = (typeof BOARD_ROLES)[number] | string;

export interface BoardMember {
  id: string;
  name: string;
  role: BoardRole;
  email: string;
  /** Non-voting seats (e.g. the management company) are excluded from quorum and vote math. */
  voting: boolean;
  active: boolean;
}

export interface Association {
  id: string;
  name: string;
  address: string;
  /** Fiscal / legal identifiers that belong on the record. */
  county?: string;
  unitCount?: number;
  /** Quorum rule: number of voting directors required, or 'MAJORITY' of seated directors. */
  quorumRule: 'MAJORITY' | 'TWO_THIRDS' | 'FIXED';
  quorumFixed?: number;
  defaultLocation?: string;
  members: BoardMember[];
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Meetings                                                            */
/* ------------------------------------------------------------------ */

export const MEETING_TYPES = [
  'REGULAR',
  'SPECIAL',
  'ANNUAL',
  'ORGANIZATIONAL',
  'EXECUTIVE',
] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export const MEETING_TYPE_LABEL: Record<MeetingType, string> = {
  REGULAR: 'Regular Meeting of the Board of Directors',
  SPECIAL: 'Special Meeting of the Board of Directors',
  ANNUAL: 'Annual Meeting of the Membership',
  ORGANIZATIONAL: 'Organizational Meeting of the Board of Directors',
  EXECUTIVE: 'Executive Session of the Board of Directors',
};

export type AttendanceStatus = 'PRESENT' | 'REMOTE' | 'ABSENT' | 'EXCUSED';

export interface AttendanceRecord {
  memberId: string;
  name: string;
  role: BoardRole;
  email: string;
  voting: boolean;
  status: AttendanceStatus;
  /** Set when a director joins after the call to order, or leaves early. */
  arrivedAt?: string;
  departedAt?: string;
}

export interface Guest {
  id: string;
  name: string;
  affiliation?: string;
  /** Homeowners in the forum vs. vendors/counsel presenting. */
  kind: 'HOMEOWNER' | 'VENDOR' | 'COUNSEL' | 'GUEST';
}

/** The eight standard sections a set of association minutes is organised into. */
export const SECTIONS = [
  'OPENING',
  'MINUTES_APPROVAL',
  'REPORTS',
  'UNFINISHED',
  'NEW_BUSINESS',
  'FORUM',
  'EXECUTIVE',
  'CLOSING',
] as const;
export type SectionKey = (typeof SECTIONS)[number];

export const SECTION_LABEL: Record<SectionKey, string> = {
  OPENING: 'Call to Order, Roll Call & Quorum',
  MINUTES_APPROVAL: 'Approval of Prior Minutes',
  REPORTS: 'Officer, Manager & Committee Reports',
  UNFINISHED: 'Unfinished Business',
  NEW_BUSINESS: 'New Business',
  FORUM: 'Homeowner Open Forum',
  EXECUTIVE: 'Executive Session',
  CLOSING: 'Next Meeting & Adjournment',
};

export const SECTION_SHORT: Record<SectionKey, string> = {
  OPENING: 'Opening',
  MINUTES_APPROVAL: 'Prior Minutes',
  REPORTS: 'Reports',
  UNFINISHED: 'Unfinished',
  NEW_BUSINESS: 'New Business',
  FORUM: 'Open Forum',
  EXECUTIVE: 'Exec. Session',
  CLOSING: 'Closing',
};

export interface AgendaItem {
  id: string;
  section: SectionKey;
  title: string;
  /** Pre-meeting notes from the manager: background, recommended action. */
  notes?: string;
  order: number;
  status: 'PENDING' | 'ACTIVE' | 'DONE' | 'TABLED' | 'SKIPPED';
}

/* ------------------------------------------------------------------ */
/* Minute entries                                                      */
/* ------------------------------------------------------------------ */

export type EntryKind =
  | 'CALL_TO_ORDER'
  | 'QUORUM'
  | 'MOTION'
  | 'OFFICER_REPORT'
  | 'COMMITTEE_REPORT'
  | 'MANAGER_REPORT'
  | 'DISCUSSION'
  | 'HOMEOWNER_COMMENT'
  | 'ACTION_ITEM'
  | 'EXEC_SESSION_IN'
  | 'EXEC_SESSION_OUT'
  | 'RECESS'
  | 'ATTENDANCE_CHANGE'
  | 'NEXT_MEETING'
  | 'ADJOURNMENT';

export type VoteMethod = 'UNANIMOUS' | 'VOICE' | 'ROLL_CALL' | 'BALLOT' | 'CONSENT';
export type VoteResult = 'CARRIED' | 'FAILED' | 'TABLED' | 'WITHDRAWN';
export type Ballot = 'AYE' | 'NAY' | 'ABSTAIN' | 'RECUSED' | 'ABSENT';

export interface Vote {
  method: VoteMethod;
  ayes: number;
  nays: number;
  abstentions: number;
  recusals: number;
  /** Only populated for roll-call votes: memberId -> ballot. */
  perMember?: Record<string, Ballot>;
  result: VoteResult;
}

export interface Motion {
  text: string;
  movedById?: string;
  movedByName?: string;
  secondedById?: string;
  secondedByName?: string;
  vote?: Vote;
}

export interface ActionItem {
  id: string;
  text: string;
  ownerName?: string;
  dueDate?: string;
  entryId?: string;
}

export interface MinuteEntry {
  id: string;
  section: SectionKey;
  agendaItemId?: string;
  kind: EntryKind;
  /** Clock time shown in the record, e.g. "7:04 PM". */
  time: string;
  timeIso: string;
  /** Short heading for the paragraph. */
  title: string;
  /** The minute text itself, in formal past tense. */
  body: string;
  motion?: Motion;
  actionItems?: ActionItem[];
  /** True when Claude/Gemini rewrote shorthand into minute language. */
  aiAssisted?: boolean;
  /** Manually edited after creation. */
  edited?: boolean;
  order: number;
}

export type MeetingStatus = 'DRAFT' | 'IN_SESSION' | 'ADJOURNED' | 'FINALIZED';

export interface AgendaFile {
  name: string;
  size: number;
  type: string;
  /** Stored server-side; the client fetches it from /api/meetings/:id/agenda-file. */
  storedAt?: string;
}

export interface NextMeeting {
  date?: string;
  time?: string;
  location?: string;
}

export interface Meeting {
  id: string;
  associationId: string;
  /** Denormalised so an archived meeting still prints correctly if the roster changes. */
  associationName: string;
  associationAddress: string;
  type: MeetingType;
  /** Calendar date of the meeting, ISO yyyy-mm-dd. */
  date: string;
  scheduledTime?: string;
  location: string;
  status: MeetingStatus;
  calledToOrderAt?: string;
  calledToOrderIso?: string;
  adjournedAt?: string;
  adjournedIso?: string;
  presidingMemberId?: string;
  presidingName?: string;
  recordingSecretaryName?: string;
  quorumRequired: number;
  attendance: AttendanceRecord[];
  guests: Guest[];
  agenda: AgendaItem[];
  entries: MinuteEntry[];
  executiveSummary?: string;
  keyOutcomes?: string[];
  nextMeeting?: NextMeeting;
  agendaFile?: AgendaFile;
  shareToken?: string;
  sharedAt?: string;
  emailedAt?: string;
  finalizedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingSummaryRow {
  id: string;
  associationId: string;
  associationName: string;
  type: MeetingType;
  date: string;
  status: MeetingStatus;
  entryCount: number;
  motionCount: number;
  updatedAt: string;
  shareToken?: string;
}

/* ------------------------------------------------------------------ */
/* API envelopes                                                       */
/* ------------------------------------------------------------------ */

export interface AppConfig {
  brandName: string;
  brandShort: string;
  brandTagline: string;
  supportEmail: string;
  aiEnabled: boolean;
  emailEnabled: boolean;
  sharingEnabled: boolean;
  version: string;
}

export interface SessionInfo {
  authenticated: boolean;
  label?: string;
  role?: 'admin' | 'manager';
}

export interface AccessCodeRow {
  id: string;
  label: string;
  role: 'admin' | 'manager';
  disabled: boolean;
  createdAt: string;
  lastUsedAt?: string;
}

export interface FormattedNote {
  title: string;
  body: string;
  actionItems: string[];
  suggestedSection: SectionKey;
  aiAssisted: boolean;
}

export interface GeneratedSummary {
  summary: string;
  keyOutcomes: string[];
  aiAssisted: boolean;
}
