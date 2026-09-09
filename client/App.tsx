import {useCallback, useEffect, useMemo, useState} from 'react';
import {api, pdfUrl} from './lib/api';
import {reorderEntry} from './lib/entries';
import {readBackup, useClock, useMeetingStore} from './lib/useMeeting';
import {ArchiveView} from './components/ArchiveView';
import {ControlPane} from './components/ControlPane';
import {MinutesSheet} from './components/MinutesSheet';
import {SettingsView} from './components/SettingsView';
import {ShareDialog} from './components/ShareDialog';
import {SignIn} from './components/SignIn';
import {ConfirmDialog, useToast} from './components/ui';
import {longDate, todayIso} from '../shared/logic';
import {MEETING_TYPES, MEETING_TYPE_LABEL, type AppConfig, type Association, type Meeting, type MinuteEntry, type SessionInfo} from '../shared/types';
import {
  IconAlert,
  IconArchive,
  IconCheck,
  IconDownload,
  IconFile,
  IconLogOut,
  IconPlus,
  IconRefresh,
  IconSettings,
  IconShield,
  IconUndo,
} from './lib/icons';

type Pane = 'doc' | 'ctrl';

export function App({config}: {config: AppConfig}) {
  const toast = useToast();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [associations, setAssociations] = useState<Association[]>([]);
  const [associationId, setAssociationId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [pane, setPane] = useState<Pane>('ctrl');

  const [showSettings, setShowSettings] = useState<false | 'plain' | 'add-community'>(false);
  const [showArchive, setShowArchive] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [newMeeting, setNewMeeting] = useState(false);
  const [undoEntry, setUndoEntry] = useState<MinuteEntry | null>(null);
  const [pendingRecovery, setPendingRecovery] = useState<{server: Meeting; local: Meeting} | null>(null);

  const store = useMeetingStore();
  const {meeting} = store;
  const now = useClock(meeting?.status === 'DRAFT' || meeting?.status === 'IN_SESSION');

  /* --- bootstrap -------------------------------------------------------- */

  useEffect(() => {
    api
      .session()
      .then(setSession)
      .catch(() => setSession({authenticated: false}))
      .finally(() => setLoading(false));
  }, []);

  const loadAssociations = useCallback(async () => {
    const list = await api.associations();
    setAssociations(list);
    setAssociationId((current) => current || list[0]?.id || '');
    return list;
  }, []);

  useEffect(() => {
    if (!session?.authenticated) return;
    loadAssociations().catch(() => toast.error('Could not load your communities'));
  }, [session?.authenticated, loadAssociations]); // eslint-disable-line react-hooks/exhaustive-deps

  // Whenever the selected community changes, pick up its open meeting.
  useEffect(() => {
    if (!session?.authenticated || !associationId) {
      store.setMeeting(null);
      return;
    }
    let cancelled = false;
    api
      .openMeeting(associationId)
      .then((open) => {
        if (cancelled) return;
        const server = open && open.id ? open : null;
        if (!server) {
          store.setMeeting(null);
          return;
        }
        // A local copy that is newer than the server's means an earlier save
        // never landed - most likely the connection dropped mid-meeting.
        const local = readBackup(server.id);
        if (local && new Date(local.updatedAt).getTime() > new Date(server.updatedAt).getTime()) {
          setPendingRecovery({server, local});
        } else {
          store.setMeeting(server);
        }
      })
      .catch(() => {
        if (!cancelled) store.setMeeting(null);
      });
    return () => {
      cancelled = true;
    };
  }, [associationId, session?.authenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  const association = useMemo(() => associations.find((a) => a.id === associationId) ?? null, [associations, associationId]);

  /* --- actions ---------------------------------------------------------- */

  const startMeeting = async (options: {type: Meeting['type']; date: string; scheduledTime: string; location: string}) => {
    if (!associationId) return;
    try {
      const created = await api.createMeeting({associationId, ...options});
      store.setMeeting(created);
      setNewMeeting(false);
      setPane('ctrl');
      toast.ok('Meeting created. Take the roll, then call it to order.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start the meeting');
    }
  };

  const openMeeting = async (id: string) => {
    try {
      await store.saveNow();
      const loaded = await api.meeting(id);
      store.setMeeting(loaded);
      setAssociationId(loaded.associationId);
      setShowArchive(false);
      setPane('doc');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open that meeting');
    }
  };

  const editEntry = (id: string, patch: Partial<MinuteEntry>) =>
    store.update((current) => ({
      ...current,
      entries: current.entries.map((e) => (e.id === id ? {...e, ...patch} : e)),
    }));

  const deleteEntry = (id: string) =>
    store.update((current) => {
      const removed = current.entries.find((e) => e.id === id) ?? null;
      setUndoEntry(removed);
      return {...current, entries: current.entries.filter((e) => e.id !== id)};
    });

  const restoreEntry = () => {
    const entry = undoEntry;
    if (!entry) return;
    setUndoEntry(null);
    store.update((current) => ({...current, entries: [...current.entries, entry]}));
  };

  const moveEntry = (id: string, direction: -1 | 1) => store.update((current) => reorderEntry(current, id, direction));

  const signOut = async () => {
    await store.saveNow();
    await api.signOut().catch(() => undefined);
    setSession({authenticated: false});
    store.setMeeting(null);
  };

  /* --- render ----------------------------------------------------------- */

  if (loading) {
    return (
      <div style={{display: 'grid', placeItems: 'center', height: '100%'}}>
        <div className="small muted">Loading…</div>
      </div>
    );
  }

  if (!session?.authenticated) {
    return <SignIn config={config} onSignedIn={() => api.session().then(setSession)} />;
  }

  const isAdmin = session.role === 'admin';

  return (
    <div className="app">
      <header className="topbar no-print">
        <div className="topbar-brand">
          <div className="topbar-mark">{config.brandShort.slice(0, 3)}</div>
          <div className="desktop-only">
            <div className="topbar-name">{config.brandTagline}</div>
            <div className="topbar-tag">{config.brandName}</div>
          </div>
        </div>

        <div className="topbar-sep desktop-only" />

        <select
          className="assoc-select"
          value={associationId}
          disabled={meeting?.status === 'IN_SESSION'}
          title={meeting?.status === 'IN_SESSION' ? 'Finish the meeting in progress before switching' : 'Choose a community'}
          onChange={(e) => setAssociationId(e.target.value)}
          aria-label="Community"
        >
          {associations.length === 0 && <option value="">No communities yet</option>}
          {associations.map((assoc) => (
            <option key={assoc.id} value={assoc.id}>
              {assoc.name}
            </option>
          ))}
        </select>

        {meeting && (
          <span className={`status-chip status-${meeting.status} desktop-only`}>
            {meeting.status === 'IN_SESSION' && <span className="dot" />}
            {meeting.status === 'DRAFT'
              ? 'Not started'
              : meeting.status === 'IN_SESSION'
                ? 'In session'
                : meeting.status === 'ADJOURNED'
                  ? 'Adjourned'
                  : 'Final'}
          </span>
        )}

        <div className="row gap-8 right">
          <SaveIndicator state={store.saveState} lastSavedAt={store.lastSavedAt} onRetry={() => void store.saveNow()} />

          <div className="tabs mobile-only" role="group" aria-label="View">
            <button aria-pressed={pane === 'doc'} onClick={() => setPane('doc')}>
              Minutes
            </button>
            <button aria-pressed={pane === 'ctrl'} onClick={() => setPane('ctrl')}>
              Meeting
            </button>
          </div>

          <button className="topbar-btn desktop-only" onClick={() => setShowArchive(true)} title="Past meetings">
            <IconArchive size={14} />
            <span className="desktop-only">Past meetings</span>
          </button>
          <button className="topbar-btn" onClick={() => setShowSettings('plain')} title="Settings">
            <IconSettings size={14} />
            <span className="desktop-only">Settings</span>
          </button>
          <button className="topbar-btn" onClick={signOut} title={`Signed in as ${session.label ?? 'user'}`}>
            <IconLogOut size={14} />
          </button>
        </div>
      </header>

      {associations.length === 0 ? (
        <FirstRun onOpenSettings={() => setShowSettings('add-community')} />
      ) : !meeting ? (
        <NoMeeting association={association} onStart={() => setNewMeeting(true)} onBrowse={() => setShowArchive(true)} />
      ) : (
        <div className="split">
          <section className="pane-doc" data-hidden={pane !== 'doc'} aria-label="Minutes document">
            <div className="pane-bar no-print">
              <span className={`pill ${meeting.status === 'IN_SESSION' ? 'pill-live' : ''}`}>
                {meeting.status === 'IN_SESSION' && <span className="dot" />}
                {meeting.status === 'IN_SESSION' ? 'Recording live' : meeting.status === 'FINALIZED' ? 'Approved minutes' : 'Draft minutes'}
              </span>
              <span className="tiny muted desktop-only">
                {meeting.entries.length} {meeting.entries.length === 1 ? 'line' : 'lines'}
              </span>
              <div className="row gap-6 right">
                {undoEntry && (
                  <button className="btn btn-sm" onClick={restoreEntry}>
                    <IconUndo size={13} /> Undo delete
                  </button>
                )}
                <a className="btn btn-sm" href={pdfUrl(meeting.id, true)} download>
                  <IconDownload size={13} />
                  <span className="desktop-only">PDF</span>
                </a>
                <button className="btn btn-sm btn-primary" onClick={() => setShowShare(true)}>
                  <IconFile size={13} />
                  <span className="desktop-only">Review &amp; send</span>
                </button>
              </div>
            </div>
            <div className="pane-scroll">
              <div className="doc-scroll">
                <MinutesSheet
                  meeting={meeting}
                  brandName={config.brandName}
                  readOnly={meeting.status === 'FINALIZED'}
                  onEditEntry={meeting.status === 'FINALIZED' ? undefined : editEntry}
                  onDeleteEntry={meeting.status === 'FINALIZED' ? undefined : deleteEntry}
                  onMoveEntry={meeting.status === 'FINALIZED' ? undefined : moveEntry}
                />
              </div>
            </div>
          </section>

          <section className="pane-ctrl no-print" data-hidden={pane !== 'ctrl'} aria-label="Meeting controls">
            <div className="pane-bar">
              <strong style={{fontSize: 12.5}}>{MEETING_TYPE_LABEL[meeting.type].replace(' of the Board of Directors', '')}</strong>
              <span className="tiny muted">{longDate(meeting.date)}</span>
              <button className="btn btn-sm btn-ghost right" onClick={() => setNewMeeting(true)}>
                <IconPlus size={13} /> New meeting
              </button>
            </div>
            <div className="pane-scroll">
              <ControlPane
                meeting={meeting}
                aiEnabled={config.aiEnabled}
                now={now}
                onUpdate={store.update}
                onReplace={(next) => store.adopt(next)}
                onOpenShare={() => setShowShare(true)}
              />
            </div>
          </section>
        </div>
      )}

      {newMeeting && association && (
        <NewMeetingDialog
          association={association}
          hasOpenMeeting={Boolean(meeting && meeting.status !== 'FINALIZED' && meeting.status !== 'ADJOURNED')}
          onCancel={() => setNewMeeting(false)}
          onCreate={startMeeting}
        />
      )}

      {showShare && meeting && (
        <ShareDialog
          meeting={meeting}
          config={config}
          isAdmin={isAdmin}
          onClose={() => setShowShare(false)}
          onMeetingChange={(next) => store.adopt(next)}
        />
      )}

      {showSettings && (
        <SettingsView
          associations={associations}
          isAdmin={isAdmin}
          brandName={config.brandName}
          version={config.version}
          startAddingCommunity={showSettings === 'add-community'}
          onClose={() => setShowSettings(false)}
          onAssociationsChanged={(next) => {
            setAssociations(next);
            if (!next.some((a) => a.id === associationId)) setAssociationId(next[0]?.id ?? '');
          }}
        />
      )}

      {pendingRecovery && (
        <ConfirmDialog
          title="Unsaved work from this device"
          confirmLabel="Restore the newer copy"
          onCancel={() => {
            store.setMeeting(pendingRecovery.server);
            setPendingRecovery(null);
          }}
          onConfirm={() => {
            const {local} = pendingRecovery;
            store.setMeeting(local);
            // Push it straight back to the server.
            store.update((current) => ({...current}));
            setPendingRecovery(null);
            toast.ok('Restored and saved.');
          }}
          message={
            <>
              This browser has a copy of these minutes with{' '}
              <strong>{pendingRecovery.local.entries.length} lines</strong>, while the server has{' '}
              <strong>{pendingRecovery.server.entries.length}</strong>. That usually means the connection dropped
              during the meeting before the last changes were saved.
              <div className="callout callout-info" style={{marginTop: 12}}>
                Restoring replaces the server copy with this browser&apos;s. Discarding keeps the server copy.
              </div>
            </>
          }
        />
      )}

      {showArchive && (
        <ArchiveView
          associations={associations}
          currentAssociationId={associationId || null}
          onOpen={(id) => void openMeeting(id)}
          onClose={() => setShowArchive(false)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SaveIndicator({
  state,
  lastSavedAt,
  onRetry,
}: {
  state: ReturnType<typeof useMeetingStore>['saveState'];
  lastSavedAt: Date | null;
  onRetry: () => void;
}) {
  if (state === 'idle') return null;

  if (state === 'offline' || state === 'error') {
    return (
      <button className="topbar-btn" style={{background: 'rgba(239,68,68,.25)', borderColor: 'rgba(248,113,113,.4)'}} onClick={onRetry}>
        <IconAlert size={13} />
        <span className="desktop-only">{state === 'offline' ? 'Offline — saved locally' : 'Save failed — retry'}</span>
      </button>
    );
  }

  return (
    <span className="save-state" style={{color: '#94a3b8'}} title={lastSavedAt ? `Last saved ${lastSavedAt.toLocaleTimeString()}` : undefined}>
      {state === 'saving' ? (
        <>
          <IconRefresh size={12} className="spin" /> <span className="desktop-only">Saving…</span>
        </>
      ) : state === 'dirty' ? (
        <span className="desktop-only">Unsaved…</span>
      ) : (
        <>
          <IconCheck size={12} /> <span className="desktop-only">Saved</span>
        </>
      )}
    </span>
  );
}

function FirstRun({onOpenSettings}: {onOpenSettings: () => void}) {
  return (
    <div style={{display: 'grid', placeItems: 'center', flex: 1, padding: 24}}>
      <div className="card card-pad" style={{maxWidth: 460, textAlign: 'center'}}>
        <div style={{color: 'var(--ink-4)', marginBottom: 10}}>
          <IconShield size={26} />
        </div>
        <h2 style={{fontSize: 17, fontWeight: 650, marginBottom: 6}}>Add your first community</h2>
        <p className="small muted" style={{marginBottom: 18}}>
          Enter the association name, its board roster and the quorum its bylaws require. You only do this once per
          community — after that, starting a meeting takes one click.
        </p>
        <button className="btn btn-primary btn-lg" onClick={onOpenSettings}>
          <IconPlus size={15} /> Add a community
        </button>
      </div>
    </div>
  );
}

function NoMeeting({
  association,
  onStart,
  onBrowse,
}: {
  association: Association | null;
  onStart: () => void;
  onBrowse: () => void;
}) {
  return (
    <div style={{display: 'grid', placeItems: 'center', flex: 1, padding: 24}}>
      <div className="card card-pad" style={{maxWidth: 460, textAlign: 'center'}}>
        <h2 style={{fontSize: 17, fontWeight: 650, marginBottom: 6}}>{association?.name ?? 'No community selected'}</h2>
        <p className="small muted" style={{marginBottom: 18}}>
          No meeting is open. Start one and the minutes document builds itself as you go.
        </p>
        <div className="row gap-8" style={{justifyContent: 'center'}}>
          <button className="btn btn-accent btn-lg" onClick={onStart} disabled={!association}>
            <IconPlus size={15} /> Start a meeting
          </button>
          <button className="btn btn-lg" onClick={onBrowse}>
            <IconArchive size={15} /> Past meetings
          </button>
        </div>
      </div>
    </div>
  );
}

function NewMeetingDialog({
  association,
  hasOpenMeeting,
  onCancel,
  onCreate,
}: {
  association: Association;
  hasOpenMeeting: boolean;
  onCancel: () => void;
  onCreate: (options: {type: Meeting['type']; date: string; scheduledTime: string; location: string}) => void;
}) {
  const [type, setType] = useState<Meeting['type']>('REGULAR');
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState('7:00 PM');
  const [location, setLocation] = useState(association.defaultLocation ?? '');

  return (
    <ConfirmDialog
      title="Start a meeting"
      confirmLabel="Create meeting"
      onCancel={onCancel}
      onConfirm={() => onCreate({type, date, scheduledTime: time, location})}
      message={
        <div className="stack gap-10" style={{textAlign: 'left'}}>
          {hasOpenMeeting && (
            <div className="callout callout-warn tiny">
              The meeting currently open stays saved — you can reopen it from Past meetings.
            </div>
          )}
          <label className="field" style={{margin: 0}}>
            <span className="label">Meeting type</span>
            <select className="select" value={type} onChange={(e) => setType(e.target.value as Meeting['type'])}>
              {MEETING_TYPES.map((t) => (
                <option key={t} value={t}>
                  {MEETING_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <div className="field-row">
            <label className="field" style={{margin: 0}}>
              <span className="label">Date</span>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field" style={{margin: 0}}>
              <span className="label">Scheduled time</span>
              <input className="input" value={time} onChange={(e) => setTime(e.target.value)} placeholder="7:00 PM" />
            </label>
          </div>
          <label className="field" style={{margin: 0}}>
            <span className="label">Location</span>
            <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Clubhouse community room" />
          </label>
        </div>
      }
    />
  );
}
