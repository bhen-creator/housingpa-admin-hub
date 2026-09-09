import {useRef, useState} from 'react';
import {agendaFileUrl, api} from '../lib/api';
import type {Meeting} from '../../shared/types';
import {IconExternal, IconFile, IconTrash, IconUpload} from '../lib/icons';
import {useToast} from './ui';

const MAX_BYTES = 20 * 1024 * 1024;

/** Attaches the published agenda PDF to the meeting record. */
export function AgendaFileCard({meeting, onMeetingChange}: {meeting: Meeting; onMeetingChange: (m: Meeting) => void}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const upload = async (file: File) => {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('The agenda needs to be a PDF.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('That PDF is larger than 20 MB.');
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read that file'));
        reader.readAsDataURL(file);
      });
      onMeetingChange(await api.uploadAgendaFile(meeting.id, file.name, dataUrl));
      toast.ok('Agenda attached to this meeting.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    try {
      onMeetingChange(await api.removeAgendaFile(meeting.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove the agenda');
    }
  };

  if (meeting.agendaFile) {
    return (
      <div className="card card-pad">
        <div className="row gap-10">
          <span style={{color: 'var(--accent)'}}>
            <IconFile size={18} />
          </span>
          <div className="grow" style={{minWidth: 0}}>
            <div className="truncate" style={{fontSize: 13, fontWeight: 570}}>
              {meeting.agendaFile.name}
            </div>
            <div className="tiny muted">
              Published agenda · {Math.max(1, Math.round(meeting.agendaFile.size / 1024))} KB
            </div>
          </div>
          <a className="btn btn-sm" href={agendaFileUrl(meeting.id)} target="_blank" rel="noreferrer">
            <IconExternal size={13} /> Open
          </a>
          <button className="icon-btn is-danger" onClick={() => void remove()} aria-label="Remove the agenda">
            <IconTrash size={13} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer?.files?.[0];
          if (file) void upload(file);
        }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') input.current?.click();
        }}
        style={{
          padding: '14px 16px',
          borderRadius: 'var(--r-lg)',
          border: `1.5px dashed ${dragging ? 'var(--accent)' : 'var(--line-2)'}`,
          background: dragging ? 'var(--accent-soft)' : 'transparent',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 11,
        }}
      >
        <span style={{color: 'var(--ink-4)'}}>
          <IconUpload size={17} />
        </span>
        <div className="grow">
          <div style={{fontSize: 13, fontWeight: 570}}>{busy ? 'Uploading…' : 'Attach the published agenda'}</div>
          <div className="tiny muted">PDF, up to 20 MB. Kept with the meeting record.</div>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        style={{display: 'none'}}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
