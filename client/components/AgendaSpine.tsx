import {useState} from 'react';
import {newId, sortAgenda} from '../../shared/logic';
import {SECTIONS, SECTION_LABEL, SECTION_SHORT, type AgendaItem, type Meeting, type SectionKey} from '../../shared/types';
import {IconCheck, IconList, IconPlus, IconTrash, IconX} from '../lib/icons';

/**
 * The agenda is the spine of the meeting: whichever item is active decides
 * which section new entries are filed under, so the document organises itself.
 */
export function AgendaSpine({
  meeting,
  activeItemId,
  onSelect,
  onChange,
  editable = true,
}: {
  meeting: Meeting;
  activeItemId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (agenda: AgendaItem[]) => void;
  editable?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftSection, setDraftSection] = useState<SectionKey>('NEW_BUSINESS');
  const [managing, setManaging] = useState(false);

  const items = sortAgenda(meeting.agenda);
  const done = items.filter((i) => i.status === 'DONE').length;

  const addItem = () => {
    const title = draftTitle.trim();
    if (!title) return;
    const maxOrder = items.reduce((max, i) => Math.max(max, i.order), 0);
    onChange([...meeting.agenda, {id: newId('ag'), section: draftSection, title, order: maxOrder + 1, status: 'PENDING'}]);
    setDraftTitle('');
    setAdding(false);
  };

  const removeItem = (id: string) => onChange(meeting.agenda.filter((i) => i.id !== id));

  const toggleDone = (item: AgendaItem) =>
    onChange(meeting.agenda.map((i) => (i.id === item.id ? {...i, status: i.status === 'DONE' ? 'PENDING' : 'DONE'} : i)));

  // Group the list under its section headings.
  const grouped = SECTIONS.map((section) => ({section, items: items.filter((i) => i.section === section)})).filter(
    (g) => g.items.length > 0,
  );

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">
            <IconList size={13} style={{verticalAlign: -2, marginRight: 6}} />
            Agenda
          </div>
          <div className="card-sub">
            {items.length === 0
              ? 'No items yet'
              : `${done} of ${items.length} covered · the selected item files new entries`}
          </div>
        </div>
        {editable && (
          <button className="btn btn-sm btn-ghost" onClick={() => setManaging((v) => !v)}>
            {managing ? 'Done' : 'Edit'}
          </button>
        )}
      </div>

      <div style={{padding: '6px 5px 10px'}}>
        {grouped.length === 0 && (
          <div className="tiny muted" style={{padding: '10px 12px'}}>
            Add the items from your published agenda so the minutes follow the same order.
          </div>
        )}

        {grouped.map((group) => (
          <div key={group.section}>
            <div className="agenda-group-label">{SECTION_SHORT[group.section]}</div>
            <ul className="agenda-list">
              {group.items.map((item) => {
                const isActive = item.id === activeItemId;
                return (
                  <li key={item.id} className="row" style={{gap: 2}}>
                    <button
                      type="button"
                      className={`agenda-item ${isActive ? 'is-active' : ''} ${item.status === 'DONE' ? 'is-done' : ''}`}
                      onClick={() => onSelect(isActive ? null : item.id)}
                      aria-pressed={isActive}
                      title={SECTION_LABEL[item.section]}
                    >
                      <span
                        className="agenda-mark"
                        onClick={(e) => {
                          if (!editable) return;
                          e.stopPropagation();
                          toggleDone(item);
                        }}
                        role={editable ? 'button' : undefined}
                        aria-label={item.status === 'DONE' ? 'Mark as not covered' : 'Mark as covered'}
                      >
                        {item.status === 'DONE' && <IconCheck size={10} />}
                      </span>
                      <span className="grow">
                        <span className="agenda-title">{item.title}</span>
                      </span>
                    </button>
                    {managing && (
                      <button className="icon-btn is-danger" onClick={() => removeItem(item.id)} aria-label={`Remove ${item.title}`}>
                        <IconTrash size={12} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {editable && (
          <div style={{padding: '8px 11px 0'}}>
            {adding ? (
              <div className="stack gap-8">
                <input
                  className="input input-sm"
                  placeholder="Agenda item"
                  value={draftTitle}
                  autoFocus
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addItem();
                    if (e.key === 'Escape') setAdding(false);
                  }}
                  aria-label="New agenda item"
                />
                <select
                  className="select input-sm"
                  value={draftSection}
                  onChange={(e) => setDraftSection(e.target.value as SectionKey)}
                  aria-label="Section"
                >
                  {SECTIONS.map((section) => (
                    <option key={section} value={section}>
                      {SECTION_LABEL[section]}
                    </option>
                  ))}
                </select>
                <div className="row gap-6">
                  <button className="btn btn-sm btn-primary" onClick={addItem} disabled={!draftTitle.trim()}>
                    <IconPlus size={13} /> Add
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setAdding(false)}>
                    <IconX size={13} /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn btn-sm btn-block" onClick={() => setAdding(true)}>
                <IconPlus size={13} /> Add agenda item
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
