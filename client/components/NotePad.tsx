import {useState} from 'react';
import {api} from '../lib/api';
import {presentMembers} from '../../shared/logic';
import {formatNoteLocally} from '../../shared/notes';
import type {FormattedNote, Meeting, SectionKey} from '../../shared/types';
import {IconMic, IconSend, IconSparkle} from '../lib/icons';
import {useToast} from './ui';

/**
 * Freeform note capture. Shorthand goes in; a minute paragraph comes out,
 * either through the AI helper or the deterministic local formatter.
 */
export function NotePad({
  meeting,
  section,
  agendaItem,
  aiEnabled,
  onRecord,
}: {
  meeting: Meeting;
  section: SectionKey;
  agendaItem?: string;
  aiEnabled: boolean;
  onRecord: (note: FormattedNote, useSuggestedSection: boolean) => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const submit = async (withAssist: boolean) => {
    const raw = text.trim();
    if (!raw || busy) return;

    if (!withAssist) {
      onRecord(formatNoteLocally(raw, section), false);
      setText('');
      return;
    }

    setBusy(true);
    try {
      const note = await api.formatNote({
        text: raw,
        associationName: meeting.associationName,
        agendaItem,
        section,
        attendees: presentMembers(meeting.attendance).map((m) => `${m.name} (${m.role})`),
      });
      onRecord(note, true);
      setText('');
    } catch {
      toast.error('Could not format that note — recorded as typed.');
      onRecord(formatNoteLocally(raw, section), false);
      setText('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">
            <IconMic size={13} style={{verticalAlign: -2, marginRight: 6}} />
            Notes as they happen
          </div>
          <div className="card-sub">
            {agendaItem ? `Filing under: ${agendaItem}` : 'Type shorthand — it becomes a minute paragraph'}
          </div>
        </div>
      </div>

      <div className="card-pad">
        <textarea
          className="textarea"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="treasurer says operating acct 84k, reserves 312k, 11 accts delinquent, 3 sent to counsel"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit(true);
            }
          }}
          aria-label="Meeting note"
        />

        <div className="notepad-bar">
          <span className="tiny muted desktop-only">⌘/Ctrl + Enter to record</span>
          <div className="row gap-6 right">
            <button className="btn btn-sm" onClick={() => void submit(false)} disabled={!text.trim() || busy}>
              As typed
            </button>
            <button className="btn btn-sm btn-accent" onClick={() => void submit(true)} disabled={!text.trim() || busy}>
              {busy ? <IconSparkle size={13} className="spin" /> : aiEnabled ? <IconSparkle size={13} /> : <IconSend size={13} />}
              {busy ? 'Writing…' : aiEnabled ? 'Write it up' : 'Record'}
            </button>
          </div>
        </div>

        {!aiEnabled && (
          <div className="tiny muted" style={{marginTop: 8}}>
            No AI key configured — notes are tidied with the built-in formatter. Add GEMINI_API_KEY to enable full rewriting.
          </div>
        )}
      </div>
    </div>
  );
}
