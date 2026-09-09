import type {
  AccessCodeRow,
  AppConfig,
  Association,
  FormattedNote,
  GeneratedSummary,
  Meeting,
  MeetingSummaryRow,
  SectionKey,
  SessionInfo,
} from '../../shared/types';

const APP_BASE_PATH =
  window.location.pathname === '/minutes' || window.location.pathname.startsWith('/minutes/')
    ? '/minutes'
    : '';

export function appPath(path: string): string {
  return `${APP_BASE_PATH}${path.startsWith('/') ? path : `/${path}`}`;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(appPath(path), {
    credentials: 'same-origin',
    ...init,
    headers: init.body ? {'Content-Type': 'application/json', ...init.headers} : init.headers,
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = {error: text.slice(0, 300)};
    }
  }

  if (!response.ok) {
    const message = (payload as {error?: string} | null)?.error || `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }
  return payload as T;
}

const body = (data: unknown) => JSON.stringify(data);

export const api = {
  config: () => request<AppConfig>('/api/config'),
  session: () => request<SessionInfo>('/api/session'),
  signIn: (code: string) => request<SessionInfo>('/api/session', {method: 'POST', body: body({code})}),
  signOut: () => request<SessionInfo>('/api/session', {method: 'DELETE'}),

  associations: () => request<Association[]>('/api/associations'),
  createAssociation: (data: Partial<Association>) =>
    request<Association>('/api/associations', {method: 'POST', body: body(data)}),
  updateAssociation: (id: string, data: Partial<Association>) =>
    request<Association>(`/api/associations/${id}`, {method: 'PUT', body: body(data)}),
  deleteAssociation: (id: string) =>
    request<{deleted?: boolean; archived?: boolean}>(`/api/associations/${id}`, {method: 'DELETE'}),

  meetings: (associationId?: string) =>
    request<MeetingSummaryRow[]>(`/api/meetings${associationId ? `?associationId=${encodeURIComponent(associationId)}` : ''}`),
  openMeeting: (associationId: string) =>
    request<Meeting | null>(`/api/meetings/open?associationId=${encodeURIComponent(associationId)}`),
  meeting: (id: string) => request<Meeting>(`/api/meetings/${id}`),
  createMeeting: (data: {associationId: string; type?: string; date?: string; scheduledTime?: string; location?: string}) =>
    request<Meeting>('/api/meetings', {method: 'POST', body: body(data)}),
  saveMeeting: (meeting: Meeting) =>
    request<Meeting & {staleWrite?: boolean}>(`/api/meetings/${meeting.id}`, {method: 'PUT', body: body(meeting)}),
  deleteMeeting: (id: string) => request<{deleted: boolean}>(`/api/meetings/${id}`, {method: 'DELETE'}),
  finalizeMeeting: (id: string) => request<Meeting>(`/api/meetings/${id}/finalize`, {method: 'POST'}),
  reopenMeeting: (id: string) => request<Meeting>(`/api/meetings/${id}/reopen`, {method: 'POST'}),

  shareMeeting: (id: string) =>
    request<{shareToken: string; url: string; meeting: Meeting}>(`/api/meetings/${id}/share`, {method: 'POST'}),
  unshareMeeting: (id: string) =>
    request<{revoked: boolean; meeting: Meeting}>(`/api/meetings/${id}/share`, {method: 'DELETE'}),
  minutesText: (id: string) => request<{text: string}>(`/api/meetings/${id}/text`),

  uploadAgendaFile: (id: string, filename: string, dataUrl: string) =>
    request<Meeting>(`/api/meetings/${id}/agenda-file`, {method: 'POST', body: body({filename, dataUrl})}),
  removeAgendaFile: (id: string) => request<Meeting>(`/api/meetings/${id}/agenda-file`, {method: 'DELETE'}),

  emailStatus: () =>
    request<{configured: boolean; ok: boolean; error?: string; provider?: string; from?: string}>('/api/email/status'),
  emailMinutes: (id: string, data: {to: string[]; cc?: string[]; subject?: string; message?: string; attachPdf?: boolean}) =>
    request<{provider: string; recipients: number; meeting: Meeting}>(`/api/meetings/${id}/email`, {
      method: 'POST',
      body: body(data),
    }),

  formatNote: (data: {text: string; associationName: string; agendaItem?: string; section: SectionKey; attendees: string[]}) =>
    request<FormattedNote>('/api/ai/note', {method: 'POST', body: body(data)}),
  polishMotion: (text: string) => request<{text: string; aiAssisted: boolean}>('/api/ai/motion', {method: 'POST', body: body({text})}),
  summarize: (id: string) => request<GeneratedSummary & {meeting: Meeting}>(`/api/meetings/${id}/summary`, {method: 'POST'}),

  accessCodes: () => request<AccessCodeRow[]>('/api/access-codes'),
  createAccessCode: (data: {label: string; code: string; role: 'admin' | 'manager'}) =>
    request<AccessCodeRow>('/api/access-codes', {method: 'POST', body: body(data)}),
  setAccessCodeDisabled: (id: string, disabled: boolean) =>
    request<{ok: boolean}>(`/api/access-codes/${id}`, {method: 'PATCH', body: body({disabled})}),
  deleteAccessCode: (id: string) => request<{deleted: boolean}>(`/api/access-codes/${id}`, {method: 'DELETE'}),

  sharedMinutes: (token: string) =>
    request<{meeting: Meeting; brandName: string; brandShort: string}>(`/api/share/${encodeURIComponent(token)}`),
};

export const pdfUrl = (id: string, download = false) =>
  appPath(`/api/meetings/${id}/pdf${download ? '?download=1' : ''}`);
export const sharedPdfUrl = (token: string, download = false) =>
  appPath(`/api/share/${encodeURIComponent(token)}/pdf${download ? '?download=1' : ''}`);
export const agendaFileUrl = (id: string) => appPath(`/api/meetings/${id}/agenda-file`);
export const sharePageUrl = (token: string) => `${window.location.origin}${appPath(`/m/${token}`)}`;
