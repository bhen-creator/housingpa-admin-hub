import {useMemo, useState} from 'react';
import {AgendaFileCard} from './AgendaFileCard';
import {AgendaSpine} from './AgendaSpine';
import {MotionForm, type MotionDraft, type RecordedMotion} from './MotionForm';
import {NotePad} from './NotePad';
import {RollCall} from './RollCall';
import {ConfirmDialog, Field} from './ui';
import {clockTime, countPresent, formatDuration, hasQuorum, longDate, presentMembers, sortAgenda} from '../../shared/logic';
import {withEntry} from '../lib/entries';
import {
  SECTION_LABEL,
  type AgendaItem,
  type AttendanceStatus,
  type Guest,
  type Meeting,
  type SectionKey,
} from '../../shared/types';
import {
  IconAlert,
  IconCalendar,
  IconCheckCircle,
  IconFlag,
  IconGavel,
  IconHome,
  IconLock,
  IconPause,
  IconPlay,
  IconPlus,
  IconShield,
  IconUsers,
} from '../lib/icons';

interface Props {
  meeting: Meeting;
  aiEnabled: boolean;
  now: Date;
  onUpdate: (mutate: (current: Meeting) => Meeting) => void;
  /** Replace the meeting wholesale after a server round-trip. */
  onReplace: (meeting: Meeting) => void;
  onOpenShare: () => void;
}

export function ControlPane({meeting, aiEnabled, now, onUpdate, onReplace, onOpenShare}: Props) {
  const [activeAgendaId, setActiveAgendaId] = useState<string | null>(null);
  const [motionDraft, setMotionDraft] = useState<MotionDraft | null>(null);
  const [confirmAdjourn, setConfirmAdjourn] = useState(false);
  const [quickForm, setQuickForm] = useState<QuickKind | null>(null);

  const agendaItem = useMemo(
    () => sortAgenda(meeting.agenda).find((i) => i.id === activeAgendaId) ?? null,
    [meeting.agenda, activeAgendaId],
  );
  const section: SectionKey = agendaItem?.section ?? defaultSection(meeting);

  /* --- attendance ------------------------------------------------------- */

  const setStatus = (memberId: string, status: AttendanceStatus) =>
    onUpdate((current) => {
      const record = current.attendance.find((a) => a.memberId === memberId);
      if (!record || record.status === status) return current;

      const arriving = (status === 'PRESENT' || status === 'REMOTE') && record.status !== 'PRESENT' && record.status !== 'REMOTE';
      const leaving = (status === 'ABSENT' || status === 'EXCUSED') && (record.status === 'PRESENT' || record.status === 'REMOTE');

      const next: Meeting = {
        ...current,
        attendance: current.attendance.map((a) =>
          a.memberId === memberId
            ? {
                ...a,
                status,
                arrivedAt: current.status === 'IN_SESSION' && arriving ? clockTime() : a.arrivedAt,
                departedAt: current.status === 'IN_SESSION' && leaving ? clockTime() : a.departedAt,
              }
            : a,
        ),
      };

      // Mid-meeting comings and goings belong in the record.
      if (current.status === 'IN_SESSION' && (arriving || leaving)) {
        return withEntry(next, {
          section: 'OPENING',
          kind: 'ATTENDANCE_CHANGE',
          title: arriving ? `${record.name} joined the meeting` : `${record.name} left the meeting`,
          body: arriving
            ? `${record.name}, ${record.role}, joined the meeting at ${clockTime()}.`
            : `${record.name}, ${record.role}, left the meeting at ${clockTime()}.`,
        });
      }
      return next;
    });

  const addGuest = (guest: Guest) => onUpdate((current) => ({...current, guests: [...current.guests, guest]}));
  const removeGuest = (id: string) => onUpdate((current) => ({...current, guests: current.guests.filter((g) => g.id !== id)}));
  const setAgenda = (agenda: AgendaItem[]) => onUpdate((current) => ({...current, agenda}));

  /* --- call to order ---------------------------------------------------- */

  const callToOrder = () =>
    onUpdate((current) => {
      const time = clockTime();
      const presiding = current.attendance.find((a) => a.memberId === current.presidingMemberId && (a.status === 'PRESENT' || a.status === 'REMOTE'))
        ?? presentMembers(current.attendance).find((a) => a.role === 'President')
        ?? presentMembers(current.attendance).find((a) => a.role === 'Vice President')
        ?? presentMembers(current.attendance)[0];

      const started: Meeting = {
        ...current,
        status: 'IN_SESSION',
        calledToOrderAt: time,
        calledToOrderIso: new Date().toISOString(),
        presidingMemberId: presiding?.memberId ?? current.presidingMemberId,
        presidingName: presiding?.name ?? current.presidingName,
      };

      const present = countPresent(started.attendance);
      const quorum = hasQuorum(started);

      return withEntry(started, {
        section: 'OPENING',
        kind: 'CALL_TO_ORDER',
        title: 'Call to order',
        time,
        body:
          `${presiding ? `${presiding.name}, ${presiding.role},` : 'The presiding officer'} called the meeting to order at ${time}. ` +
          `${present} voting director${present === 1 ? '' : 's'} ${present === 1 ? 'was' : 'were'} present` +
          `${quorum ? `, constituting a quorum under the governing documents` : `, which does not constitute a quorum`}.`,
      });
    });

  /* --- quick entries ---------------------------------------------------- */

  const recordQuick = (payload: {title: string; body: string; kind: QuickKind; actionItem?: {text: string; ownerName?: string; dueDate?: string}}) => {
    const config = QUICK[payload.kind];
    onUpdate((current) =>
      withEntry(current, {
        section: config.section ?? section,
        kind: config.entryKind,
        title: payload.title,
        body: payload.body,
        agendaItemId: config.section ? undefined : (agendaItem?.id ?? undefined),
        actionItems: payload.actionItem ? [payload.actionItem] : undefined,
      }),
    );
    setQuickForm(null);
  };

  const recordExecSession = (entering: boolean) =>
    onUpdate((current) => {
      const time = clockTime();
      return withEntry(current, {
        section: 'EXECUTIVE',
        kind: entering ? 'EXEC_SESSION_IN' : 'EXEC_SESSION_OUT',
        title: entering ? 'Entered executive session' : 'Returned to open session',
        body: entering
          ? `The Board entered executive session at ${time}. Matters discussed in executive session are recorded separately and are not part of the open meeting record.`
          : `The Board returned to open session at ${time}. No votes were taken in executive session.`,
      });
    });

  const recordRecess = () =>
    onUpdate((current) =>
      withEntry(current, {
        section: section,
        kind: 'RECESS',
        title: 'Recess',
        body: `The Board recessed at ${clockTime()}.`,
      }),
    );

  /* --- motions ---------------------------------------------------------- */

  const openMotion = (preset?: Partial<MotionDraft>) =>
    setMotionDraft({
      title: preset?.title ?? '',
      text: preset?.text ?? '',
      section: preset?.section ?? section,
      discussion: '',
    });

  const recordMotion = (payload: RecordedMotion) => {
    onUpdate((current) =>
      withEntry(current, {
        section: payload.section,
        kind: 'MOTION',
        title: payload.title,
        body: payload.discussion,
        motion: payload.motion,
        agendaItemId: agendaItem?.id,
      }),
    );
    if (agendaItem) {
      setAgenda(meeting.agenda.map((i) => (i.id === agendaItem.id ? {...i, status: 'DONE'} : i)));
    }
    setMotionDraft(null);
  };

  /* --- adjourn ---------------------------------------------------------- */

  const adjourn = () =>
    onUpdate((current) => {
      const time = clockTime();
      const adjourned: Meeting = {
        ...current,
        status: 'ADJOURNED',
        adjournedAt: time,
        adjournedIso: new Date().toISOString(),
      };
      return withEntry(adjourned, {
        section: 'CLOSING',
        kind: 'ADJOURNMENT',
        title: 'Adjournment',
        time,
        body: `There being no further business, the meeting was adjourned at ${time}.`,
      });
    });

  const elapsed = meeting.calledToOrderIso
    ? formatDuration(Math.max(0, Math.round((now.getTime() - new Date(meeting.calledToOrderIso).getTime()) / 60000)))
    : null;

  /* --- render ----------------------------------------------------------- */

  if (meeting.status === 'DRAFT') {
    return (
      <div className="ctrl-scroll">
        <StartCard meeting={meeting} now={now} onCallToOrder={callToOrder} />
        <RollCall meeting={meeting} onSetStatus={setStatus} onAddGuest={addGuest} onRemoveGuest={removeGuest} />
        <AgendaSpine meeting={meeting} activeItemId={activeAgendaId} onSelect={setActiveAgendaId} onChange={setAgenda} />
        <AgendaFileCard meeting={meeting} onMeetingChange={onReplace} />
      </div>
    );
  }

  if (meeting.status === 'ADJOURNED' || meeting.status === 'FINALIZED') {
    return (
      <div className="ctrl-scroll">
        <div className="card card-pad stack gap-12">
          <div className="row gap-10">
            <span style={{color: 'var(--ok)'}}>
              <IconCheckCircle size={20} />
            </span>
            <div>
              <div style={{fontWeight: 620, fontSize: 14}}>
                {meeting.status === 'FINALIZED' ? 'Minutes finalized' : `Adjourned at ${meeting.adjournedAt}`}
              </div>
              <div className="small muted">
                {meeting.status === 'FINALIZED'
                  ? 'These minutes are locked. An administrator can reopen them if a correction is needed.'
                  : 'The document is complete. Review it on the left, then send it to the board.'}
              </div>
            </div>
          </div>
          <button className="btn btn-accent btn-block" onClick={onOpenShare}>
            <IconFlag size={14} /> Review, export &amp; send
          </button>
        </div>

        <NextMeetingCard meeting={meeting} onUpdate={onUpdate} />
        <AgendaFileCard meeting={meeting} onMeetingChange={onReplace} />
        <RollCall meeting={meeting} onSetStatus={setStatus} onAddGuest={addGuest} onRemoveGuest={removeGuest} compact />
      </div>
    );
  }

  return (
    <div className="ctrl-scroll">
      {!hasQuorum(meeting) && (
        <div className="callout callout-warn row gap-8">
          <IconAlert size={16} />
          <span>
            Quorum is not met. The Board may discuss, but no binding action should be recorded until enough directors are present.
          </span>
        </div>
      )}

      <AgendaSpine meeting={meeting} activeItemId={activeAgendaId} onSelect={setActiveAgendaId} onChange={setAgenda} />

      {meeting.agendaFile && <AgendaFileCard meeting={meeting} onMeetingChange={onReplace} />}

      {motionDraft ? (
        <MotionForm
          meeting={meeting}
          draft={motionDraft}
          aiEnabled={aiEnabled}
          onCancel={() => setMotionDraft(null)}
          onRecord={recordMotion}
        />
      ) : quickForm ? (
        <QuickEntryForm
          kind={quickForm}
          meeting={meeting}
          sectionLabel={SECTION_LABEL[QUICK[quickForm].section ?? section]}
          onCancel={() => setQuickForm(null)}
          onRecord={recordQuick}
        />
      ) : (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">What is happening now?</div>
              <div className="card-sub">
                {agendaItem ? `Filing under “${agendaItem.title}”` : `Filing under ${SECTION_LABEL[section]}`}
              </div>
            </div>
            <span className="timer">{elapsed ? `${elapsed} in` : ''}</span>
          </div>
          <div className="card-pad">
            <div className="action-grid">
              <button className="action-btn" onClick={() => openMotion()}>
                <span className="t">
                  <IconGavel size={15} /> Motion &amp; vote
                </span>
                <span className="d">Mover, seconder, tally and outcome</span>
              </button>
              <button
                className="action-btn"
                onClick={() =>
                  openMotion({
                    title: 'Approval of prior minutes',
                    text: 'approve the minutes of the prior meeting as distributed',
                    section: 'MINUTES_APPROVAL',
                  })
                }
              >
                <span className="t">
                  <IconCheckCircle size={15} /> Approve prior minutes
                </span>
                <span className="d">Standard procedural motion</span>
              </button>
              <button className="action-btn" onClick={() => setQuickForm('REPORT')}>
                <span className="t">
                  <IconUsers size={15} /> Report
                </span>
                <span className="d">Officer, manager or committee</span>
              </button>
              <button className="action-btn" onClick={() => setQuickForm('FORUM')}>
                <span className="t">
                  <IconHome size={15} /> Homeowner comment
                </span>
                <span className="d">Open forum remarks</span>
              </button>
              <button className="action-btn" onClick={() => setQuickForm('ACTION')}>
                <span className="t">
                  <IconFlag size={15} /> Action item
                </span>
                <span className="d">Assign a follow-up with a date</span>
              </button>
              <button className="action-btn" onClick={() => recordExecSession(!inExecutiveSession(meeting))}>
                <span className="t">
                  <IconLock size={15} /> {inExecutiveSession(meeting) ? 'Return to open session' : 'Executive session'}
                </span>
                <span className="d">{inExecutiveSession(meeting) ? 'Close the closed session' : 'Legal, personnel, collections'}</span>
              </button>
            </div>

            <div className="row gap-8" style={{marginTop: 10}}>
              <button className="btn btn-sm btn-ghost" onClick={recordRecess}>
                <IconPause size={13} /> Recess
              </button>
              <button className="btn btn-sm btn-danger right" onClick={() => setConfirmAdjourn(true)}>
                <IconFlag size={13} /> Adjourn meeting
              </button>
            </div>
          </div>
        </div>
      )}

      <NotePad
        meeting={meeting}
        section={section}
        agendaItem={agendaItem?.title}
        aiEnabled={aiEnabled}
        onRecord={(note, useSuggested) =>
          onUpdate((current) =>
            withEntry(current, {
              section: useSuggested ? note.suggestedSection : section,
              kind: 'DISCUSSION',
              title: note.title,
              body: note.body,
              agendaItemId: agendaItem?.id,
              aiAssisted: note.aiAssisted,
              actionItems: note.actionItems.map((text) => ({text})),
            }),
          )
        }
      />

      <RollCall meeting={meeting} onSetStatus={setStatus} onAddGuest={addGuest} onRemoveGuest={removeGuest} compact />

      {confirmAdjourn && (
        <ConfirmDialog
          title="Adjourn the meeting?"
          message={
            <>
              This records the adjournment time and closes the record. The minutes stay editable until you finalize them.
              {meeting.agenda.some((i) => i.status !== 'DONE') && (
                <div className="callout callout-warn" style={{marginTop: 12}}>
                  {meeting.agenda.filter((i) => i.status !== 'DONE').length} agenda item(s) are not marked as covered.
                </div>
              )}
            </>
          }
          confirmLabel="Adjourn now"
          onCancel={() => setConfirmAdjourn(false)}
          onConfirm={() => {
            adjourn();
            setConfirmAdjourn(false);
            onOpenShare();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function inExecutiveSession(meeting: Meeting): boolean {
  const relevant = [...meeting.entries]
    .sort((a, b) => a.order - b.order)
    .filter((e) => e.kind === 'EXEC_SESSION_IN' || e.kind === 'EXEC_SESSION_OUT');
  return relevant.at(-1)?.kind === 'EXEC_SESSION_IN';
}

function defaultSection(meeting: Meeting): SectionKey {
  if (meeting.entries.length === 0) return 'OPENING';
  if (inExecutiveSession(meeting)) return 'EXECUTIVE';
  return 'NEW_BUSINESS';
}

/* ------------------------------------------------------------------ */

type QuickKind = 'REPORT' | 'FORUM' | 'ACTION';

const QUICK: Record<QuickKind, {label: string; entryKind: Meeting['entries'][number]['kind']; section?: SectionKey; titlePlaceholder: string; bodyPlaceholder: string}> = {
  REPORT: {
    label: 'Report',
    entryKind: 'OFFICER_REPORT',
    section: 'REPORTS',
    titlePlaceholder: "Treasurer's report",
    bodyPlaceholder: 'What was reported — figures, status, anything the Board was asked to note.',
  },
  FORUM: {
    label: 'Homeowner comment',
    entryKind: 'HOMEOWNER_COMMENT',
    section: 'FORUM',
    titlePlaceholder: 'Homeowner comment — visitor parking',
    bodyPlaceholder: 'What was raised and how the Board responded. Avoid recording owner names unless they asked to be named.',
  },
  ACTION: {
    label: 'Action item',
    entryKind: 'ACTION_ITEM',
    titlePlaceholder: 'Follow-up assigned',
    bodyPlaceholder: 'Context for the assignment (optional).',
  },
};

function QuickEntryForm({
  kind,
  meeting,
  sectionLabel,
  onCancel,
  onRecord,
}: {
  kind: QuickKind;
  meeting: Meeting;
  sectionLabel: string;
  onCancel: () => void;
  onRecord: (payload: {title: string; body: string; kind: QuickKind; actionItem?: {text: string; ownerName?: string; dueDate?: string}}) => void;
}) {
  const config = QUICK[kind];
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [owner, setOwner] = useState('');
  const [due, setDue] = useState('');

  const canSave = kind === 'ACTION' ? title.trim().length > 0 : title.trim().length > 0 || body.trim().length > 0;

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">{config.label}</div>
          <div className="card-sub">Files under {sectionLabel}</div>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <div className="card-pad">
        <Field label={kind === 'ACTION' ? 'What needs to happen' : 'Heading'} htmlFor="quick-title">
          <input
            id="quick-title"
            className="input"
            value={title}
            autoFocus
            placeholder={config.titlePlaceholder}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>

        <Field label={kind === 'ACTION' ? 'Context (optional)' : 'What was said'} htmlFor="quick-body">
          <textarea
            id="quick-body"
            className="textarea"
            rows={3}
            value={body}
            placeholder={config.bodyPlaceholder}
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>

        {kind === 'ACTION' && (
          <div className="field-row">
            <Field label="Owner" htmlFor="quick-owner">
              <input
                id="quick-owner"
                className="input"
                list="attendee-names"
                value={owner}
                placeholder="Management"
                onChange={(e) => setOwner(e.target.value)}
              />
              <datalist id="attendee-names">
                {meeting.attendance.map((a) => (
                  <option key={a.memberId} value={a.name} />
                ))}
                <option value="Management" />
              </datalist>
            </Field>
            <Field label="Due" htmlFor="quick-due">
              <input id="quick-due" className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </Field>
          </div>
        )}

        <button
          className="btn btn-accent btn-block"
          disabled={!canSave}
          onClick={() =>
            onRecord({
              title: title.trim() || config.titlePlaceholder,
              body: body.trim(),
              kind,
              actionItem:
                kind === 'ACTION'
                  ? {text: title.trim(), ownerName: owner.trim() || undefined, dueDate: due || undefined}
                  : undefined,
            })
          }
        >
          <IconPlus size={14} /> Add to the minutes
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function StartCard({meeting, now, onCallToOrder}: {meeting: Meeting; now: Date; onCallToOrder: () => void}) {
  const quorumOk = hasQuorum(meeting);
  const presiding =
    meeting.attendance.find((a) => a.memberId === meeting.presidingMemberId) ??
    presentMembers(meeting.attendance).find((a) => a.role === 'President') ??
    presentMembers(meeting.attendance)[0];

  return (
    <div className="card start-card">
      <div className="pill" style={{marginBottom: 12}}>
        <IconPlay size={11} /> Step 1 — call to order
      </div>
      <div className="big-clock">{now.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit', second: '2-digit'})}</div>
      <div className="small muted" style={{marginTop: 4}}>
        {longDate(meeting.date)}
      </div>

      <div className="start-grid">
        <div className="start-tile">
          <div className="k">Presiding</div>
          <div className="v">{presiding?.name ?? 'Not set'}</div>
          <div className="tiny muted">{presiding?.role}</div>
        </div>
        <div className="start-tile">
          <div className="k">Quorum</div>
          <div className="v">{countPresent(meeting.attendance)} voting directors present</div>
          <div className="tiny" style={{color: quorumOk ? 'var(--ok)' : 'var(--warn)', fontWeight: 600}}>
            {meeting.quorumRequired} required · {quorumOk ? 'satisfied' : 'not yet met'}
          </div>
        </div>
      </div>

      <button className="btn btn-accent btn-lg btn-block" onClick={onCallToOrder}>
        <IconGavel size={16} /> Call the meeting to order
      </button>
      <div className="tiny muted" style={{marginTop: 9}}>
        This stamps the exact time and writes the first line of the minutes.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function NextMeetingCard({meeting, onUpdate}: {meeting: Meeting; onUpdate: Props['onUpdate']}) {
  const next = meeting.nextMeeting ?? {};
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          <IconCalendar size={13} style={{verticalAlign: -2, marginRight: 6}} /> Next meeting
        </div>
      </div>
      <div className="card-pad">
        <div className="field-row">
          <Field label="Date" htmlFor="next-date">
            <input
              id="next-date"
              className="input"
              type="date"
              value={next.date ?? ''}
              onChange={(e) => onUpdate((c) => ({...c, nextMeeting: {...c.nextMeeting, date: e.target.value || undefined}}))}
            />
          </Field>
          <Field label="Time" htmlFor="next-time">
            <input
              id="next-time"
              className="input"
              placeholder="7:00 PM"
              value={next.time ?? ''}
              onChange={(e) => onUpdate((c) => ({...c, nextMeeting: {...c.nextMeeting, time: e.target.value || undefined}}))}
            />
          </Field>
        </div>
        <Field label="Location" htmlFor="next-loc">
          <input
            id="next-loc"
            className="input"
            placeholder={meeting.location || 'Clubhouse'}
            value={next.location ?? ''}
            onChange={(e) => onUpdate((c) => ({...c, nextMeeting: {...c.nextMeeting, location: e.target.value || undefined}}))}
          />
        </Field>
        <div className="tiny muted row gap-6">
          <IconShield size={12} /> Recorded at the end of the minutes.
        </div>
      </div>
    </div>
  );
}
