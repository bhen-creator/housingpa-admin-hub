import {useEffect, useRef, useState} from 'react';
import {
  absentMembers,
  collectActionItems,
  countPresent,
  describeVote,
  durationMinutes,
  formatDuration,
  groupEntries,
  hasQuorum,
  longDate,
  motionSentence,
  presentMembers,
} from '../../shared/logic';
import {MEETING_TYPE_LABEL, SECTION_LABEL, type Meeting, type MinuteEntry} from '../../shared/types';
import {IconArrowDown, IconArrowUp, IconCheck, IconClock, IconPencil, IconTrash, IconX} from '../lib/icons';

interface Props {
  meeting: Meeting;
  brandName?: string;
  /** Read-only rendering for the public share page and print view. */
  readOnly?: boolean;
  onEditEntry?: (id: string, patch: Partial<MinuteEntry>) => void;
  onDeleteEntry?: (id: string) => void;
  onMoveEntry?: (id: string, direction: -1 | 1) => void;
}

export function MinutesSheet({meeting, brandName, readOnly, onEditEntry, onDeleteEntry, onMoveEntry}: Props) {
  const present = presentMembers(meeting.attendance);
  const absent = absentMembers(meeting.attendance);
  const groups = groupEntries(meeting.entries);
  const actions = collectActionItems(meeting.entries);
  const quorumOk = hasQuorum(meeting);
  const isDraft = meeting.status !== 'FINALIZED';
  const duration = formatDuration(durationMinutes(meeting.calledToOrderIso, meeting.adjournedIso));

  // Highlight and scroll to the entry that just landed.
  const [freshId, setFreshId] = useState<string | null>(null);
  const lastCount = useRef(meeting.entries.length);

  useEffect(() => {
    if (meeting.entries.length > lastCount.current) {
      const newest = [...meeting.entries].sort((a, b) => a.order - b.order).at(-1);
      if (newest) {
        setFreshId(newest.id);
        const timer = setTimeout(() => setFreshId(null), 1400);
        requestAnimationFrame(() => {
          document.getElementById(`entry-${newest.id}`)?.scrollIntoView({behavior: 'smooth', block: 'center'});
        });
        lastCount.current = meeting.entries.length;
        return () => clearTimeout(timer);
      }
    }
    lastCount.current = meeting.entries.length;
  }, [meeting.entries]);

  let sectionNo = 0;

  return (
    <article className="sheet" id="minutes-sheet" aria-label="Meeting minutes document">
      {brandName && <div className="sheet-brand">{brandName}</div>}

      <header>
        <h1>{meeting.associationName || 'Untitled Association'}</h1>
        <div className="sheet-type">{MEETING_TYPE_LABEL[meeting.type]}</div>
        <div className="sheet-date">
          <span>{longDate(meeting.date)}</span>
          {isDraft && <span className="draft-badge">Draft — subject to board approval</span>}
        </div>
        <div className="sheet-rule" />
      </header>

      <dl className="facts">
        <div>
          <dt>Called to order</dt>
          <dd>{meeting.calledToOrderAt || '—'}</dd>
        </div>
        <div>
          <dt>Adjourned</dt>
          <dd>{meeting.adjournedAt || (meeting.status === 'IN_SESSION' ? 'In session' : '—')}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{duration || '—'}</dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{meeting.location || '—'}</dd>
        </div>
      </dl>

      {meeting.agendaFile && (
        <p className="tiny muted" style={{marginTop: 10, fontFamily: 'var(--ui)'}}>
          The published agenda ({meeting.agendaFile.name}) is on file with these minutes.
        </p>
      )}

      {meeting.executiveSummary && (
        <section className="sheet-section">
          <h2>Summary</h2>
          <p>{meeting.executiveSummary}</p>
          {meeting.keyOutcomes && meeting.keyOutcomes.length > 0 && (
            <ul style={{margin: '9px 0 0', paddingLeft: 20}}>
              {meeting.keyOutcomes.map((outcome, i) => (
                <li key={i} style={{marginBottom: 3}}>
                  {outcome}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="sheet-section">
        <h2>Attendance &amp; Quorum</h2>
        <dl style={{margin: 0}}>
          <div className="roll-line">
            <dt>Present</dt>
            <dd>
              {present.length
                ? present
                    .map(
                      (m) =>
                        `${m.name}, ${m.role}${m.status === 'REMOTE' ? ' (remote)' : ''}${m.arrivedAt ? ` — arrived ${m.arrivedAt}` : ''}`,
                    )
                    .join('; ')
                : 'Pending roll call'}
            </dd>
          </div>
          <div className="roll-line">
            <dt>Absent</dt>
            <dd>
              {absent.length
                ? absent.map((m) => `${m.name}, ${m.role}${m.status === 'EXCUSED' ? ' (excused)' : ''}`).join('; ')
                : 'None'}
            </dd>
          </div>
          {meeting.guests.length > 0 && (
            <div className="roll-line">
              <dt>Also present</dt>
              <dd>{meeting.guests.map((g) => (g.affiliation ? `${g.name} (${g.affiliation})` : g.name)).join('; ')}</dd>
            </div>
          )}
        </dl>
        <p className={`quorum-note ${quorumOk ? '' : 'is-bad'}`}>
          {quorumOk
            ? `A quorum was established: ${countPresent(meeting.attendance)} voting ${countPresent(meeting.attendance) === 1 ? 'director was' : 'directors were'} present against the ${meeting.quorumRequired} required by the governing documents.`
            : `Quorum not met — ${countPresent(meeting.attendance)} of the ${meeting.quorumRequired} required voting directors are present. No binding action may be taken.`}
        </p>
      </section>

      {groups.length === 0 ? (
        <section className="sheet-section">
          <h2>Proceedings</h2>
          <div className="doc-empty">
            <div style={{color: 'var(--ink-4)', marginBottom: 6}}>
              <IconClock size={20} />
            </div>
            <div className="title">Nothing recorded yet</div>
            <div className="hint">
              Call the meeting to order on the right. Every action you take there writes a line into this document.
            </div>
          </div>
        </section>
      ) : (
        groups.map((group) => {
          sectionNo += 1;
          const number = sectionNo;
          return (
            <section className="sheet-section" key={group.section}>
              <h2>
                <span>
                  {number}. {SECTION_LABEL[group.section]}
                </span>
                <span className="count">
                  {group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}
                </span>
              </h2>
              {group.entries.map((entry, index) => (
                <EntryBlock
                  key={entry.id}
                  entry={entry}
                  label={`${number}.${index + 1}`}
                  meeting={meeting}
                  fresh={entry.id === freshId}
                  readOnly={readOnly}
                  onEdit={onEditEntry}
                  onDelete={onDeleteEntry}
                  onMove={onMoveEntry}
                />
              ))}
            </section>
          );
        })
      )}

      {actions.length > 0 && (
        <section className="sheet-section">
          <h2>
            <span>{sectionNo + 1}. Action Items</span>
            <span className="count">{actions.length} open</span>
          </h2>
          <ol style={{margin: 0, paddingLeft: 20}}>
            {actions.map((action) => (
              <li key={action.id} style={{marginBottom: 6}}>
                {action.text}
                {(action.ownerName || action.dueDate) && (
                  <span style={{fontFamily: 'var(--ui)', fontSize: 12, color: 'var(--ink-3)', display: 'block'}}>
                    {[action.ownerName, action.dueDate ? `due ${action.dueDate}` : ''].filter(Boolean).join(' · ')}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {meeting.nextMeeting?.date && (
        <p style={{marginTop: 20}}>
          The next meeting of the Board is scheduled for {longDate(meeting.nextMeeting.date)}
          {meeting.nextMeeting.time ? ` at ${meeting.nextMeeting.time}` : ''}
          {meeting.nextMeeting.location ? `, ${meeting.nextMeeting.location}` : ''}.
        </p>
      )}

      <div className="signatures">
        <div className="sig-line">
          <div className="sig-name">{meeting.recordingSecretaryName || ' '}</div>
          <div className="sig-role">Recording Secretary</div>
          <div className="sig-date">Date: ______________________</div>
        </div>
        <div className="sig-line">
          <div className="sig-name">{meeting.presidingName || ' '}</div>
          <div className="sig-role">Presiding Officer</div>
          <div className="sig-date">Date: ______________________</div>
        </div>
      </div>

      <div className="sheet-foot">
        <span>
          {isDraft
            ? 'Draft — subject to review and approval by the Board of Directors.'
            : 'Approved by the Board of Directors.'}
        </span>
        <span>{meeting.associationName}</span>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */

function EntryBlock({
  entry,
  label,
  meeting,
  fresh,
  readOnly,
  onEdit,
  onDelete,
  onMove,
}: {
  entry: MinuteEntry;
  label: string;
  meeting: Meeting;
  fresh: boolean;
  readOnly?: boolean;
  onEdit?: (id: string, patch: Partial<MinuteEntry>) => void;
  onDelete?: (id: string) => void;
  onMove?: (id: string, direction: -1 | 1) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(entry.title);
  const [body, setBody] = useState(entry.body);

  useEffect(() => {
    if (!editing) {
      setTitle(entry.title);
      setBody(entry.body);
    }
  }, [entry.title, entry.body, editing]);

  const commit = () => {
    const nextTitle = title.trim() || entry.title;
    const nextBody = body.trim();
    if (nextTitle !== entry.title || nextBody !== entry.body) {
      onEdit?.(entry.id, {title: nextTitle, body: nextBody, edited: true});
    }
    setEditing(false);
  };

  const vote = entry.motion?.vote;

  return (
    <div className={`entry ${fresh ? 'is-new' : ''}`} id={`entry-${entry.id}`}>
      <div className="entry-head">
        <span className="entry-no">{label}</span>
        {editing ? (
          <input
            className="input input-sm grow"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') setEditing(false);
            }}
            aria-label="Entry heading"
          />
        ) : (
          <span className="entry-title">{entry.title}</span>
        )}
        {entry.time && !editing && <span className="entry-time">{entry.time}</span>}
      </div>

      {editing ? (
        <div className="entry-edit">
          <textarea
            className="textarea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            aria-label="Entry text"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditing(false);
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit();
            }}
          />
          <div className="row gap-6" style={{marginTop: 7}}>
            <button className="btn btn-sm btn-primary" onClick={commit}>
              <IconCheck size={13} /> Save line
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setEditing(false)}>
              <IconX size={13} /> Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="entry-body">
          {entry.body && <p>{entry.body}</p>}
          {entry.motion && (
            <>
              <p className="entry-motion">{motionSentence(entry.motion)}</p>
              {vote && (
                <p className={`entry-vote ${vote.result === 'CARRIED' ? 'is-carried' : vote.result === 'FAILED' ? 'is-failed' : ''}`}>
                  {describeVote(vote, meeting.attendance)}
                </p>
              )}
            </>
          )}
          {entry.actionItems && entry.actionItems.length > 0 && (
            <ul className="entry-actions-list">
              {entry.actionItems.map((action) => (
                <li key={action.id}>
                  <strong>Action:</strong> {action.text}
                  {(action.ownerName || action.dueDate) && (
                    <span className="who">
                      {' '}
                      — {[action.ownerName, action.dueDate ? `due ${action.dueDate}` : ''].filter(Boolean).join(', ')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!readOnly && !editing && (
        <div className="entry-tools no-print">
          {onMove && (
            <>
              <button className="icon-btn" title="Move up" aria-label="Move entry up" onClick={() => onMove(entry.id, -1)}>
                <IconArrowUp size={13} />
              </button>
              <button className="icon-btn" title="Move down" aria-label="Move entry down" onClick={() => onMove(entry.id, 1)}>
                <IconArrowDown size={13} />
              </button>
            </>
          )}
          {onEdit && (
            <button className="icon-btn" title="Edit this line" aria-label="Edit entry" onClick={() => setEditing(true)}>
              <IconPencil size={13} />
            </button>
          )}
          {onDelete && (
            <button
              className="icon-btn is-danger"
              title="Remove this line"
              aria-label="Remove entry"
              onClick={() => onDelete(entry.id)}
            >
              <IconTrash size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
