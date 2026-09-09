/**
 * The built-in note formatter.
 *
 * It runs on the server when no AI key is configured, and in the browser for
 * the "as typed" button, so both paths produce the same shape of minute entry.
 * It is deliberately conservative: it tidies and classifies, it never invents.
 */
import type {FormattedNote, SectionKey} from './types';

/** Everyday shorthand that is safe to expand without changing meaning. */
const SHORTHAND: [RegExp, string][] = [
  [/\bacct(s)?\b/gi, 'account$1'],
  [/\bmgmt\b/gi, 'management'],
  [/\bmgr\b/gi, 'manager'],
  [/\bppty\b/gi, 'property'],
  [/\bw\/\s*/gi, 'with '],
  [/\bb\/c\b/gi, 'because'],
  [/\bapprvd\b/gi, 'approved'],
  [/\bdelinq\b/gi, 'delinquent'],
  [/\bassoc\b/gi, 'association'],
  [/\bcmte\b/gi, 'committee'],
  [/\bhoa\b/gi, 'HOA'],
];

const SECTION_HINTS: {re: RegExp; section: SectionKey}[] = [
  {re: /\b(prior|previous|last month'?s?)\s+minutes\b/i, section: 'MINUTES_APPROVAL'},
  {re: /\b(treasurer|financial|balance sheet|budget|reserve|delinquent|audit|income statement|operating account)\b/i, section: 'REPORTS'},
  {re: /\b(manager|management)\b[^.]*\b(report|reported|says|said|advised)\b/i, section: 'REPORTS'},
  {re: /\b(committee|architectural|landscap\w+ committee|social committee)\b/i, section: 'REPORTS'},
  {re: /\b(homeowner|resident|open forum|floor was opened)\b|\bowner\b[^.]*\b(unit|building)\b|\bunit\s*\d+\b/i, section: 'FORUM'},
  {re: /\b(executive session|litigation|personnel matter|legal counsel|collection action)\b/i, section: 'EXECUTIVE'},
  {re: /\b(carried over|tabled at the last|unfinished business|follow[- ]up from)\b/i, section: 'UNFINISHED'},
  {re: /\b(next meeting|adjourn)\b/i, section: 'CLOSING'},
];

/** Recognisable subjects give a far better heading than truncated shorthand. */
const TITLE_HINTS: {re: RegExp; title: string}[] = [
  {re: /\btreasurer\b|\bfinancial statement|\bbalance sheet\b/i, title: "Treasurer's report"},
  {re: /\b(manager|management)\b[^.]*\b(report|reported|says|said|advised)\b/i, title: "Community manager's report"},
  {re: /\b(president|chair)\b[^.]*\b(report|reported)\b/i, title: "President's report"},
  {re: /\barchitectural\b|\barc\b/i, title: 'Architectural review'},
  {re: /\breserve stud/i, title: 'Reserve study'},
  {re: /\bdelinquent|\bcollection/i, title: 'Delinquent accounts'},
  {re: /\binsurance\b/i, title: 'Insurance'},
  {re: /\bbudget\b/i, title: 'Budget'},
  {re: /\blandscap/i, title: 'Landscaping'},
  {re: /\broof(ing)?\b/i, title: 'Roofing'},
  {re: /\bpool\b/i, title: 'Pool'},
  {re: /\bparking\b/i, title: 'Parking'},
  {re: /\bpav(ing|ement)\b|\basphalt\b/i, title: 'Paving'},
  {re: /\birrigation\b|\bbackflow\b/i, title: 'Irrigation and backflow'},
  {re: /\bsnow\b/i, title: 'Snow removal'},
  {re: /\btrash\b|\brefuse\b|\brecycl/i, title: 'Trash and recycling'},
  {re: /\bviolation\b|\bfine\b/i, title: 'Covenant enforcement'},
  {re: /\bvendor\b|\bproposal\b|\bbid\b/i, title: 'Vendor proposals'},
];

const ACTION_VERBS =
  /\b(follow up|obtain|send|schedule|draft|circulate|contact|solicit|review|inspect|prepare|provide|forward|arrange|research|post|notify|distribute|request|confirm|repair|replace)\b/i;
const ACTION_CUE = /\b(will|to|should|is to|are to|agreed to|directed to|asked to)\s/i;

function sentenceCase(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function expandShorthand(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SHORTHAND) out = out.replace(pattern, replacement);
  return out;
}

/** Break text into clauses so an action can be lifted without dragging the whole sentence along. */
function clauses(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|[;,](?=\s)/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function deriveTitle(text: string, fallbackWords = 8): string {
  for (const hint of TITLE_HINTS) if (hint.re.test(text)) return hint.title;

  const firstClause = clauses(text)[0] ?? text;
  const words = firstClause.replace(/[.!?]+$/, '').split(/\s+/);
  const clipped = words.slice(0, fallbackWords).join(' ');
  const title = sentenceCase(clipped);
  return words.length > fallbackWords ? `${title}…` : title;
}

export function formatNoteLocally(rawText: string, fallbackSection: SectionKey): FormattedNote {
  const cleaned = expandShorthand(rawText.trim().replace(/\s+/g, ' '));
  if (!cleaned) {
    return {title: 'Discussion', body: '', actionItems: [], suggestedSection: fallbackSection, aiAssisted: false};
  }

  let body = sentenceCase(cleaned);
  if (!/[.!?]$/.test(body)) body += '.';

  const actionItems = clauses(cleaned)
    .filter((clause) => ACTION_VERBS.test(clause) && ACTION_CUE.test(clause))
    .map((clause) => sentenceCase(clause.replace(/^(and|then|also)\s+/i, '').replace(/[.!?]+$/, '')))
    .filter((clause) => clause.split(/\s+/).length >= 3)
    .slice(0, 5);

  let section = fallbackSection;
  for (const hint of SECTION_HINTS) {
    if (hint.re.test(cleaned)) {
      section = hint.section;
      break;
    }
  }

  return {title: deriveTitle(cleaned), body, actionItems, suggestedSection: section, aiAssisted: false};
}
