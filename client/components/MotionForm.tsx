import {useEffect, useMemo, useState} from 'react';
import {api} from '../lib/api';
import {presentMembers, resolveVoteResult, tallyFromBallots, VOTE_METHOD_LABEL} from '../../shared/logic';
import {
  type AttendanceRecord,
  type Ballot,
  type Meeting,
  type Motion,
  type SectionKey,
  type Vote,
  type VoteMethod,
  type VoteResult,
} from '../../shared/types';
import {IconCheck, IconGavel, IconSparkle, IconUndo, IconX} from '../lib/icons';
import {useToast} from './ui';

const METHODS: VoteMethod[] = ['UNANIMOUS', 'VOICE', 'ROLL_CALL', 'CONSENT'];
const BALLOTS: {key: Ballot; label: string; cls: string}[] = [
  {key: 'AYE', label: 'Aye', cls: 'aye'},
  {key: 'NAY', label: 'Nay', cls: 'nay'},
  {key: 'ABSTAIN', label: 'Abst.', cls: 'abs'},
];

export interface RecordedMotion {
  title: string;
  discussion: string;
  motion: Motion;
  section: SectionKey;
}

export interface MotionDraft {
  title: string;
  text: string;
  section: SectionKey;
  discussion?: string;
}

export function MotionForm({
  meeting,
  draft,
  aiEnabled,
  onCancel,
  onRecord,
}: {
  meeting: Meeting;
  draft: MotionDraft;
  aiEnabled: boolean;
  onCancel: () => void;
  onRecord: (payload: RecordedMotion) => void;
}) {
  const voters = useMemo(() => presentMembers(meeting.attendance).filter((m) => m.voting), [meeting.attendance]);

  const [title, setTitle] = useState(draft.title);
  const [text, setText] = useState(draft.text);
  const [discussion, setDiscussion] = useState(draft.discussion ?? '');
  const [mover, setMover] = useState<AttendanceRecord | null>(null);
  const [seconder, setSeconder] = useState<AttendanceRecord | null>(null);
  const [method, setMethod] = useState<VoteMethod>('UNANIMOUS');
  const [ballots, setBallots] = useState<Record<string, Ballot>>({});
  const [ayes, setAyes] = useState(voters.length);
  const [nays, setNays] = useState(0);
  const [abstentions, setAbstentions] = useState(0);
  const [outcome, setOutcome] = useState<VoteResult | null>(null);
  const [polishing, setPolishing] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setTitle(draft.title);
    setText(draft.text);
    setDiscussion(draft.discussion ?? '');
  }, [draft]);

  useEffect(() => {
    if (method === 'UNANIMOUS' || method === 'CONSENT') {
      setAyes(voters.length);
      setNays(0);
      setAbstentions(0);
    }
    if (method === 'ROLL_CALL' && Object.keys(ballots).length === 0) {
      setBallots(Object.fromEntries(voters.map((v) => [v.memberId, 'AYE' as Ballot])));
    }
  }, [method, voters]); // eslint-disable-line react-hooks/exhaustive-deps

  const rollTally = useMemo(() => tallyFromBallots(ballots), [ballots]);
  const effective =
    method === 'ROLL_CALL'
      ? rollTally
      : {ayes, nays, abstentions, recusals: 0};

  const computedResult = resolveVoteResult({ayes: effective.ayes, nays: effective.nays, method});
  const result = outcome ?? computedResult;

  /** Click a director: first click sets the mover, second the seconder. */
  const pickMember = (member: AttendanceRecord) => {
    if (mover?.memberId === member.memberId) {
      setMover(seconder);
      setSeconder(null);
      return;
    }
    if (seconder?.memberId === member.memberId) {
      setSeconder(null);
      return;
    }
    if (!mover) setMover(member);
    else setSeconder(member);
  };

  const polish = async () => {
    if (!text.trim()) return;
    setPolishing(true);
    try {
      const polished = await api.polishMotion(text);
      setText(polished.text);
      if (!polished.aiAssisted) toast.info('Tidied locally — no AI key is configured.');
    } catch {
      toast.error('Could not reach the writing assistant.');
    } finally {
      setPolishing(false);
    }
  };

  const record = () => {
    if (!text.trim()) return;
    const vote: Vote = {
      method,
      ayes: effective.ayes,
      nays: effective.nays,
      abstentions: effective.abstentions,
      recusals: effective.recusals,
      perMember: method === 'ROLL_CALL' ? ballots : undefined,
      result,
    };
    onRecord({
      title: title.trim() || text.trim().slice(0, 70),
      discussion: discussion.trim(),
      section: draft.section,
      motion: {
        text: text.trim(),
        movedById: mover?.memberId,
        movedByName: mover ? `${mover.name}` : undefined,
        secondedById: seconder?.memberId,
        secondedByName: seconder ? `${seconder.name}` : undefined,
        vote,
      },
    });
  };

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">
            <IconGavel size={13} style={{verticalAlign: -2, marginRight: 6}} />
            Record a motion
          </div>
          <div className="card-sub">First director clicked is the mover, second is the seconder</div>
        </div>
        <button className="icon-btn" onClick={onCancel} aria-label="Cancel motion">
          <IconX size={15} />
        </button>
      </div>

      <div className="card-pad stack gap-14">
        <div className="field" style={{margin: 0}}>
          <label className="label" htmlFor="motion-text">
            The motion — completes “it was moved to…”
          </label>
          <textarea
            id="motion-text"
            className="textarea"
            rows={3}
            value={text}
            autoFocus
            placeholder="approve the Keystone Grounds proposal for 2027 landscape maintenance in an amount not to exceed $41,400 annually"
            onChange={(e) => setText(e.target.value)}
          />
          <div className="row gap-8" style={{marginTop: 6}}>
            <button className="btn btn-sm" onClick={polish} disabled={!text.trim() || polishing}>
              <IconSparkle size={13} /> {polishing ? 'Tidying…' : aiEnabled ? 'Tidy the wording' : 'Clean up'}
            </button>
            <span className="tiny muted right">Reads: “Upon motion duly made by … it was moved to …”</span>
          </div>
        </div>

        <div className="field" style={{margin: 0}}>
          <label className="label" htmlFor="motion-title">
            Heading in the minutes
          </label>
          <input
            id="motion-title"
            className="input"
            value={title}
            placeholder="2027 landscape maintenance contract"
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="field" style={{margin: 0}}>
          <label className="label" htmlFor="motion-discussion">
            Discussion before the vote (optional)
          </label>
          <textarea
            id="motion-discussion"
            className="textarea"
            rows={2}
            value={discussion}
            placeholder="What the Board considered — competing bids, concerns raised, conditions attached."
            onChange={(e) => setDiscussion(e.target.value)}
          />
        </div>

        <div>
          <div className="label" style={{marginBottom: 6, fontSize: 11, fontWeight: 650, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--ink-3)'}}>
            Moved and seconded
          </div>
          <div className="pick-slots">
            <span className={`pick-slot slot-1 ${mover ? 'is-set' : ''}`}>
              <span className="k">1st</span>
              {mover ? mover.name : 'Moved by — click a director'}
            </span>
            <span className={`pick-slot slot-2 ${seconder ? 'is-set' : ''}`}>
              <span className="k">2nd</span>
              {seconder ? seconder.name : 'Seconded by'}
            </span>
            {(mover || seconder) && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  setMover(null);
                  setSeconder(null);
                }}
              >
                <IconUndo size={12} /> Reset
              </button>
            )}
          </div>

          <div className="member-grid">
            {voters.map((member) => {
              const isMover = mover?.memberId === member.memberId;
              const isSeconder = seconder?.memberId === member.memberId;
              return (
                <button
                  type="button"
                  key={member.memberId}
                  className={`member-chip ${isMover ? 'is-mover' : ''} ${isSeconder ? 'is-seconder' : ''}`}
                  onClick={() => pickMember(member)}
                >
                  <span style={{minWidth: 0}}>
                    <span className="n truncate" style={{display: 'block'}}>
                      {member.name}
                    </span>
                    <span className="r">{member.role}</span>
                  </span>
                  {isMover && <span className="tag">1st</span>}
                  {isSeconder && <span className="tag">2nd</span>}
                </button>
              );
            })}
          </div>
          {voters.length === 0 && <div className="tiny muted">No voting directors are marked present.</div>}
        </div>

        <div>
          <div className="label" style={{marginBottom: 6, fontSize: 11, fontWeight: 650, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--ink-3)'}}>
            How the vote was taken
          </div>
          <div className="seg">
            {METHODS.map((m) => (
              <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)}>
                {VOTE_METHOD_LABEL[m]}
              </button>
            ))}
          </div>
        </div>

        {method === 'ROLL_CALL' && (
          <div>
            {voters.map((member) => (
              <div className="ballot-row" key={member.memberId}>
                <span className="grow truncate" style={{fontSize: 13}}>
                  {member.name}
                  <span className="muted small"> · {member.role}</span>
                </span>
                <span className="ballot-opts">
                  {BALLOTS.map((ballot) => (
                    <button
                      key={ballot.key}
                      type="button"
                      className={ballot.cls}
                      aria-pressed={ballots[member.memberId] === ballot.key}
                      onClick={() => setBallots((current) => ({...current, [member.memberId]: ballot.key}))}
                    >
                      {ballot.label}
                    </button>
                  ))}
                </span>
              </div>
            ))}
            <div className="tiny muted" style={{marginTop: 8}}>
              Tally: {rollTally.ayes} aye · {rollTally.nays} nay · {rollTally.abstentions} abstaining
            </div>
          </div>
        )}

        {method === 'VOICE' && (
          <div className="tally">
            <label>
              <span className="k">Ayes</span>
              <input className="input input-sm" type="number" min={0} max={voters.length} value={ayes} onChange={(e) => setAyes(Number(e.target.value))} />
            </label>
            <label>
              <span className="k">Nays</span>
              <input className="input input-sm" type="number" min={0} max={voters.length} value={nays} onChange={(e) => setNays(Number(e.target.value))} />
            </label>
            <label>
              <span className="k">Abstaining</span>
              <input className="input input-sm" type="number" min={0} max={voters.length} value={abstentions} onChange={(e) => setAbstentions(Number(e.target.value))} />
            </label>
          </div>
        )}

        <div>
          <div className="label" style={{marginBottom: 6, fontSize: 11, fontWeight: 650, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--ink-3)'}}>
            Outcome
          </div>
          <div className="seg">
            {(['CARRIED', 'FAILED', 'TABLED', 'WITHDRAWN'] as VoteResult[]).map((r) => (
              <button key={r} type="button" aria-pressed={result === r} onClick={() => setOutcome(r)}>
                {r === 'CARRIED' ? 'Carried' : r === 'FAILED' ? 'Failed' : r === 'TABLED' ? 'Tabled' : 'Withdrawn'}
              </button>
            ))}
          </div>
          {outcome === null && (
            <div className="tiny muted" style={{marginTop: 6}}>
              Set from the tally: <strong>{result === 'CARRIED' ? 'carried' : 'failed'}</strong> on {effective.ayes} to {effective.nays}. Override it above if the board ruled otherwise.
            </div>
          )}
        </div>

        <div className="row gap-8">
          <button className="btn btn-accent grow" onClick={record} disabled={!text.trim()}>
            <IconCheck size={14} /> Record in the minutes
          </button>
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
