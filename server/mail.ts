/**
 * Email delivery over provider HTTP APIs - no SMTP client, no dependency.
 * Supported: Resend, Postmark, SendGrid, Mailgun. Set MAIL_PROVIDER.
 */
import {emailEnabled, env} from './env';
import {longDate, renderMinutesText} from '../shared/logic';
import {MEETING_TYPE_LABEL, type Meeting} from '../shared/types';

export interface SendResult {
  provider: string;
  recipients: number;
  id?: string;
}

export interface SendMinutesOptions {
  meeting: Meeting;
  to: string[];
  cc?: string[];
  subject?: string;
  message?: string;
  shareUrl?: string;
  pdf?: {filename: string; base64: string};
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]!);
}

function buildHtml(opts: SendMinutesOptions, intro: string): string {
  const m = opts.meeting;
  const present = m.attendance.filter((a) => a.status === 'PRESENT' || a.status === 'REMOTE').length;
  const motions = m.entries.filter((e) => e.kind === 'MOTION').length;
  const row = (label: string, value: string) =>
    `<tr><td style="padding:5px 0;color:#64748b">${escapeHtml(label)}</td><td style="padding:5px 0;text-align:right;color:#0f172a;font-weight:600">${escapeHtml(value)}</td></tr>`;

  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
<div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
  <div style="background:#0f172a;padding:22px 26px;color:#ffffff">
    <div style="font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:#94a3b8">${escapeHtml(env.brandName)}</div>
    <div style="font-size:19px;font-weight:600;margin-top:6px;line-height:1.3">${escapeHtml(m.associationName)}</div>
    <div style="font-size:13px;color:#cbd5e1;margin-top:3px">${escapeHtml(MEETING_TYPE_LABEL[m.type])} &middot; ${escapeHtml(longDate(m.date))}</div>
  </div>
  <div style="padding:26px">
    <p style="margin:0 0 18px;font-size:15px;line-height:1.65">${escapeHtml(intro)}</p>
    ${m.executiveSummary ? `<div style="background:#f8fafc;border-left:3px solid #334155;padding:13px 16px;margin:0 0 18px;font-size:14px;line-height:1.65;border-radius:0 6px 6px 0">${escapeHtml(m.executiveSummary)}</div>` : ''}
    ${
      m.keyOutcomes?.length
        ? `<div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#64748b;margin:0 0 8px">Key outcomes</div>
           <ul style="margin:0 0 18px;padding-left:20px;font-size:14px;line-height:1.75;color:#1e293b">${m.keyOutcomes.map((k) => `<li>${escapeHtml(k)}</li>`).join('')}</ul>`
        : ''
    }
    <table style="width:100%;font-size:13px;border-collapse:collapse;margin:0 0 22px">
      ${row('Called to order', m.calledToOrderAt || '—')}
      ${row('Adjourned', m.adjournedAt || '—')}
      ${row('Directors present', `${present} of ${m.attendance.length}`)}
      ${row('Motions recorded', String(motions))}
    </table>
    ${opts.shareUrl ? `<a href="${escapeHtml(opts.shareUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600">Read the minutes online</a>` : ''}
    ${opts.pdf ? `<p style="margin:18px 0 0;font-size:12px;color:#64748b">The full minutes are attached as a PDF.</p>` : ''}
    ${m.status !== 'FINALIZED' ? `<p style="margin:20px 0 0;font-size:12px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:11px 13px;line-height:1.5">These minutes are a draft and remain subject to approval by the Board at its next meeting.</p>` : ''}
  </div>
  <div style="padding:14px 26px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8">
    Prepared by ${escapeHtml(env.brandName)}${env.supportEmail ? ` &middot; ${escapeHtml(env.supportEmail)}` : ''}
  </div>
</div></body></html>`;
}

async function post(url: string, headers: Record<string, string>, body: string | FormData): Promise<Response> {
  const response = await fetch(url, {method: 'POST', headers, body: body as BodyInit});
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Mail provider responded ${response.status}: ${detail.slice(0, 300)}`);
  }
  return response;
}

export async function sendMinutesEmail(opts: SendMinutesOptions): Promise<SendResult> {
  if (!emailEnabled()) throw new Error('Email is not configured on this server');
  if (!opts.to.length) throw new Error('Add at least one recipient');

  const m = opts.meeting;
  const draftFlag = m.status === 'FINALIZED' ? '' : '[DRAFT] ';
  const subject = opts.subject?.trim() || `${draftFlag}${m.associationName} — Board Meeting Minutes, ${longDate(m.date)}`;
  const intro =
    opts.message?.trim() ||
    `Attached are the ${m.status === 'FINALIZED' ? 'approved' : 'draft'} minutes of the ${MEETING_TYPE_LABEL[m.type].toLowerCase()} held on ${longDate(m.date)}.`;

  const html = buildHtml(opts, intro);
  const text = `${intro}\n\n${renderMinutesText(m)}${opts.shareUrl ? `\n\nRead online: ${opts.shareUrl}` : ''}`;
  const recipients = opts.to.length + (opts.cc?.length ?? 0);

  switch (env.mailProvider) {
    case 'resend': {
      const response = await post(
        'https://api.resend.com/emails',
        {Authorization: `Bearer ${env.mailApiKey}`, 'Content-Type': 'application/json'},
        JSON.stringify({
          from: env.mailFrom,
          to: opts.to,
          cc: opts.cc?.length ? opts.cc : undefined,
          reply_to: env.supportEmail || undefined,
          subject,
          html,
          text,
          attachments: opts.pdf ? [{filename: opts.pdf.filename, content: opts.pdf.base64}] : undefined,
        }),
      );
      const payload = (await response.json().catch(() => ({}))) as {id?: string};
      return {provider: 'resend', recipients, id: payload.id};
    }

    case 'postmark': {
      const response = await post(
        'https://api.postmarkapp.com/email',
        {'X-Postmark-Server-Token': env.mailApiKey, 'Content-Type': 'application/json', Accept: 'application/json'},
        JSON.stringify({
          From: env.mailFrom,
          To: opts.to.join(','),
          Cc: opts.cc?.length ? opts.cc.join(',') : undefined,
          ReplyTo: env.supportEmail || undefined,
          Subject: subject,
          HtmlBody: html,
          TextBody: text,
          MessageStream: 'outbound',
          Attachments: opts.pdf
            ? [{Name: opts.pdf.filename, Content: opts.pdf.base64, ContentType: 'application/pdf'}]
            : undefined,
        }),
      );
      const payload = (await response.json().catch(() => ({}))) as {MessageID?: string};
      return {provider: 'postmark', recipients, id: payload.MessageID};
    }

    case 'sendgrid': {
      await post(
        'https://api.sendgrid.com/v3/mail/send',
        {Authorization: `Bearer ${env.mailApiKey}`, 'Content-Type': 'application/json'},
        JSON.stringify({
          personalizations: [
            {
              to: opts.to.map((email) => ({email})),
              cc: opts.cc?.length ? opts.cc.map((email) => ({email})) : undefined,
            },
          ],
          from: {email: env.mailFrom},
          reply_to: env.supportEmail ? {email: env.supportEmail} : undefined,
          subject,
          content: [
            {type: 'text/plain', value: text},
            {type: 'text/html', value: html},
          ],
          attachments: opts.pdf
            ? [{filename: opts.pdf.filename, content: opts.pdf.base64, type: 'application/pdf', disposition: 'attachment'}]
            : undefined,
        }),
      );
      return {provider: 'sendgrid', recipients};
    }

    case 'mailgun': {
      if (!env.mailDomain) throw new Error('Set MAILGUN_DOMAIN to send through Mailgun');
      const form = new FormData();
      form.set('from', env.mailFrom);
      for (const address of opts.to) form.append('to', address);
      for (const address of opts.cc ?? []) form.append('cc', address);
      form.set('subject', subject);
      form.set('text', text);
      form.set('html', html);
      if (env.supportEmail) form.set('h:Reply-To', env.supportEmail);
      if (opts.pdf) {
        form.set(
          'attachment',
          new Blob([Uint8Array.from(Buffer.from(opts.pdf.base64, 'base64'))], {type: 'application/pdf'}),
          opts.pdf.filename,
        );
      }
      const response = await post(
        `https://api.mailgun.net/v3/${encodeURIComponent(env.mailDomain)}/messages`,
        {Authorization: 'Basic ' + Buffer.from(`api:${env.mailApiKey}`).toString('base64')},
        form,
      );
      const payload = (await response.json().catch(() => ({}))) as {id?: string};
      return {provider: 'mailgun', recipients, id: payload.id};
    }

    default:
      throw new Error(`Unknown MAIL_PROVIDER "${env.mailProvider}"`);
  }
}

/** A cheap credential check that does not send anything. */
export async function checkMailConfig(): Promise<{ok: boolean; error?: string}> {
  if (!emailEnabled()) return {ok: false, error: 'Email is not configured'};
  try {
    switch (env.mailProvider) {
      case 'resend': {
        const r = await fetch('https://api.resend.com/domains', {headers: {Authorization: `Bearer ${env.mailApiKey}`}});
        return r.ok ? {ok: true} : {ok: false, error: `Resend responded ${r.status}`};
      }
      case 'postmark': {
        const r = await fetch('https://api.postmarkapp.com/server', {
          headers: {'X-Postmark-Server-Token': env.mailApiKey, Accept: 'application/json'},
        });
        return r.ok ? {ok: true} : {ok: false, error: `Postmark responded ${r.status}`};
      }
      case 'sendgrid': {
        const r = await fetch('https://api.sendgrid.com/v3/scopes', {
          headers: {Authorization: `Bearer ${env.mailApiKey}`},
        });
        return r.ok ? {ok: true} : {ok: false, error: `SendGrid responded ${r.status}`};
      }
      case 'mailgun': {
        const r = await fetch(`https://api.mailgun.net/v3/domains/${encodeURIComponent(env.mailDomain)}`, {
          headers: {Authorization: 'Basic ' + Buffer.from(`api:${env.mailApiKey}`).toString('base64')},
        });
        return r.ok ? {ok: true} : {ok: false, error: `Mailgun responded ${r.status}`};
      }
      default:
        return {ok: false, error: 'Unknown provider'};
    }
  } catch (err) {
    return {ok: false, error: (err as Error).message};
  }
}
