import {useEffect, useState} from 'react';
import {api, sharedPdfUrl} from '../lib/api';
import {MinutesSheet} from './MinutesSheet';
import type {Meeting} from '../../shared/types';
import {IconDownload, IconPrint} from '../lib/icons';

/** The public, read-only page behind a share link. */
export function SharedView({token}: {token: string}) {
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [brandName, setBrandName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .sharedMinutes(token)
      .then((result) => {
        setMeeting(result.meeting);
        setBrandName(result.brandName);
        document.title = `${result.meeting.associationName} — Board Meeting Minutes`;
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'This link is no longer valid'));
  }, [token]);

  if (error) {
    return (
      <div style={{display: 'grid', placeItems: 'center', height: '100%', padding: 24}}>
        <div className="card card-pad" style={{maxWidth: 380, textAlign: 'center'}}>
          <div style={{fontWeight: 620, marginBottom: 6}}>Link not available</div>
          <div className="small muted">{error}</div>
        </div>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div style={{display: 'grid', placeItems: 'center', height: '100%'}}>
        <div className="small muted">Loading the minutes…</div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="pane-bar no-print" style={{justifyContent: 'space-between'}}>
        <div className="row gap-10" style={{minWidth: 0}}>
          <strong className="truncate" style={{fontSize: 13}}>
            {meeting.associationName}
          </strong>
          <span className={`pill ${meeting.status === 'FINALIZED' ? 'pill-ok' : 'pill-warn'}`}>
            {meeting.status === 'FINALIZED' ? 'Approved' : 'Draft'}
          </span>
        </div>
        <div className="row gap-8">
          <a className="btn btn-sm" href={sharedPdfUrl(token, true)} download>
            <IconDownload size={13} /> PDF
          </a>
          <button className="btn btn-sm" onClick={() => window.print()}>
            <IconPrint size={13} /> Print
          </button>
        </div>
      </header>
      <div className="pane-scroll" style={{background: '#dfe4ec'}}>
        <div className="doc-scroll">
          <MinutesSheet meeting={meeting} brandName={brandName} readOnly />
        </div>
      </div>
    </div>
  );
}
