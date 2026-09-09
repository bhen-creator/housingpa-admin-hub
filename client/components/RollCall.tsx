import {useState} from 'react';
import {clockTime, countPresent, hasQuorum} from '../../shared/logic';
import type {AttendanceStatus, Guest, Meeting} from '../../shared/types';
import {IconCheck, IconPlus, IconShield, IconTrash, IconUsers} from '../lib/icons';

const STATUSES: {key: AttendanceStatus; label: string; short: string}[] = [
  {key: 'PRESENT', label: 'Present', short: 'In'},
  {key: 'REMOTE', label: 'Remote', short: 'Remote'},
  {key: 'ABSENT', label: 'Absent', short: 'Out'},
];

export function RollCall({
  meeting,
  onSetStatus,
  onAddGuest,
  onRemoveGuest,
  compact,
}: {
  meeting: Meeting;
  onSetStatus: (memberId: string, status: AttendanceStatus) => void;
  onAddGuest: (guest: Guest) => void;
  onRemoveGuest: (id: string) => void;
  compact?: boolean;
}) {
  const [guestName, setGuestName] = useState('');
  const [guestAffiliation, setGuestAffiliation] = useState('');
  const [showGuestForm, setShowGuestForm] = useState(false);

  const quorumOk = hasQuorum(meeting);
  const presentCount = countPresent(meeting.attendance);
  const inSession = meeting.status === 'IN_SESSION';

  const addGuest = () => {
    const name = guestName.trim();
    if (!name) return;
    onAddGuest({
      id: `gst_${Date.now().toString(36)}`,
      name,
      affiliation: guestAffiliation.trim() || undefined,
      kind: 'GUEST',
    });
    setGuestName('');
    setGuestAffiliation('');
    setShowGuestForm(false);
  };

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">
            <IconUsers size={13} style={{verticalAlign: -2, marginRight: 6}} />
            Roll call
          </div>
          {!compact && <div className="card-sub">Tap a director to change how they are recorded</div>}
        </div>
        <span className={`pill ${quorumOk ? 'pill-ok' : 'pill-warn'}`}>
          {presentCount} present · {meeting.quorumRequired} needed
        </span>
      </div>

      <div className="card-pad stack gap-10">
        <div className={`quorum-bar ${quorumOk ? 'is-ok' : 'is-bad'}`}>
          <IconShield size={16} />
          <span>
            {quorumOk
              ? 'Quorum established — the Board may transact business.'
              : `Quorum not met. ${meeting.quorumRequired - presentCount} more voting director${meeting.quorumRequired - presentCount === 1 ? '' : 's'} needed.`}
          </span>
        </div>

        <div className="roster">
          {meeting.attendance.map((record) => (
            <div className="roster-row" key={record.memberId}>
              <div className="grow" style={{minWidth: 0}}>
                <div className="roster-name truncate">{record.name}</div>
                <div className="roster-role truncate">
                  {record.role}
                  {!record.voting && ' · non-voting'}
                  {record.arrivedAt && ` · arrived ${record.arrivedAt}`}
                </div>
              </div>
              <div className="att-toggle" role="group" aria-label={`Attendance for ${record.name}`}>
                {STATUSES.map((status) => (
                  <button
                    key={status.key}
                    type="button"
                    className={status.key === 'ABSENT' ? 'is-absent' : ''}
                    aria-pressed={record.status === status.key}
                    title={status.label}
                    onClick={() => onSetStatus(record.memberId, status.key)}
                  >
                    {status.short}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {meeting.guests.length > 0 && (
          <div className="stack gap-6">
            <div className="tiny muted" style={{fontWeight: 650, letterSpacing: '.04em', textTransform: 'uppercase'}}>
              Also present
            </div>
            {meeting.guests.map((guest) => (
              <div className="row gap-8" key={guest.id} style={{fontSize: 13}}>
                <span className="grow truncate">
                  {guest.name}
                  {guest.affiliation && <span className="muted"> · {guest.affiliation}</span>}
                </span>
                <button className="icon-btn is-danger" onClick={() => onRemoveGuest(guest.id)} aria-label={`Remove ${guest.name}`}>
                  <IconTrash size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {showGuestForm ? (
          <div className="stack gap-8">
            <input
              className="input input-sm"
              placeholder="Name"
              value={guestName}
              autoFocus
              onChange={(e) => setGuestName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addGuest()}
              aria-label="Guest name"
            />
            <input
              className="input input-sm"
              placeholder="Affiliation (optional) — e.g. homeowner, Unit 204"
              value={guestAffiliation}
              onChange={(e) => setGuestAffiliation(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addGuest()}
              aria-label="Guest affiliation"
            />
            <div className="row gap-6">
              <button className="btn btn-sm btn-primary" onClick={addGuest} disabled={!guestName.trim()}>
                <IconCheck size={13} /> Add
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => setShowGuestForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="btn btn-sm" onClick={() => setShowGuestForm(true)}>
            <IconPlus size={13} /> Add a guest, vendor or homeowner
          </button>
        )}

        {inSession && (
          <div className="tiny muted">
            Changing attendance now records the time ({clockTime()}) so late arrivals appear correctly in the minutes.
          </div>
        )}
      </div>
    </div>
  );
}
