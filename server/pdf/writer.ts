/**
 * A small, dependency-free PDF writer.
 *
 * Scope is deliberately narrow: the base-14 fonts, WinAnsi text, straight
 * lines and filled rectangles - everything a minutes document needs, and
 * nothing else. Output is a plain uncompressed PDF 1.4 file.
 */
import {FONT_WIDTHS} from './widths';

export type FontName = 'Helvetica' | 'Helvetica-Bold' | 'Helvetica-Oblique' | 'Times-Roman' | 'Times-Bold' | 'Times-Italic';

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export const rgb = (r: number, g: number, b: number): RGB => ({r, g, b});
export const gray = (v: number): RGB => ({r: v, g: v, b: v});

/** Map a JS string onto the WinAnsi code points the base-14 fonts understand. */
const WIN_ANSI_SPECIALS: Record<string, number> = {
  '€': 128, '‚': 130, 'ƒ': 131, '„': 132, '…': 133, '†': 134,
  '‡': 135, 'ˆ': 136, '‰': 137, 'Š': 138, '‹': 139, 'Œ': 140,
  'Ž': 142, '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149,
  '–': 150, '—': 151, '˜': 152, '™': 153, 'š': 154, '›': 155,
  'œ': 156, 'ž': 158, 'Ÿ': 159,
};

function toWinAnsi(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp === 9) {
      out.push(32);
    } else if (cp >= 32 && cp <= 126) {
      out.push(cp);
    } else if (WIN_ANSI_SPECIALS[ch] !== undefined) {
      out.push(WIN_ANSI_SPECIALS[ch]);
    } else if (cp >= 160 && cp <= 255) {
      out.push(cp);
    } else {
      out.push(63); // '?'
    }
  }
  return out;
}

export function measureText(text: string, font: FontName, size: number): number {
  const widths = FONT_WIDTHS[font] ?? FONT_WIDTHS.Helvetica;
  let total = 0;
  for (const code of toWinAnsi(text)) total += widths[code] || widths[32];
  return (total * size) / 1000;
}

/** Greedy word wrap; hard-splits any single word wider than the column. */
export function wrapText(text: string, font: FontName, size: number, maxWidth: number): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measureText(candidate, font, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (measureText(word, font, size) <= maxWidth) {
        line = word;
        continue;
      }
      // A single unbreakable token wider than the column.
      let chunk = '';
      for (const ch of word) {
        if (measureText(chunk + ch, font, size) > maxWidth && chunk) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      line = chunk;
    }
    if (line) lines.push(line);
  }
  return lines;
}

function escapePdfString(codes: number[]): string {
  let out = '';
  for (const code of codes) {
    if (code === 0x28 || code === 0x29 || code === 0x5c) out += '\\' + String.fromCharCode(code);
    else if (code < 32 || code > 126) out += '\\' + code.toString(8).padStart(3, '0');
    else out += String.fromCharCode(code);
  }
  return out;
}

const f = (n: number): string => (Math.round(n * 100) / 100).toString();

class Page {
  ops: string[] = [];
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}
}

export interface PdfMeta {
  title?: string;
  author?: string;
  subject?: string;
  creator?: string;
}

export class PdfDocument {
  private pages: Page[] = [];
  private current: Page;
  private usedFonts = new Set<FontName>();

  constructor(
    readonly pageWidth = 612,
    readonly pageHeight = 792,
    private meta: PdfMeta = {},
  ) {
    this.current = new Page(pageWidth, pageHeight);
    this.pages.push(this.current);
  }

  get pageCount(): number {
    return this.pages.length;
  }

  addPage(): void {
    this.current = new Page(this.pageWidth, this.pageHeight);
    this.pages.push(this.current);
  }

  /** Draw on a page that is not the current one (used for footers). */
  private opsFor(pageIndex?: number): string[] {
    if (pageIndex === undefined) return this.current.ops;
    const page = this.pages[pageIndex];
    if (!page) throw new Error(`No such page ${pageIndex}`);
    return page.ops;
  }

  text(
    value: string,
    x: number,
    y: number,
    opts: {font?: FontName; size?: number; color?: RGB; charSpacing?: number; pageIndex?: number} = {},
  ): void {
    if (!value) return;
    const font = opts.font ?? 'Helvetica';
    const size = opts.size ?? 10;
    const color = opts.color ?? gray(0);
    this.usedFonts.add(font);
    const ops = this.opsFor(opts.pageIndex);
    ops.push('BT');
    ops.push(`${f(color.r)} ${f(color.g)} ${f(color.b)} rg`);
    if (opts.charSpacing) ops.push(`${f(opts.charSpacing)} Tc`);
    ops.push(`/${fontKey(font)} ${f(size)} Tf`);
    ops.push(`1 0 0 1 ${f(x)} ${f(this.pageHeight - y)} Tm`);
    ops.push(`(${escapePdfString(toWinAnsi(value))}) Tj`);
    if (opts.charSpacing) ops.push('0 Tc');
    ops.push('ET');
  }

  line(x1: number, y1: number, x2: number, y2: number, opts: {width?: number; color?: RGB; pageIndex?: number} = {}): void {
    const color = opts.color ?? gray(0.7);
    const ops = this.opsFor(opts.pageIndex);
    ops.push(`${f(color.r)} ${f(color.g)} ${f(color.b)} RG`);
    ops.push(`${f(opts.width ?? 0.6)} w`);
    ops.push(`${f(x1)} ${f(this.pageHeight - y1)} m ${f(x2)} ${f(this.pageHeight - y2)} l S`);
  }

  rect(x: number, y: number, w: number, h: number, opts: {color?: RGB; pageIndex?: number} = {}): void {
    const color = opts.color ?? gray(0.95);
    const ops = this.opsFor(opts.pageIndex);
    ops.push(`${f(color.r)} ${f(color.g)} ${f(color.b)} rg`);
    ops.push(`${f(x)} ${f(this.pageHeight - y - h)} ${f(w)} ${f(h)} re f`);
  }

  /* --- serialisation ------------------------------------------------------ */

  toBuffer(): Buffer {
    // Object numbers are reserved up front so forward references are exact.
    const fonts = [...this.usedFonts];
    if (fonts.length === 0) fonts.push('Helvetica');

    let nextNum = 1;
    const reserve = () => nextNum++;

    const fontNums = new Map<FontName, number>();
    for (const font of fonts) fontNums.set(font, reserve());

    const pagesNum = reserve();
    const pageNums = this.pages.map(() => ({page: reserve(), content: reserve()}));
    const infoNum = reserve();
    const catalogNum = reserve();

    const bodies = new Map<number, string>();
    for (const font of fonts) {
      bodies.set(fontNums.get(font)!, `<< /Type /Font /Subtype /Type1 /BaseFont /${font} /Encoding /WinAnsiEncoding >>`);
    }

    const resources = `<< /Font << ${fonts.map((name) => `/${fontKey(name)} ${fontNums.get(name)} 0 R`).join(' ')} >> >>`;

    this.pages.forEach((page, i) => {
      const content = page.ops.join('\n');
      bodies.set(
        pageNums[i].content,
        `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
      );
      bodies.set(
        pageNums[i].page,
        `<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${f(page.width)} ${f(page.height)}] ` +
          `/Resources ${resources} /Contents ${pageNums[i].content} 0 R >>`,
      );
    });

    bodies.set(
      pagesNum,
      `<< /Type /Pages /Count ${this.pages.length} /Kids [${pageNums.map((n) => `${n.page} 0 R`).join(' ')}] >>`,
    );

    const infoParts = [
      this.meta.title ? `/Title (${escapePdfString(toWinAnsi(this.meta.title))})` : '',
      this.meta.author ? `/Author (${escapePdfString(toWinAnsi(this.meta.author))})` : '',
      this.meta.subject ? `/Subject (${escapePdfString(toWinAnsi(this.meta.subject))})` : '',
      `/Producer (${escapePdfString(toWinAnsi(this.meta.creator || 'Board Minutes'))})`,
      `/CreationDate (D:${pdfDate(new Date())})`,
    ].filter(Boolean);
    bodies.set(infoNum, `<< ${infoParts.join(' ')} >>`);
    bodies.set(catalogNum, `<< /Type /Catalog /Pages ${pagesNum} 0 R >>`);

    const total = nextNum - 1;
    let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const offsets = new Array<number>(total + 1).fill(0);
    for (let num = 1; num <= total; num++) {
      offsets[num] = Buffer.byteLength(out, 'latin1');
      out += `${num} 0 obj\n${bodies.get(num) ?? '<< >>'}\nendobj\n`;
    }

    const xrefOffset = Buffer.byteLength(out, 'latin1');
    out += `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
    for (let num = 1; num <= total; num++) out += `${String(offsets[num]).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${total + 1} /Root ${catalogNum} 0 R /Info ${infoNum} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

    return Buffer.from(out, 'latin1');
  }
}

function fontKey(font: FontName): string {
  return 'F' + font.replace(/[^A-Za-z]/g, '');
}

function pdfDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}` +
    `${sign}${p(Math.floor(Math.abs(offset) / 60))}'${p(Math.abs(offset) % 60)}'`
  );
}
