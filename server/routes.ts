import crypto from 'node:crypto';
import {formatNote, polishMotion, summarizeMeeting} from './ai';
import {
  clearFailedLogins,
  loginBlockedSeconds,
  noteFailedLogin,
  requireAdmin,
  requireAuth,
  signIn,
  signOut,
} from './auth';
import {
  audit,
  countMeetings,
  createAccessCode,
  deleteAgendaFile,
  deleteAssociation,
  deleteMeeting,
  findOpenMeeting,
  getAgendaFile,
  getAssociation,
  getMeeting,
  getMeetingByShareToken,
  listAccessCodes,
  listAssociations,
  listMeetings,
  removeAccessCode,
  saveAgendaFile,
  saveAssociation,
  saveMeeting,
  setAccessCodeDisabled,
} from './db';
import {aiEnabled, emailEnabled, env} from './env';
import {checkMailConfig, sendMinutesEmail} from './mail';
import {badRequest, conflict, forbidden, HttpError, notFound, Router, type Ctx} from './http';
import {minutesFilename, renderMinutesPdf} from './pdf/minutes';
import {cleanAssociation, cleanMeeting, email as vEmail, isoDate, oneOf, str} from './validate';
import {createMeeting, newId, renderMinutesText, requiredQuorum} from '../shared/logic';
import {MEETING_TYPES, SECTIONS, type AppConfig, type SectionKey} from '../shared/types';

export const router = new Router();

const MAX_SHARE_TOKEN = 64;

function shareUrlFor(ctx: Ctx, token: string): string {
  return `${env.appUrl || ctx.origin}/m/${token}`;
}

/* ------------------------------------------------------------------ */
/* config, health, session                                             */
/* ------------------------------------------------------------------ */

router.get('/api/config', (): AppConfig => ({
  brandName: env.brandName,
  brandShort: env.brandShort,
  brandTagline: env.brandTagline,
  supportEmail: env.supportEmail,
  aiEnabled: aiEnabled(),
  emailEnabled: emailEnabled(),
  sharingEnabled: env.sharingEnabled,
  version: env.version,
}));

router.get('/api/health', () => ({
  status: 'ok',
  meetings: countMeetings(),
  ai: aiEnabled(),
  email: emailEnabled(),
  version: env.version,
}));

router.get('/api/session', (ctx) =>
  ctx.auth ? {authenticated: true, label: ctx.auth.label, role: ctx.auth.role} : {authenticated: false},
);

router.post('/api/session', (ctx) => {
  const wait = loginBlockedSeconds(ctx.ip);
  if (wait > 0) throw new HttpError(429, `Too many attempts. Try again in ${Math.ceil(wait / 60)} minute(s).`);

  const code = str((ctx.body as Record<string, unknown>)?.code, 'Access code', {max: 200, required: true});
  const result = signIn(ctx, code);
  if (!result) {
    noteFailedLogin(ctx.ip);
    audit(undefined, 'login.failed', undefined, ctx.ip);
    throw new HttpError(401, 'That access code was not recognised.');
  }
  clearFailedLogins(ctx.ip);
  audit(result.label, 'login.success');
  return {authenticated: true, label: result.label, role: result.role};
});

router.delete('/api/session', (ctx) => {
  signOut(ctx);
  return {authenticated: false};
});

/* ------------------------------------------------------------------ */
/* public share link                                                   */
/* ------------------------------------------------------------------ */

router.get('/api/share/:token', (ctx) => {
  if (!env.sharingEnabled) throw notFound();
  const token = ctx.params.token;
  if (token.length < 10 || token.length > MAX_SHARE_TOKEN) throw notFound('This link is no longer valid');
  const meeting = getMeetingByShareToken(token);
  if (!meeting) throw notFound('This link is no longer valid');

  ctx.res.setHeader('Cache-Control', 'no-store');
  return {
    // Board member email addresses never travel over a public link.
    meeting: {...meeting, attendance: meeting.attendance.map((a) => ({...a, email: ''})), shareToken: undefined},
    brandName: env.brandName,
    brandShort: env.brandShort,
  };
});

router.get('/api/share/:token/pdf', (ctx) => {
  if (!env.sharingEnabled) throw notFound();
  const meeting = getMeetingByShareToken(ctx.params.token);
  if (!meeting) throw notFound('This link is no longer valid');
  sendPdf(ctx, meeting);
  return undefined;
});

/* ------------------------------------------------------------------ */
/* associations                                                        */
/* ------------------------------------------------------------------ */

router.get('/api/associations', (ctx) => {
  requireAuth(ctx);
  return listAssociations(ctx.query.get('includeArchived') === 'true');
});

router.post('/api/associations', (ctx) => {
  const auth = requireAuth(ctx);
  const saved = saveAssociation({...cleanAssociation(ctx.body), id: newId('assoc')});
  audit(auth.label, 'association.create', saved.id, saved.name);
  ctx.res.statusCode = 201;
  return saved;
});

router.put('/api/associations/:id', (ctx) => {
  const auth = requireAuth(ctx);
  const existing = getAssociation(ctx.params.id);
  if (!existing) throw notFound('Association not found');
  const saved = saveAssociation(cleanAssociation(ctx.body, existing));
  audit(auth.label, 'association.update', saved.id, saved.name);
  return saved;
});

router.delete('/api/associations/:id', (ctx) => {
  const auth = requireAdmin(ctx);
  const existing = getAssociation(ctx.params.id);
  if (!existing) throw notFound('Association not found');

  if (listMeetings({associationId: existing.id, limit: 1}).length > 0) {
    // Anything with minutes attached is archived, never destroyed.
    saveAssociation({...existing, archived: true});
    audit(auth.label, 'association.archive', existing.id, existing.name);
    return {archived: true};
  }
  deleteAssociation(existing.id);
  audit(auth.label, 'association.delete', existing.id, existing.name);
  return {deleted: true};
});

/* ------------------------------------------------------------------ */
/* meetings                                                            */
/* ------------------------------------------------------------------ */

router.get('/api/meetings', (ctx) => {
  requireAuth(ctx);
  return listMeetings({
    associationId: ctx.query.get('associationId') ?? undefined,
    status: ctx.query.get('status') ?? undefined,
    limit: Math.min(Number(ctx.query.get('limit')) || 100, 500),
  });
});

router.get('/api/meetings/open', (ctx) => {
  requireAuth(ctx);
  const associationId = str(ctx.query.get('associationId'), 'associationId', {max: 64, required: true});
  return findOpenMeeting(associationId);
});

router.post('/api/meetings', (ctx) => {
  const auth = requireAuth(ctx);
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const association = getAssociation(str(body.associationId, 'associationId', {max: 64, required: true}));
  if (!association) throw notFound('Association not found');
  if (association.members.filter((m) => m.active).length === 0) {
    throw badRequest('Add board members to this association before starting a meeting');
  }

  const meeting = createMeeting(association, {
    type: oneOf(body.type, MEETING_TYPES, 'Meeting type', 'REGULAR'),
    date: isoDate(body.date, 'Meeting date') || undefined,
    scheduledTime: str(body.scheduledTime, 'Scheduled time', {max: 20}) || undefined,
    location: str(body.location, 'Location', {max: 240}) || undefined,
  });
  meeting.quorumRequired = requiredQuorum(association);

  const saved = saveMeeting(meeting);
  audit(auth.label, 'meeting.create', saved.id, saved.associationName);
  ctx.res.statusCode = 201;
  return saved;
});

router.get('/api/meetings/:id', (ctx) => {
  requireAuth(ctx);
  const meeting = getMeeting(ctx.params.id);
  if (!meeting) throw notFound('Meeting not found');
  return meeting;
});

/** Autosave: the client owns the document, the server validates and stores it. */
router.put('/api/meetings/:id', (ctx) => {
  requireAuth(ctx);
  const existing = getMeeting(ctx.params.id);
  if (!existing) throw notFound('Meeting not found');

  const incoming = str((ctx.body as Record<string, unknown>)?.updatedAt, 'updatedAt', {max: 40});
  const staleWrite = Boolean(incoming) && new Date(incoming).getTime() < new Date(existing.updatedAt).getTime();
  const saved = saveMeeting(cleanMeeting(ctx.body, existing));
  return {...saved, staleWrite};
});

router.delete('/api/meetings/:id', (ctx) => {
  const auth = requireAdmin(ctx);
  const meeting = getMeeting(ctx.params.id);
  if (!meeting) throw notFound('Meeting not found');
  if (meeting.status === 'FINALIZED') throw conflict('Finalized minutes cannot be deleted');
  deleteMeeting(meeting.id);
  audit(auth.label, 'meeting.delete', meeting.id, meeting.associationName);
  return {deleted: true};
});

router.post('/api/meetings/:id/finalize', (ctx) => {
  const auth = requireAuth(ctx);
  const meeting = getMeeting(ctx.params.id);
  if (!meeting) throw notFound('Meeting not found');
  if (meeting.status === 'FINALIZED') return meeting;
  if (meeting.status !== 'ADJOURNED') throw conflict('Adjourn the meeting before finalizing the minutes');
  const saved = saveMeeting({...meeting, status: 'FINALIZED', finalizedAt: new Date().toISOString()});
  audit(auth.label, 'meeting.finalize', saved.id, saved.associationName);
  return saved;
});

router.post('/api/meetings/:id/reopen', (ctx) => {
  const auth = requireAdmin(ctx);
  const meeting = getMeeting(ctx.params.id);
  if (!meeting) throw notFound('Meeting not found');
  const saved = saveMeeting({...meeting, status: 'ADJOURNED', finalizedAt: undefined});
  audit(auth.label, 'meeting.reopen', saved.id, saved.associationName);
  return saved;
});

/* --- pdf & text ------------------------------------------------------------ */

function sendPdf(ctx: Ctx, meeting: Parameters<typeof renderMinutesPdf>[0]): void {
  const pdf = renderMinutesPdf(meeting, {brandName: env.brandName});
  const filename = minutesFilename(meeting);
  const disposition = ctx.query.get('download') === '1' ? 'attachment' : 'inline';
  ctx.res.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Length': pdf.length,
    'Content-Disposition': `${disposition}; filename="${filename}"`,
    'Cache-Control': 'no-store',
  });
  ctx.res.end(pdf);
}

router.get('/api/meetings/:id/pdf', (ctx) => {
  requireAuth(ctx);
  const meeting = getMeeting(ctx.params.id);
  if (!meeting) throw notFound('Meeting not found');
  sendPdf(ctx, meeting);
  return undefined;
});

router.get('/api/meetings/:id/text', (ctx) => {
  requireAuth(ctx);
  const meeting = getMeeting(ctx.params.id);
  if (!meeting) throw notFound('Meeting not found');
  return {text: renderMinutesText(meeting)};
});

/* --- share ----------------------------------------------------------------- */

router.post('/api/meetings/:id/share', (ctx) => {
  const auth = requireAuth(ctx);
  if (!env.sharingEnabled) throw forbidden('Share links are turned off on this server');
  const meeting = getMeeting(ctx.params.id);
  if (!meeting) throw notFound('Meeting not found');

  const token = meeting.shareToken || crypto.randomBytes(18).toString('base64url');
  const saved = saveMeeting({...meeting, shareToken: token, sharedAt: meeting.sharedAt || new Date().toISOString()});
  audit(auth.label, 'meeting.share', saved.id);
  return {shareToken: token, url: shareUrlFor(ctx, token), meeting: saved};
});

router.delete('/api/meetings/:id/share', (ctx) => {
  const auth = requireAuth(ctx);
  const meeting = getMeeting(ctx.params.id);
  if (!meeting) throw notFound('Meeting not found');
  const saved = saveMeeting({...meeting, shareToken: undefined, sharedAt: undefined});
  audit(auth.label, 'meeting.unshare', meeting.id);
  return {revoked: true, meeting: saved};
});

/* --- agenda file ----------------------------------------------------------- */

router.post('/api/meetings/:id/agenda-file', (ctx) => {
  requireAuth(ctx);
  const meeting = getMeeting(ctx.params.id);
  if (!meeting) throw notFound('Meeting not found');

  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const filename = str(body.filename, 'File name', {max: 200, required: true});
  const dataUrl = str(body.dataUrl, 'File contents', {max: 30_000_000, required: true});
  const match = /^data:([\w/+.-]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) throw badRequest('Expected a base64 data URL');
  if (match[1] !== 'application/pdf') throw badRequest('The agenda must be a PDF');

  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length === 0) throw badRequest('That file appears to be empty');
  if (bytes.length > 20 * 1024 * 1024) throw new HttpError(413, 'The agenda PDF must be under 20 MB');
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') throw badRequest('That file is not a valid PDF');

  saveAgendaFile(meeting.id, filename, 'application/pdf', bytes);
  return saveMeeting({
    ...meeting,
    agendaFile: {name: filename, size: bytes.length, type: 'application/pdf', storedAt: new Date().toISOString()},
  });
});

router.get('/api/meetings/:id/agenda-file', (ctx) => {
  requireAuth(ctx);
  const file = getAgendaFile(ctx.params.id);
  if (!file) throw notFound('No agenda on file');
  ctx.res.writeHead(200, {
    'Content-Type': file.mime,
    'Content-Length': file.bytes.length,
    'Content-Disposition': `inline; filename="${file.filename.replace(/[^\w.\-]/g, '_')}"`,
  });
  ctx.res.end(file.bytes);
  return undefined;
});

router.delete('/api/meetings/:id/agenda-file', (ctx) => {
  requireAuth(ctx);
  const meeting = getMeeting(ctx.params.id);
  if (!meeting) throw notFound('Meeting not found');
  deleteAgendaFile(meeting.id);
  return saveMeeting({...meeting, agendaFile: undefined});
});

/* --- email ----------------------------------------------------------------- */

router.get('/api/email/status', async (ctx) => {
  requireAuth(ctx);
  if (!emailEnabled()) return {configured: false, ok: false, error: 'Email is not configured on this server'};
  return {configured: true, provider: env.mailProvider, from: env.mailFrom, ...(await checkMailConfig())};
});

router.post('/api/meetings/:id/email', async (ctx) => {
  const auth = requireAuth(ctx);
  const meeting = getMeeting(ctx.params.id);
  if (!meeting) throw notFound('Meeting not found');
  if (!emailEnabled()) throw new HttpError(503, 'Email is not configured on this server');

  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const to = (Array.isArray(body.to) ? body.to : []).map((e, i) => vEmail(e, `Recipient ${i + 1}`)).filter(Boolean).slice(0, 60);
  if (!to.length) throw badRequest('Add at least one recipient');
  const cc = (Array.isArray(body.cc) ? body.cc : []).map((e, i) => vEmail(e, `Cc ${i + 1}`)).filter(Boolean).slice(0, 60);

  const attachPdf = body.attachPdf !== false;
  const pdf = attachPdf
    ? {
        filename: minutesFilename(meeting),
        base64: renderMinutesPdf(meeting, {brandName: env.brandName}).toString('base64'),
      }
    : undefined;

  const result = await sendMinutesEmail({
    meeting,
    to,
    cc,
    subject: str(body.subject, 'Subject', {max: 300}) || undefined,
    message: str(body.message, 'Message', {max: 4000}) || undefined,
    shareUrl: meeting.shareToken ? shareUrlFor(ctx, meeting.shareToken) : undefined,
    pdf,
  });

  const saved = saveMeeting({...meeting, emailedAt: new Date().toISOString()});
  audit(auth.label, 'meeting.email', meeting.id, `${to.length + cc.length} recipients`);
  return {...result, meeting: saved};
});

/* ------------------------------------------------------------------ */
/* AI helpers                                                          */
/* ------------------------------------------------------------------ */

router.post('/api/ai/note', async (ctx) => {
  requireAuth(ctx);
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  return formatNote(str(body.text, 'Note text', {max: 6000, required: true}), {
    associationName: str(body.associationName, 'associationName', {max: 200}),
    agendaItem: str(body.agendaItem, 'agendaItem', {max: 300}) || undefined,
    section: oneOf(body.section, SECTIONS, 'Section', 'NEW_BUSINESS') as SectionKey,
    attendees: Array.isArray(body.attendees)
      ? body.attendees.filter((a): a is string => typeof a === 'string').slice(0, 40)
      : [],
  });
});

router.post('/api/ai/motion', async (ctx) => {
  requireAuth(ctx);
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  return polishMotion(str(body.text, 'Motion text', {max: 2000, required: true}));
});

router.post('/api/meetings/:id/summary', async (ctx) => {
  requireAuth(ctx);
  const meeting = getMeeting(ctx.params.id);
  if (!meeting) throw notFound('Meeting not found');
  const result = await summarizeMeeting(meeting);
  const saved = saveMeeting({...meeting, executiveSummary: result.summary, keyOutcomes: result.keyOutcomes});
  return {...result, meeting: saved};
});

/* ------------------------------------------------------------------ */
/* access codes                                                        */
/* ------------------------------------------------------------------ */

router.get('/api/access-codes', (ctx) => {
  requireAdmin(ctx);
  return listAccessCodes().map((c) => ({
    id: c.id,
    label: c.label,
    role: c.role,
    disabled: Boolean(c.disabled),
    createdAt: c.created_at,
    lastUsedAt: c.last_used_at ?? undefined,
  }));
});

router.post('/api/access-codes', (ctx) => {
  const auth = requireAdmin(ctx);
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const label = str(body.label, 'Label', {max: 80, required: true});
  const code = str(body.code, 'Access code', {max: 200, required: true});
  if (code.length < 8) throw badRequest('Use at least 8 characters for an access code');

  const role = oneOf(body.role, ['admin', 'manager'] as const, 'Role', 'manager');
  const id = createAccessCode(label, code, role);
  audit(auth.label, 'accesscode.create', id, label);
  ctx.res.statusCode = 201;
  return {id, label, role, disabled: false, createdAt: new Date().toISOString()};
});

router.patch('/api/access-codes/:id', (ctx) => {
  const auth = requireAdmin(ctx);
  const disabled = (ctx.body as Record<string, unknown>)?.disabled === true;
  if (disabled && !otherActiveAdminExists(ctx.params.id)) {
    throw conflict('At least one active administrator code must remain');
  }
  if (!setAccessCodeDisabled(ctx.params.id, disabled)) throw notFound('Access code not found');
  audit(auth.label, disabled ? 'accesscode.disable' : 'accesscode.enable', ctx.params.id);
  return {ok: true};
});

router.delete('/api/access-codes/:id', (ctx) => {
  const auth = requireAdmin(ctx);
  if (!otherActiveAdminExists(ctx.params.id)) throw conflict('At least one active administrator code must remain');
  removeAccessCode(ctx.params.id);
  audit(auth.label, 'accesscode.delete', ctx.params.id);
  return {deleted: true};
});

function otherActiveAdminExists(excludeId: string): boolean {
  return listAccessCodes().some((c) => c.id !== excludeId && !c.disabled && c.role === 'admin');
}
