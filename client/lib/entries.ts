import {clockTime, nextOrder, newId} from '../../shared/logic';
import type {ActionItem, EntryKind, Meeting, MinuteEntry, Motion, SectionKey} from '../../shared/types';

export interface NewEntry {
  section: SectionKey;
  kind: EntryKind;
  title: string;
  body?: string;
  motion?: Motion;
  actionItems?: {text: string; ownerName?: string; dueDate?: string}[];
  agendaItemId?: string;
  aiAssisted?: boolean;
  /** Override the timestamp (used when back-filling the call to order). */
  time?: string;
}

export function buildEntry(meeting: Meeting, input: NewEntry): MinuteEntry {
  const now = new Date();
  return {
    id: newId('ent'),
    section: input.section,
    agendaItemId: input.agendaItemId,
    kind: input.kind,
    time: input.time ?? clockTime(now),
    timeIso: now.toISOString(),
    title: input.title.trim(),
    body: (input.body ?? '').trim(),
    motion: input.motion,
    actionItems: input.actionItems?.length
      ? input.actionItems.map<ActionItem>((a) => ({id: newId('act'), text: a.text.trim(), ownerName: a.ownerName, dueDate: a.dueDate}))
      : undefined,
    aiAssisted: input.aiAssisted,
    order: nextOrder(meeting.entries),
  };
}

export function withEntry(meeting: Meeting, input: NewEntry): Meeting {
  return {...meeting, entries: [...meeting.entries, buildEntry(meeting, input)]};
}

/** Move an entry one place within its own section, keeping global order sane. */
export function reorderEntry(meeting: Meeting, id: string, direction: -1 | 1): Meeting {
  const sorted = [...meeting.entries].sort((a, b) => a.order - b.order);
  const index = sorted.findIndex((e) => e.id === id);
  if (index < 0) return meeting;

  const entry = sorted[index];
  let swapIndex = -1;
  for (let i = index + direction; i >= 0 && i < sorted.length; i += direction) {
    if (sorted[i].section === entry.section) {
      swapIndex = i;
      break;
    }
  }
  if (swapIndex < 0) return meeting;

  const swap = sorted[swapIndex];
  return {
    ...meeting,
    entries: meeting.entries.map((e) => {
      if (e.id === entry.id) return {...e, order: swap.order};
      if (e.id === swap.id) return {...e, order: entry.order};
      return e;
    }),
  };
}
