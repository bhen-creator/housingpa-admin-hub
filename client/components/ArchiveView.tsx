import {useEffect, useMemo, useState} from 'react';
import {api, pdfUrl} from '../lib/api';
import {longDate} from '../../shared/logic';
import {MEETING_TYPE_LABEL, type Association, type MeetingSummaryRow} from '../../shared/types';
import {Modal, useToast} from './ui';
import {IconDownload, IconExternal, IconSearch} from '../lib/icons';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Not yet called to order',
  IN_SESSION: 'In session',
  ADJOURNED: 'Draft minutes',
  FINALIZED: 'Approved',
};

export function ArchiveView({
  associations,
  currentAssociationId,
  onOpen,
  onClose,
}: {
  associations: Association[];
  currentAssociationId: string | null;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<MeetingSummaryRow[]>([]);
  const [filterAssoc, setFilterAssoc] = useState(currentAssociationId ?? '');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    setLoading(true);
    api
      .meetings(filterAssoc || undefined)
      .then(setRows)
      .catch(() => toast.error('Could not load past meetings'))
      .finally(() => setLoading(false));
  }, [filterAssoc]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) => row.associationName.toLowerCase().includes(q) || longDate(row.date).toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <Modal title="Past meetings" subtitle={`${rows.length} on file`} onClose={onClose} wide>
      <div className="row gap-8 wrap" style={{marginBottom: 14}}>
        <select className="select" style={{maxWidth: 300}} value={filterAssoc} onChange={(e) => setFilterAssoc(e.target.value)}>
          <option value="">All communities</option>
          {associations.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <div className="row grow" style={{position: 'relative', minWidth: 180}}>
          <span style={{position: 'absolute', left: 10, color: 'var(--ink-4)', display: 'flex'}}>
            <IconSearch size={14} />
          </span>
          <input
            className="input"
            style={{paddingLeft: 32}}
            placeholder="Search by community or date"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="tiny muted">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="callout callout-info">No meetings match.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Community</th>
              <th>Status</th>
              <th className="num">Entries</th>
              <th className="num">Motions</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id}>
                <td style={{whiteSpace: 'nowrap'}}>
                  <div style={{fontWeight: 550}}>{longDate(row.date)}</div>
                  <div className="tiny muted">{MEETING_TYPE_LABEL[row.type].replace(' of the Board of Directors', '')}</div>
                </td>
                <td className="truncate" style={{maxWidth: 220}}>
                  {row.associationName}
                </td>
                <td>
                  <span
                    className={`pill ${row.status === 'FINALIZED' ? 'pill-ok' : row.status === 'IN_SESSION' ? 'pill-warn' : ''}`}
                  >
                    {STATUS_LABEL[row.status] ?? row.status}
                  </span>
                </td>
                <td className="num">{row.entryCount}</td>
                <td className="num">{row.motionCount}</td>
                <td style={{textAlign: 'right', whiteSpace: 'nowrap'}}>
                  <a className="btn btn-sm" href={pdfUrl(row.id, true)} download aria-label="Download PDF">
                    <IconDownload size={13} />
                  </a>{' '}
                  <button className="btn btn-sm btn-primary" onClick={() => onOpen(row.id)}>
                    <IconExternal size={13} /> Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
