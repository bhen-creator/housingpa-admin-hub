import {useEffect, useState} from 'react';
import {api, pdfUrl, sharePageUrl} from '../lib/api';
import {longDate, renderMinutesText} from '../../shared/logic';
import type {AppConfig, Meeting} from '../../shared/types';
import {Field, Modal, useToast} from './ui';
import {
  IconCheck,
  IconCopy,
  IconDownload,
  IconExternal,
  IconLink,
  IconLock,
  IconMail,
  IconPrint,
  IconSparkle,
} from '../lib/icons';

export function ShareDialog({
  meeting,
  config,
  isAdmin,
  onClose,
  onMeetingChange,
}: {
  meeting: Meeting;
  config: AppConfig;
  isAdmin: boolean;
  onClose: () => void;
  onMeetingChange: (meeting: Meeting) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string>(
    meeting.shareToken ? sharePageUrl(meeting.shareToken) : '',
  );
  const [recipients, setRecipients] = useState<string[]>(() =>
    meeting.attendance.filter((a) => a.email).map((a) => a.email),
  );
  const [message, setMessage] = useState('');
  const [attachPdf, setAttachPdf] = useState(true);
  const [emailStatus, setEmailStatus] = useState<{configured: boolean; ok: boolean; error?: string} | null>(null);

  useEffect(() => {
    if (!config.emailEnabled) return;
    api.emailStatus().then(setEmailStatus).catch(() => setEmailStatus({configured: false, ok: false}));
  }, [config.emailEnabled]);

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    try {
      await work();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      toast.error('Copy blocked by the browser — select the text and copy manually.');
    }
  };

  const summarize = () =>
    run('summary', async () => {
      const result = await api.summarize(meeting.id);
      onMeetingChange(result.meeting);
      toast.ok(result.aiAssisted ? 'Summary written.' : 'Summary built from the record (no AI key configured).');
    });

  const createLink = () =>
    run('share', async () => {
      const result = await api.shareMeeting(meeting.id);
      setShareUrl(result.url);
      onMeetingChange(result.meeting);
      await copy(result.url, 'link');
      toast.ok('Link created and copied.');
    });

  const revokeLink = () =>
    run('revoke', async () => {
      const result = await api.unshareMeeting(meeting.id);
      setShareUrl('');
      onMeetingChange(result.meeting);
      toast.ok('Link revoked.');
    });

  const sendEmail = () =>
    run('email', async () => {
      const result = await api.emailMinutes(meeting.id, {
        to: recipients,
        message: message.trim() || undefined,
        attachPdf,
      });
      onMeetingChange(result.meeting);
      toast.ok(`Sent to ${result.recipients} recipient${result.recipients === 1 ? '' : 's'}.`);
    });

  const finalize = () =>
    run('finalize', async () => {
      const updated = await api.finalizeMeeting(meeting.id);
      onMeetingChange(updated);
      toast.ok('Minutes finalized.');
    });

  const reopen = () =>
    run('reopen', async () => {
      const updated = await api.reopenMeeting(meeting.id);
      onMeetingChange(updated);
      toast.ok('Minutes reopened for editing.');
    });

  const mailtoUrl = () => {
    const subject = `${meeting.status === 'FINALIZED' ? '' : '[Draft] '}${meeting.associationName} — Board Meeting Minutes, ${longDate(meeting.date)}`;
    const body = [
      message.trim() || `Attached are the minutes of the meeting held on ${longDate(meeting.date)}.`,
      shareUrl ? `\nRead online: ${shareUrl}` : '',
      '\n\n' + renderMinutesText(meeting).slice(0, 1400),
    ].join('\n');
    return `mailto:${recipients.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const isFinal = meeting.status === 'FINALIZED';

  return (
    <Modal
      title="Review, export and send"
      subtitle={`${meeting.associationName} · ${longDate(meeting.date)}`}
      onClose={onClose}
      wide
      footer={
        <>
          <span className="tiny muted right" />
          {isFinal ? (
            isAdmin ? (
              <button className="btn" onClick={reopen} disabled={busy !== null}>
                Reopen for editing
              </button>
            ) : (
              <span className="tiny muted">Finalized — an administrator can reopen these minutes.</span>
            )
          ) : (
            <button className="btn btn-primary" onClick={finalize} disabled={busy !== null || meeting.status !== 'ADJOURNED'}>
              <IconLock size={14} /> Finalize minutes
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className="stack gap-16">
        {/* Summary --------------------------------------------------- */}
        <section>
          <div className="row gap-8" style={{marginBottom: 8}}>
            <strong style={{fontSize: 13}}>Summary for the cover email</strong>
            <button className="btn btn-sm right" onClick={summarize} disabled={busy === 'summary'}>
              <IconSparkle size={13} className={busy === 'summary' ? 'spin' : undefined} />
              {busy === 'summary' ? 'Writing…' : meeting.executiveSummary ? 'Rewrite' : 'Write it'}
            </button>
          </div>
          {meeting.executiveSummary ? (
            <div className="callout callout-info">
              <div>{meeting.executiveSummary}</div>
              {meeting.keyOutcomes && meeting.keyOutcomes.length > 0 && (
                <ul style={{margin: '10px 0 0', paddingLeft: 18}}>
                  {meeting.keyOutcomes.map((k, i) => (
                    <li key={i}>{k}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="tiny muted">
              Optional. The summary appears at the top of the minutes, in the email, and on the shared page.
            </div>
          )}
        </section>

        <hr className="hr" />

        {/* Export ---------------------------------------------------- */}
        <section>
          <strong style={{fontSize: 13, display: 'block', marginBottom: 9}}>Export</strong>
          <div className="row gap-8 wrap">
            <a className="btn" href={pdfUrl(meeting.id, true)} download>
              <IconDownload size={14} /> Download PDF
            </a>
            <a className="btn" href={pdfUrl(meeting.id)} target="_blank" rel="noreferrer">
              <IconExternal size={14} /> Open PDF
            </a>
            <button className="btn" onClick={() => window.print()}>
              <IconPrint size={14} /> Print
            </button>
            <button
              className="btn"
              onClick={() =>
                run('text', async () => {
                  const result = await api.minutesText(meeting.id);
                  await copy(result.text, 'text');
                })
              }
            >
              {copied === 'text' ? <IconCheck size={14} /> : <IconCopy size={14} />}
              {copied === 'text' ? 'Copied' : 'Copy as text'}
            </button>
          </div>
        </section>

        <hr className="hr" />

        {/* Share link ------------------------------------------------ */}
        {config.sharingEnabled && (
          <>
            <section>
              <strong style={{fontSize: 13, display: 'block', marginBottom: 4}}>Share a read-only link</strong>
              <div className="tiny muted" style={{marginBottom: 9}}>
                Anyone with the link can read the minutes and download the PDF. Board email addresses are never shown.
              </div>
              {shareUrl ? (
                <div className="stack gap-8">
                  <div className="row gap-8">
                    <input className="input input-sm grow mono" readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
                    <button className="btn btn-sm" onClick={() => copy(shareUrl, 'link')}>
                      {copied === 'link' ? <IconCheck size={13} /> : <IconCopy size={13} />}
                      {copied === 'link' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="row gap-8">
                    <a className="btn btn-sm" href={shareUrl} target="_blank" rel="noreferrer">
                      <IconExternal size={13} /> Open
                    </a>
                    <button className="btn btn-sm btn-danger" onClick={revokeLink} disabled={busy === 'revoke'}>
                      Revoke link
                    </button>
                  </div>
                </div>
              ) : (
                <button className="btn" onClick={createLink} disabled={busy === 'share'}>
                  <IconLink size={14} /> Create share link
                </button>
              )}
            </section>
            <hr className="hr" />
          </>
        )}

        {/* Email ----------------------------------------------------- */}
        <section>
          <strong style={{fontSize: 13, display: 'block', marginBottom: 9}}>Send to the board</strong>

          <Field label="Recipients" htmlFor="share-to">
            <textarea
              id="share-to"
              className="textarea"
              rows={2}
              value={recipients.join(', ')}
              onChange={(e) =>
                setRecipients(
                  e.target.value
                    .split(/[,;\s]+/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
              placeholder="board@example.org, president@example.org"
            />
          </Field>

          <Field label="Note (optional)" htmlFor="share-msg">
            <textarea
              id="share-msg"
              className="textarea"
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Please review before the November meeting."
            />
          </Field>

          <label className="row gap-8 small" style={{marginBottom: 12}}>
            <input type="checkbox" checked={attachPdf} onChange={(e) => setAttachPdf(e.target.checked)} />
            Attach the minutes as a PDF
          </label>

          {config.emailEnabled ? (
            <div className="stack gap-8">
              <button className="btn btn-accent" onClick={sendEmail} disabled={busy === 'email' || recipients.length === 0}>
                <IconMail size={14} />
                {busy === 'email' ? 'Sending…' : `Send to ${recipients.length} recipient${recipients.length === 1 ? '' : 's'}`}
              </button>
              {emailStatus && !emailStatus.ok && (
                <div className="callout callout-warn tiny">
                  Email is configured but the provider check failed: {emailStatus.error ?? 'unknown error'}
                </div>
              )}
              {meeting.emailedAt && (
                <div className="tiny muted">Last sent {new Date(meeting.emailedAt).toLocaleString()}.</div>
              )}
            </div>
          ) : (
            <div className="stack gap-8">
              <a className="btn" href={mailtoUrl()}>
                <IconMail size={14} /> Open in your email app
              </a>
              <div className="tiny muted">
                Server-side sending is not configured, so this opens a draft in your mail client. The PDF is not attached
                automatically — download it above and attach it. Set MAIL_PROVIDER and MAIL_API_KEY to send directly.
              </div>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
