/**
 * Optional AI assistance via the Gemini REST API (no SDK, just fetch).
 * Every function degrades to a deterministic local implementation, so the
 * app is fully usable with no API key configured.
 */
import {aiEnabled, env} from './env';
import {SECTIONS, type FormattedNote, type GeneratedSummary, type Meeting, type SectionKey} from '../shared/types';
import {formatNoteLocally} from '../shared/notes';
import {longDate} from '../shared/logic';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

async function generateJson<T>(prompt: string, timeoutMs = 20000): Promise<T | null> {
  if (!aiEnabled()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${ENDPOINT}/${encodeURIComponent(env.geminiModel)}:generateContent`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'x-goog-api-key': env.geminiKey},
      body: JSON.stringify({
        contents: [{role: 'user', parts: [{text: prompt}]}],
        generationConfig: {responseMimeType: 'application/json', temperature: 0.2},
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn(`[ai] ${response.status} ${response.statusText}`);
      return null;
    }
    const payload = (await response.json()) as {
      candidates?: {content?: {parts?: {text?: string}[]}}[];
    };
    const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch (err) {
    console.warn('[ai] falling back to local formatting:', (err as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */

export async function formatNote(
  rawText: string,
  ctx: {associationName: string; agendaItem?: string; section: SectionKey; attendees: string[]},
): Promise<FormattedNote> {
  const fallback = formatNoteLocally(rawText, ctx.section);

  const prompt = `You are an experienced recording secretary for a community association (HOA / condominium) board. You turn a manager's shorthand notes into one short passage of formal meeting minutes.

RULES
- Past tense, third person, neutral and factual. Record what was reported, discussed and decided.
- Invent nothing. Never add a dollar figure, date, vendor, or name that is not in the raw note.
- Use names exactly as they appear in the attendee list below.
- Do not editorialise or characterise anyone's tone.
- One to three sentences unless the note clearly covers more ground.
- If the note implies someone owes a follow-up, extract it as an action item.

Association: ${ctx.associationName || 'the Association'}
Current agenda item: ${ctx.agendaItem || 'General business'}
Present: ${ctx.attendees.slice(0, 25).join(', ') || 'not specified'}
Raw note: """${rawText.slice(0, 4000)}"""

Return only JSON:
{"title":"heading, max 8 words, no trailing period","body":"the minute paragraph","actionItems":["task - responsible person if stated"],"suggestedSection":one of ${JSON.stringify(SECTIONS)}}`;

  const parsed = await generateJson<{title?: unknown; body?: unknown; actionItems?: unknown; suggestedSection?: unknown}>(prompt);
  if (!parsed || typeof parsed.body !== 'string' || !parsed.body.trim()) return fallback;

  return {
    title: (typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title : fallback.title).slice(0, 200),
    body: parsed.body.slice(0, 4000),
    actionItems: Array.isArray(parsed.actionItems)
      ? parsed.actionItems.filter((a): a is string => typeof a === 'string' && a.trim().length > 0).slice(0, 10).map((a) => a.slice(0, 400))
      : [],
    suggestedSection: (SECTIONS as readonly string[]).includes(String(parsed.suggestedSection))
      ? (parsed.suggestedSection as SectionKey)
      : fallback.suggestedSection,
    aiAssisted: true,
  };
}

export async function polishMotion(rawText: string): Promise<{text: string; aiAssisted: boolean}> {
  const cleaned = rawText.trim().replace(/^to\s+/i, '').replace(/\.$/, '');
  const fallback = {text: cleaned.charAt(0).toUpperCase() + cleaned.slice(1), aiAssisted: false};

  const prompt = `Rewrite this board motion in standard parliamentary form so it reads naturally after the words "it was moved to". Keep every substantive detail (amounts, vendors, dates, conditions) exactly as given, add nothing, and do not start with the word "to".
Raw motion: """${rawText.slice(0, 1000)}"""
Return only JSON: {"text":"approve the ... proposal from ... in an amount not to exceed $..."}`;

  const parsed = await generateJson<{text?: unknown}>(prompt, 12000);
  if (!parsed || typeof parsed.text !== 'string' || !parsed.text.trim()) return fallback;
  return {text: parsed.text.trim().slice(0, 1000), aiAssisted: true};
}

export async function summarizeMeeting(meeting: Meeting): Promise<GeneratedSummary> {
  const motions = meeting.entries.filter((e) => e.kind === 'MOTION' && e.motion);
  const carried = motions.filter((e) => e.motion?.vote?.result === 'CARRIED');

  const fallback: GeneratedSummary = {
    summary: `The Board of Directors of ${meeting.associationName} met on ${longDate(meeting.date)} with a quorum present. The Board considered ${motions.length} motion${motions.length === 1 ? '' : 's'}, of which ${carried.length} carried, and adjourned at ${meeting.adjournedAt || 'the conclusion of business'}.`,
    keyOutcomes: carried.slice(0, 8).map((e) => e.motion!.text.replace(/\.$/, '')),
    aiAssisted: false,
  };

  const digest = [...meeting.entries]
    .sort((a, b) => a.order - b.order)
    .map((e) => {
      const vote = e.motion?.vote ? ` [${e.motion.vote.result} ${e.motion.vote.ayes}-${e.motion.vote.nays}]` : '';
      return `- (${e.section}) ${e.title}${vote}: ${e.body.slice(0, 400)}`;
    })
    .join('\n')
    .slice(0, 12000);

  const prompt = `Summarise these community association board meeting minutes for distribution to the board and homeowners.

Write 2-4 factual sentences about what the Board actually did, then list the concrete decisions and follow-ups. Use only the log below. Invent nothing, and do not soften or spin an outcome.

Association: ${meeting.associationName}
Date: ${meeting.date}
Log:
${digest}

Return only JSON: {"summary":"...","keyOutcomes":["decision or action item"]}`;

  const parsed = await generateJson<{summary?: unknown; keyOutcomes?: unknown}>(prompt, 30000);
  if (!parsed || typeof parsed.summary !== 'string' || !parsed.summary.trim()) return fallback;

  return {
    summary: parsed.summary.slice(0, 4000),
    keyOutcomes: Array.isArray(parsed.keyOutcomes)
      ? parsed.keyOutcomes.filter((k): k is string => typeof k === 'string').slice(0, 12).map((k) => k.slice(0, 400))
      : fallback.keyOutcomes,
    aiAssisted: true,
  };
}
