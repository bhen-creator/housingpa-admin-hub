/**
 * Renders a Meeting into a printable, letter-size PDF that reads like a
 * proper set of association minutes rather than a screen dump.
 */
import {
  collectActionItems,
  countPresent,
  describeVote,
  durationMinutes,
  formatDuration,
  groupEntries,
  hasQuorum,
  longDate,
  motionSentence,
  presentMembers,
  absentMembers,
} from '../../shared/logic';
import {MEETING_TYPE_LABEL, SECTION_LABEL, type Meeting} from '../../shared/types';
import {gray, PdfDocument, measureText, rgb, wrapText, type FontName} from './writer';

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_X = 62;
const MARGIN_TOP = 58;
const MARGIN_BOTTOM = 64;
const COL_W = PAGE_W - MARGIN_X * 2;

const INK = gray(0.09);
const MUTED = gray(0.42);
const RULE = gray(0.78);
const FAINT = gray(0.93);

const BODY: FontName = 'Times-Roman';
const BODY_BOLD: FontName = 'Times-Bold';
const BODY_ITALIC: FontName = 'Times-Italic';
const UI: FontName = 'Helvetica';
const UI_BOLD: FontName = 'Helvetica-Bold';

export interface MinutesPdfOptions {
  brandName?: string;
  /** Draw a DRAFT watermark line in the header until the minutes are finalized. */
  markDraft?: boolean;
}

class Layout {
  y = MARGIN_TOP;
  constructor(readonly doc: PdfDocument) {}

  get remaining(): number {
    return PAGE_H - MARGIN_BOTTOM - this.y;
  }

  need(height: number): void {
    if (height <= this.remaining) return;
    this.doc.addPage();
    this.y = MARGIN_TOP;
  }

  gap(h: number): void {
    this.y += h;
  }

  paragraph(
    text: string,
    opts: {font?: FontName; size?: number; color?: RGBish; indent?: number; leading?: number; spaceAfter?: number} = {},
  ): void {
    const font = opts.font ?? BODY;
    const size = opts.size ?? 10.5;
    const leading = opts.leading ?? size * 1.42;
    const indent = opts.indent ?? 0;
    const lines = wrapText(text, font, size, COL_W - indent);
    // Do not strand the first line of a paragraph at the very bottom of a page.
    if (lines.length > 1 && this.remaining < leading * 2) this.need(leading * 2);
    for (const line of lines) {
      this.need(leading);
      this.doc.text(line, MARGIN_X + indent, this.y + size * 0.85, {font, size, color: opts.color ?? INK});
      this.y += leading;
    }
    if (opts.spaceAfter) this.y += opts.spaceAfter;
  }

  rule(opts: {color?: RGBish; width?: number; inset?: number} = {}): void {
    this.need(6);
    this.doc.line(MARGIN_X + (opts.inset ?? 0), this.y, PAGE_W - MARGIN_X, this.y, {
      color: opts.color ?? RULE,
      width: opts.width ?? 0.6,
    });
    this.y += 1;
  }
}

type RGBish = ReturnType<typeof gray>;

export function renderMinutesPdf(meeting: Meeting, opts: MinutesPdfOptions = {}): Buffer {
  const doc = new PdfDocument(PAGE_W, PAGE_H, {
    title: `${meeting.associationName} — Board Meeting Minutes, ${longDate(meeting.date)}`,
    author: opts.brandName || 'Board Minutes',
    subject: MEETING_TYPE_LABEL[meeting.type],
    creator: opts.brandName || 'Board Minutes',
  });
  const L = new Layout(doc);
  const isDraft = meeting.status !== 'FINALIZED';

  /* --- title block ------------------------------------------------------- */

  if (opts.brandName) {
    doc.text(opts.brandName.toUpperCase(), MARGIN_X, L.y + 7, {font: UI_BOLD, size: 7.5, color: MUTED, charSpacing: 1.1});
    L.gap(16);
  }

  const title = meeting.associationName;
  const titleSize = measureText(title, BODY_BOLD, 19) > COL_W ? 15 : 19;
  for (const line of wrapText(title, BODY_BOLD, titleSize, COL_W)) {
    doc.text(line, MARGIN_X, L.y + titleSize * 0.82, {font: BODY_BOLD, size: titleSize, color: INK});
    L.gap(titleSize * 1.16);
  }

  doc.text(MEETING_TYPE_LABEL[meeting.type], MARGIN_X, L.y + 9, {font: BODY, size: 11.5, color: gray(0.28)});
  L.gap(15);
  doc.text(longDate(meeting.date), MARGIN_X, L.y + 9, {font: UI_BOLD, size: 10, color: INK});

  if (isDraft) {
    const badge = 'DRAFT — SUBJECT TO BOARD APPROVAL';
    const w = measureText(badge, UI_BOLD, 7.5) + 14;
    doc.rect(PAGE_W - MARGIN_X - w, L.y - 3, w, 15, {color: rgb(0.99, 0.94, 0.83)});
    doc.text(badge, PAGE_W - MARGIN_X - w + 7, L.y + 8, {font: UI_BOLD, size: 7.5, color: rgb(0.55, 0.32, 0.03)});
  }
  L.gap(16);
  L.rule({color: gray(0.25), width: 1.1});
  L.gap(12);

  /* --- fact strip -------------------------------------------------------- */

  const duration = formatDuration(durationMinutes(meeting.calledToOrderIso, meeting.adjournedIso));
  const facts: [string, string][] = [
    ['Called to order', meeting.calledToOrderAt || '—'],
    ['Adjourned', meeting.adjournedAt || (meeting.status === 'IN_SESSION' ? 'in session' : '—')],
    ['Duration', duration || '—'],
    ['Location', meeting.location || '—'],
  ];
  const colW = COL_W / 4;
  L.need(30);
  facts.forEach(([label, value], i) => {
    const x = MARGIN_X + colW * i;
    doc.text(label.toUpperCase(), x, L.y + 6, {font: UI_BOLD, size: 6.4, color: MUTED, charSpacing: 0.7});
    const lines = wrapText(value, UI, 9, colW - 8);
    doc.text(lines[0] ?? '—', x, L.y + 18, {font: UI, size: 9, color: INK});
    if (lines[1]) doc.text(lines[1], x, L.y + 28, {font: UI, size: 9, color: INK});
  });
  L.gap(facts.some(([, v]) => wrapText(v, UI, 9, colW - 8).length > 1) ? 40 : 30);
  L.rule({color: FAINT});
  L.gap(14);

  /* --- summary ----------------------------------------------------------- */

  if (meeting.executiveSummary) {
    sectionHeading(doc, L, 'Summary');
    L.paragraph(meeting.executiveSummary, {size: 10.5, spaceAfter: meeting.keyOutcomes?.length ? 6 : 12});
    if (meeting.keyOutcomes?.length) {
      for (const outcome of meeting.keyOutcomes) {
        L.need(14);
        doc.text('•', MARGIN_X + 6, L.y + 9, {font: BODY, size: 10.5, color: MUTED});
        L.paragraph(outcome, {size: 10, indent: 18, spaceAfter: 2});
      }
      L.gap(10);
    }
  }

  /* --- attendance -------------------------------------------------------- */

  sectionHeading(doc, L, 'Attendance');

  const present = presentMembers(meeting.attendance);
  const absent = absentMembers(meeting.attendance);

  labelledParagraph(
    doc,
    L,
    'Directors present',
    present.length
      ? present
          .map((m) => `${m.name}, ${m.role}${m.status === 'REMOTE' ? ' (participating remotely)' : ''}${m.arrivedAt ? ` (arrived ${m.arrivedAt})` : ''}`)
          .join('; ')
      : 'None recorded',
  );
  labelledParagraph(
    doc,
    L,
    'Absent',
    absent.length ? absent.map((m) => `${m.name}, ${m.role}${m.status === 'EXCUSED' ? ' (excused)' : ''}`).join('; ') : 'None',
  );
  if (meeting.guests.length) {
    labelledParagraph(
      doc,
      L,
      'Also present',
      meeting.guests.map((g) => (g.affiliation ? `${g.name} (${g.affiliation})` : g.name)).join('; '),
    );
  }

  const quorumOk = hasQuorum(meeting);
  L.gap(3);
  L.paragraph(
    quorumOk
      ? `A quorum was established: ${countPresent(meeting.attendance)} voting director${countPresent(meeting.attendance) === 1 ? ' was' : 's were'} present against the ${meeting.quorumRequired} required by the governing documents, and the Board proceeded to business.`
      : `A quorum was NOT established: ${countPresent(meeting.attendance)} voting directors were present against the ${meeting.quorumRequired} required. No binding action was taken.`,
    {font: BODY_ITALIC, size: 10, color: quorumOk ? gray(0.3) : rgb(0.65, 0.11, 0.11), spaceAfter: 14},
  );

  /* --- proceedings ------------------------------------------------------- */

  const groups = groupEntries(meeting.entries);
  let sectionNo = 0;

  for (const group of groups) {
    sectionNo++;
    L.need(76);
    sectionHeading(doc, L, `${sectionNo}. ${SECTION_LABEL[group.section]}`, {numbered: true});

    let itemNo = 0;
    for (const entry of group.entries) {
      itemNo++;
      L.need(46);

      // heading line: number, title, time
      const label = `${sectionNo}.${itemNo}`;
      const timeText = entry.time || '';
      const timeW = timeText ? measureText(timeText, UI, 8.2) : 0;
      const headWidth = COL_W - 26 - (timeW ? timeW + 12 : 0);
      const headLines = wrapText(entry.title, UI_BOLD, 10, headWidth);

      L.need(headLines.length * 13 + 8);
      doc.text(label, MARGIN_X, L.y + 9, {font: UI_BOLD, size: 8.4, color: MUTED});
      headLines.forEach((line, i) => {
        doc.text(line, MARGIN_X + 26, L.y + 9 + i * 12.4, {font: UI_BOLD, size: 10, color: INK});
      });
      if (timeText) doc.text(timeText, PAGE_W - MARGIN_X - timeW, L.y + 9, {font: UI, size: 8.2, color: MUTED});
      L.gap(headLines.length * 12.4 + 5);

      // Discussion first, then the motion, then the outcome - the order minutes are read in.
      if (entry.body) L.paragraph(entry.body, {size: 10.5, indent: 26, spaceAfter: entry.motion ? 4 : 3});

      if (entry.motion) {
        L.paragraph(motionSentence(entry.motion), {font: BODY, size: 10.5, indent: 26, spaceAfter: 2});
        if (entry.motion.vote) {
          L.paragraph(describeVote(entry.motion.vote, meeting.attendance), {
            font: BODY_BOLD,
            size: 10.2,
            indent: 26,
            spaceAfter: 3,
          });
        }
      }

      for (const action of entry.actionItems ?? []) {
        const text = `Action: ${action.text}${action.ownerName ? ` — ${action.ownerName}` : ''}${action.dueDate ? ` (due ${action.dueDate})` : ''}`;
        L.need(15);
        const top = L.y;
        L.paragraph(text, {font: UI, size: 8.8, indent: 34, color: gray(0.25), spaceAfter: 2});
        doc.line(MARGIN_X + 27, top + 1, MARGIN_X + 27, L.y - 2, {color: rgb(0.85, 0.6, 0.13), width: 1.6});
      }

      L.gap(7);
    }
    L.gap(4);
  }

  /* --- action register --------------------------------------------------- */

  const actions = collectActionItems(meeting.entries);
  if (actions.length) {
    sectionNo++;
    L.need(60);
    sectionHeading(doc, L, `${sectionNo}. Action Items`, {numbered: true});
    actions.forEach((action, i) => {
      L.need(18);
      doc.text(`${i + 1}.`, MARGIN_X + 4, L.y + 9, {font: UI_BOLD, size: 8.6, color: MUTED});
      const meta = [action.ownerName, action.dueDate ? `due ${action.dueDate}` : ''].filter(Boolean).join(' · ');
      L.paragraph(action.text, {size: 10.2, indent: 26, spaceAfter: meta ? 0 : 4});
      if (meta) L.paragraph(meta, {font: UI, size: 8.6, indent: 26, color: MUTED, spaceAfter: 5});
    });
    L.gap(8);
  }

  /* --- next meeting ------------------------------------------------------ */

  if (meeting.nextMeeting?.date) {
    L.need(34);
    const nm = meeting.nextMeeting;
    L.paragraph(
      `The next meeting of the Board is scheduled for ${longDate(nm.date!)}${nm.time ? ` at ${nm.time}` : ''}${nm.location ? `, ${nm.location}` : ''}.`,
      {size: 10.5, spaceAfter: 12},
    );
  }

  /* --- signatures -------------------------------------------------------- */

  L.need(120);
  L.gap(14);
  L.rule({color: FAINT});
  L.gap(26);

  const halfW = (COL_W - 40) / 2;
  const sigY = L.y;
  const signers: [string, string][] = [
    [meeting.recordingSecretaryName || '', 'Recording Secretary'],
    [meeting.presidingName || '', 'Presiding Officer'],
  ];
  signers.forEach(([name, role], i) => {
    const x = MARGIN_X + i * (halfW + 40);
    doc.line(x, sigY, x + halfW, sigY, {color: gray(0.55), width: 0.7});
    doc.text(name || ' ', x, sigY + 13, {font: BODY_BOLD, size: 10, color: INK});
    doc.text(role, x, sigY + 25, {font: UI, size: 8.2, color: MUTED});
    doc.text('Date: ____________________', x, sigY + 40, {font: UI, size: 8.2, color: gray(0.6)});
  });
  L.gap(52);

  L.paragraph(
    isDraft
      ? 'These minutes are a draft prepared from the record of the meeting and remain subject to review and approval by the Board of Directors at its next regular meeting.'
      : 'These minutes were approved by the Board of Directors and constitute the official record of the meeting.',
    {font: BODY_ITALIC, size: 9, color: MUTED},
  );

  /* --- footers ----------------------------------------------------------- */

  const shortDate = (() => {
    const [y, mo, d] = meeting.date.split('-').map(Number);
    return y && mo && d ? new Date(y, mo - 1, d).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'}) : meeting.date;
  })();
  const footerLeft = `${meeting.associationName} · ${shortDate}`;
  for (let i = 0; i < doc.pageCount; i++) {
    const y = PAGE_H - 40;
    doc.line(MARGIN_X, y - 10, PAGE_W - MARGIN_X, y - 10, {color: FAINT, width: 0.5, pageIndex: i});
    const leftLimit = isDraft ? COL_W / 2 - 46 : COL_W - 90;
    const left = wrapText(footerLeft, UI, 7.6, leftLimit)[0] ?? footerLeft;
    doc.text(left, MARGIN_X, y, {font: UI, size: 7.6, color: gray(0.55), pageIndex: i});
    const pageLabel = `Page ${i + 1} of ${doc.pageCount}`;
    doc.text(pageLabel, PAGE_W - MARGIN_X - measureText(pageLabel, UI, 7.6), y, {
      font: UI,
      size: 7.6,
      color: gray(0.55),
      pageIndex: i,
    });
    if (isDraft) {
      const draft = 'DRAFT';
      doc.text(draft, PAGE_W / 2 - measureText(draft, UI_BOLD, 7.6) / 2, y, {
        font: UI_BOLD,
        size: 7.6,
        color: rgb(0.75, 0.5, 0.1),
        pageIndex: i,
      });
    }
  }

  return doc.toBuffer();
}

function sectionHeading(doc: PdfDocument, L: Layout, text: string, opts: {numbered?: boolean} = {}): void {
  L.need(30);
  const size = opts.numbered ? 10.4 : 9.2;
  const font = UI_BOLD;
  doc.text(opts.numbered ? text : text.toUpperCase(), MARGIN_X, L.y + 9, {
    font,
    size,
    color: INK,
    charSpacing: opts.numbered ? 0 : 1,
  });
  L.gap(opts.numbered ? 15 : 13);
  L.rule({color: opts.numbered ? gray(0.35) : FAINT, width: opts.numbered ? 0.9 : 0.5});
  L.gap(opts.numbered ? 9 : 7);
}

function labelledParagraph(doc: PdfDocument, L: Layout, label: string, value: string): void {
  const labelW = 96;
  const lines = wrapText(value, BODY, 10.2, COL_W - labelW);
  L.need(lines.length * 13 + 4);
  doc.text(label, MARGIN_X, L.y + 9, {font: UI_BOLD, size: 8.4, color: MUTED});
  lines.forEach((line, i) => {
    doc.text(line, MARGIN_X + labelW, L.y + 9 + i * 13, {font: BODY, size: 10.2, color: INK});
  });
  L.gap(lines.length * 13 + 3);
}

export function minutesFilename(meeting: Meeting): string {
  const assoc = meeting.associationName.replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'Association';
  return `${assoc}_Minutes_${meeting.date}${meeting.status === 'FINALIZED' ? '' : '_DRAFT'}.pdf`;
}
