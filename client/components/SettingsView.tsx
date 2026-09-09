import {useEffect, useMemo, useState} from 'react';
import {api} from '../lib/api';
import {newId, requiredQuorum, votingSeats} from '../../shared/logic';
import {BOARD_ROLES, type AccessCodeRow, type Association, type BoardMember} from '../../shared/types';
import {ConfirmDialog, Field, Modal, useToast} from './ui';
import {IconAlert, IconCheck, IconPlus, IconShield, IconTrash, IconUsers} from '../lib/icons';

type Tab = 'communities' | 'access' | 'about';

export function SettingsView({
  associations,
  isAdmin,
  brandName,
  version,
  startAddingCommunity = false,
  onClose,
  onAssociationsChanged,
}: {
  associations: Association[];
  isAdmin: boolean;
  brandName: string;
  version: string;
  /** Open straight into the new-community form (used on first run). */
  startAddingCommunity?: boolean;
  onClose: () => void;
  onAssociationsChanged: (next: Association[]) => void;
}) {
  const [tab, setTab] = useState<Tab>('communities');
  const [editing, setEditing] = useState<Association | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Association | null>(null);
  const toast = useToast();

  const makeBlank = (): Association => ({
    id: '',
    name: '',
    address: '',
    quorumRule: 'MAJORITY',
    members: [
      {id: newId('mem'), name: '', role: 'President', email: '', voting: true, active: true},
      {id: newId('mem'), name: '', role: 'Vice President', email: '', voting: true, active: true},
      {id: newId('mem'), name: '', role: 'Treasurer', email: '', voting: true, active: true},
      {id: newId('mem'), name: '', role: 'Secretary', email: '', voting: true, active: true},
    ],
    archived: false,
    createdAt: '',
    updatedAt: '',
  });

  useEffect(() => {
    if (startAddingCommunity) setEditing(makeBlank());
  }, [startAddingCommunity]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (assoc: Association) => {
    try {
      const saved = assoc.id ? await api.updateAssociation(assoc.id, assoc) : await api.createAssociation(assoc);
      onAssociationsChanged(
        assoc.id ? associations.map((a) => (a.id === saved.id ? saved : a)) : [...associations, saved],
      );
      setEditing(null);
      toast.ok(assoc.id ? 'Community updated.' : 'Community added.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    }
  };

  const remove = async (assoc: Association) => {
    try {
      const result = await api.deleteAssociation(assoc.id);
      onAssociationsChanged(associations.filter((a) => a.id !== assoc.id));
      setConfirmDelete(null);
      toast.ok(result.archived ? 'Community archived — its minutes are kept.' : 'Community removed.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove');
    }
  };

  return (
    <Modal title="Settings" onClose={onClose} wide>
      <div className="settings-layout" style={{minHeight: 420}}>
        <nav className="settings-nav">
          <button aria-current={tab === 'communities'} onClick={() => setTab('communities')}>
            Communities &amp; boards
          </button>
          {isAdmin && (
            <button aria-current={tab === 'access'} onClick={() => setTab('access')}>
              Access codes
            </button>
          )}
          <button aria-current={tab === 'about'} onClick={() => setTab('about')}>
            About
          </button>
        </nav>

        <div className="settings-body">
          {tab === 'communities' && (
            <>
              <div className="row gap-10" style={{marginBottom: 14}}>
                <div>
                  <div className="settings-section-title">Communities</div>
                  <div className="small muted">Each community keeps its own board roster, quorum rule and minutes.</div>
                </div>
                <button className="btn btn-primary right" onClick={() => setEditing(makeBlank())}>
                  <IconPlus size={14} /> Add community
                </button>
              </div>

              {associations.length === 0 ? (
                <div className="callout callout-info">
                  No communities yet. Add your first one to start recording minutes.
                </div>
              ) : (
                associations.map((assoc) => (
                  <div className="list-row" key={assoc.id}>
                    <div className="grow" style={{minWidth: 0}}>
                      <div style={{fontWeight: 600}}>{assoc.name}</div>
                      <div className="tiny muted truncate">
                        {assoc.address || 'No address on file'} · {votingSeats(assoc.members)} voting seats · quorum{' '}
                        {requiredQuorum(assoc)}
                      </div>
                    </div>
                    <button className="btn btn-sm" onClick={() => setEditing(assoc)}>
                      Edit
                    </button>
                    {isAdmin && (
                      <button className="icon-btn is-danger" onClick={() => setConfirmDelete(assoc)} aria-label={`Remove ${assoc.name}`}>
                        <IconTrash size={14} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </>
          )}

          {tab === 'access' && isAdmin && <AccessCodes />}

          {tab === 'about' && (
            <div className="stack gap-12">
              <div className="settings-section-title">{brandName}</div>
              <div className="small muted">Board meeting minutes · version {version}</div>
              <div className="callout callout-info">
                Minutes are stored on this server, not in your browser. Every change is saved as you make it, and a copy
                is kept locally so a dropped connection during a meeting never loses the record.
              </div>
              <div className="small">
                <strong>Keyboard:</strong> ⌘/Ctrl + Enter records the note you are typing. Esc closes a dialog.
              </div>
            </div>
          )}
        </div>
      </div>

      {editing && <AssociationEditor association={editing} onCancel={() => setEditing(null)} onSave={save} />}

      {confirmDelete && (
        <ConfirmDialog
          title={`Remove ${confirmDelete.name}?`}
          message="If this community has recorded minutes it will be archived rather than deleted, so the record is preserved."
          confirmLabel="Remove"
          tone="danger"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void remove(confirmDelete)}
        />
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

function AssociationEditor({
  association,
  onCancel,
  onSave,
}: {
  association: Association;
  onCancel: () => void;
  onSave: (assoc: Association) => void;
}) {
  const [draft, setDraft] = useState<Association>(association);
  const patch = (changes: Partial<Association>) => setDraft((current) => ({...current, ...changes}));

  const setMember = (id: string, changes: Partial<BoardMember>) =>
    patch({members: draft.members.map((m) => (m.id === id ? {...m, ...changes} : m))});

  const addMember = () =>
    patch({
      members: [...draft.members, {id: newId('mem'), name: '', role: 'Director', email: '', voting: true, active: true}],
    });

  const removeMember = (id: string) => patch({members: draft.members.filter((m) => m.id !== id)});

  const quorum = useMemo(() => requiredQuorum(draft), [draft]);
  const named = draft.members.filter((m) => m.name.trim());
  const valid = draft.name.trim().length > 0 && named.length > 0;

  return (
    <Modal
      title={association.id ? 'Edit community' : 'Add community'}
      onClose={onCancel}
      wide
      labelledBy="assoc-editor-title"
      footer={
        <>
          <span className="tiny muted right">
            {named.length} named seats · quorum {quorum}
          </span>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!valid}
            onClick={() => onSave({...draft, members: draft.members.filter((m) => m.name.trim())})}
          >
            <IconCheck size={14} /> Save
          </button>
        </>
      }
    >
      <Field label="Community name" htmlFor="assoc-name">
        <input
          id="assoc-name"
          className="input"
          value={draft.name}
          autoFocus
          placeholder="Willow Creek Homeowners Association"
          onChange={(e) => patch({name: e.target.value})}
        />
      </Field>

      <Field label="Address" htmlFor="assoc-address" hint="Printed on the minutes.">
        <input
          id="assoc-address"
          className="input"
          value={draft.address}
          placeholder="482 Willow Creek Drive, Blue Bell, PA 19422"
          onChange={(e) => patch({address: e.target.value})}
        />
      </Field>

      <div className="field-row">
        <Field label="Usual meeting location" htmlFor="assoc-loc">
          <input
            id="assoc-loc"
            className="input"
            value={draft.defaultLocation ?? ''}
            placeholder="Clubhouse community room"
            onChange={(e) => patch({defaultLocation: e.target.value})}
          />
        </Field>
        <Field label="Units" htmlFor="assoc-units">
          <input
            id="assoc-units"
            className="input"
            type="number"
            min={0}
            value={draft.unitCount ?? ''}
            onChange={(e) => patch({unitCount: e.target.value ? Number(e.target.value) : undefined})}
          />
        </Field>
      </div>

      <div className="field-row">
        <Field label="Quorum rule" htmlFor="assoc-quorum" hint={`Currently requires ${quorum} voting director(s).`}>
          <select
            id="assoc-quorum"
            className="select"
            value={draft.quorumRule}
            onChange={(e) => patch({quorumRule: e.target.value as Association['quorumRule']})}
          >
            <option value="MAJORITY">Majority of seated directors</option>
            <option value="TWO_THIRDS">Two thirds of seated directors</option>
            <option value="FIXED">A fixed number</option>
          </select>
        </Field>
        {draft.quorumRule === 'FIXED' && (
          <Field label="Directors required" htmlFor="assoc-quorum-n">
            <input
              id="assoc-quorum-n"
              className="input"
              type="number"
              min={1}
              value={draft.quorumFixed ?? 1}
              onChange={(e) => patch({quorumFixed: Number(e.target.value)})}
            />
          </Field>
        )}
      </div>

      <hr className="hr" />

      <div className="row gap-10" style={{marginBottom: 10}}>
        <div>
          <strong style={{fontSize: 13}}>
            <IconUsers size={13} style={{verticalAlign: -2, marginRight: 6}} />
            Board roster
          </strong>
          <div className="tiny muted">Untick “votes” for management staff and other non-voting attendees.</div>
        </div>
        <button className="btn btn-sm right" onClick={addMember}>
          <IconPlus size={13} /> Add seat
        </button>
      </div>

      {draft.members.map((member) => (
        <div key={member.id} className="list-row" style={{alignItems: 'flex-start', flexWrap: 'wrap'}}>
          <div style={{flex: '2 1 170px', minWidth: 0}}>
            <input
              className="input input-sm"
              value={member.name}
              placeholder="Full name"
              aria-label="Board member name"
              onChange={(e) => setMember(member.id, {name: e.target.value})}
            />
          </div>
          <div style={{flex: '1 1 130px'}}>
            <input
              className="input input-sm"
              list="board-roles"
              value={member.role}
              placeholder="Role"
              aria-label="Role"
              onChange={(e) => setMember(member.id, {role: e.target.value})}
            />
          </div>
          <div style={{flex: '2 1 180px'}}>
            <input
              className="input input-sm"
              type="email"
              value={member.email}
              placeholder="email@example.org"
              aria-label="Email"
              onChange={(e) => setMember(member.id, {email: e.target.value})}
            />
          </div>
          <label className="row gap-4 tiny" style={{whiteSpace: 'nowrap', paddingTop: 6}}>
            <input type="checkbox" checked={member.voting} onChange={(e) => setMember(member.id, {voting: e.target.checked})} />
            votes
          </label>
          <button className="icon-btn is-danger" onClick={() => removeMember(member.id)} aria-label={`Remove ${member.name || 'seat'}`}>
            <IconTrash size={13} />
          </button>
        </div>
      ))}
      <datalist id="board-roles">
        {BOARD_ROLES.map((role) => (
          <option key={role} value={role} />
        ))}
      </datalist>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

function AccessCodes() {
  const [codes, setCodes] = useState<AccessCodeRow[]>([]);
  const [label, setLabel] = useState('');
  const [code, setCode] = useState('');
  const [role, setRole] = useState<'admin' | 'manager'>('manager');
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const load = () =>
    api
      .accessCodes()
      .then(setCodes)
      .catch(() => toast.error('Could not load access codes'))
      .finally(() => setLoading(false));

  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    try {
      await api.createAccessCode({label: label.trim(), code: code.trim(), role});
      setLabel('');
      setCode('');
      await load();
      toast.ok('Access code created. Share it with that person directly — it cannot be shown again.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create code');
    }
  };

  return (
    <div>
      <div className="settings-section-title">Access codes</div>
      <div className="small muted" style={{marginBottom: 14}}>
        Everyone who records minutes signs in with a code. Give each person their own so you can revoke one without
        disturbing the rest.
      </div>

      <div className="callout callout-warn row gap-8" style={{marginBottom: 14}}>
        <IconAlert size={15} />
        <span className="tiny">Codes are stored hashed and are never shown again after they are created.</span>
      </div>

      <div className="card card-pad" style={{marginBottom: 16}}>
        <div className="field-row">
          <Field label="Who is it for" htmlFor="code-label">
            <input id="code-label" className="input" value={label} placeholder="Dana — portfolio manager" onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field label="Role" htmlFor="code-role">
            <select id="code-role" className="select" value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'manager')}>
              <option value="manager">Manager — records minutes</option>
              <option value="admin">Administrator — also manages settings</option>
            </select>
          </Field>
        </div>
        <Field label="Access code" htmlFor="code-value" hint="At least 8 characters. A memorable passphrase works well.">
          <input id="code-value" className="input" value={code} placeholder="willow-creek-2026" onChange={(e) => setCode(e.target.value)} />
        </Field>
        <button className="btn btn-primary" onClick={create} disabled={!label.trim() || code.trim().length < 8}>
          <IconPlus size={14} /> Create code
        </button>
      </div>

      {loading ? (
        <div className="tiny muted">Loading…</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Role</th>
              <th>Last used</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {codes.map((row) => (
              <tr key={row.id}>
                <td>
                  <div style={{fontWeight: 550}}>{row.label}</div>
                  {row.disabled && <span className="pill pill-danger">disabled</span>}
                </td>
                <td>
                  <span className="pill">
                    {row.role === 'admin' && <IconShield size={11} />} {row.role}
                  </span>
                </td>
                <td className="tiny muted">{row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleDateString() : 'never'}</td>
                <td style={{textAlign: 'right', whiteSpace: 'nowrap'}}>
                  <button
                    className="btn btn-sm"
                    onClick={async () => {
                      try {
                        await api.setAccessCodeDisabled(row.id, !row.disabled);
                        await load();
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : 'Could not update');
                      }
                    }}
                  >
                    {row.disabled ? 'Enable' : 'Disable'}
                  </button>{' '}
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={async () => {
                      try {
                        await api.deleteAccessCode(row.id);
                        await load();
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : 'Could not delete');
                      }
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
