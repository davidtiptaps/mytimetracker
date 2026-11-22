import { jsPDF } from 'jspdf';
import { autoTable, type CellHookData, type RowInput } from 'jspdf-autotable';
import { format } from 'date-fns';
import { entryAmount, entryHours, type Lookup, type ReportGroup, type Totals } from './calc';
import { formatMoney } from './format';
import { itemLook } from './look';

export { deliverFile } from './share';
import type { Entry } from './types';

export interface ReportData {
  groups: ReportGroup[];
  totals: Totals;
  from: number;
  /** Exclusive end. */
  to: number;
  lookup: Lookup;
}

const fileStamp = (r: ReportData) => `${format(r.from, 'yyyy-MM-dd')}_to_${format(r.to - 1, 'yyyy-MM-dd')}`;
const rangeLabel = (r: ReportData) => `${format(r.from, 'd MMM yyyy')} – ${format(r.to - 1, 'd MMM yyyy')}`;

// ---------- CSV ----------

export function reportCsv(r: ReportData): Blob {
  const { settings } = r.lookup;
  const rows: (string | number)[][] = [
    ['Date', 'Start', 'End', 'Project', 'Item', 'Type', 'Hours', 'Billable', 'Rate', 'Amount', 'Currency', 'Note'],
  ];
  for (const g of r.groups) {
    for (const row of g.rows) {
      for (const e of row.entries) {
        const end = e.end ?? Date.now();
        rows.push([
          format(e.start, 'yyyy-MM-dd'),
          format(e.start, 'HH:mm'),
          format(end, 'HH:mm'),
          g.project.name,
          row.item.name,
          e.kind === 'plan' ? 'Planned' : 'Worked',
          entryHours(e).toFixed(2),
          e.kind === 'plan' ? '' : e.billable ? 'Yes' : 'No',
          row.rate.toFixed(2),
          e.kind === 'plan' ? '' : entryAmount(e, r.lookup).toFixed(2),
          settings.currency,
          e.note,
        ]);
      }
    }
  }
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // The BOM makes Excel read names with accents correctly.
  const csv = '﻿' + rows.map((row) => row.map(escape).join(',')).join('\r\n');
  return new Blob([csv], { type: 'text/csv;charset=utf-8' });
}

export function csvFilename(r: ReportData) {
  return `time-report_${fileStamp(r)}.csv`;
}

// ---------- PDF ----------

// The PDF's built-in fonts only cover Western European characters, so
// emojis are drawn as small images and other characters are dropped.
const PDF_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
function pdfSafe(s: string): string {
  return s
    .replace(/[   ]/g, ' ')
    .replace(/−/g, '-')
    .replace(/./gu, (ch) => (ch.charCodeAt(0) <= 0xff || PDF_EXTRA.includes(ch) ? ch : ''))
    .trim();
}

function pdfMoney(amount: number, currency: string): string {
  const text = formatMoney(amount, currency);
  const safe = pdfSafe(text);
  if (safe.replace(/\s/g, '') === text.replace(/[\s  ]/g, '')) return safe;
  // The symbol isn't printable (e.g. ₹): show the code instead.
  return pdfSafe(new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'code' }).format(amount));
}

const emojiCache = new Map<string, string>();
function emojiImage(emoji: string): string {
  let url = emojiCache.get(emoji);
  if (!url) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.font = '52px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 32, 36);
    url = canvas.toDataURL('image/png');
    emojiCache.set(emoji, url);
  }
  return url;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [120, 120, 120];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const tint = (rgb: [number, number, number], amount: number): [number, number, number] =>
  rgb.map((c) => Math.round(c + (255 - c) * amount)) as [number, number, number];

const hrs = (h: number) => (h ? h.toFixed(2) : '–');

export function reportPdf(r: ReportData): Blob {
  const { settings } = r.lookup;
  const money = (v: number) => pdfMoney(v, settings.currency);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40;
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Time report', margin, 56);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(rangeLabel(r), margin, 74);
  doc.text(`Generated ${format(Date.now(), 'd MMM yyyy, HH:mm')}`, pageWidth - margin, 74, { align: 'right' });

  // Headline numbers
  const tiles: [string, string][] = [
    ['Worked', `${r.totals.hours.toFixed(2)} h`],
    ['Planned', `${r.totals.plannedHours.toFixed(2)} h`],
    ['Billable', `${r.totals.billableHours.toFixed(2)} h`],
    ['Amount', money(r.totals.amount)],
  ];
  const tileW = (pageWidth - margin * 2 - 18) / 4;
  tiles.forEach(([label, value], i) => {
    const x = margin + i * (tileW + 6);
    doc.setFillColor(244, 242, 236);
    doc.roundedRect(x, 88, tileW, 46, 6, 6, 'F');
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(label.toUpperCase(), x + 10, 104);
    doc.setFontSize(13);
    doc.setTextColor(30);
    doc.setFont('helvetica', 'bold');
    doc.text(value, x + 10, 124);
    doc.setFont('helvetica', 'normal');
  });

  // Summary table: one shaded row per project, then its items.
  type Meta = { emoji: string; color: [number, number, number]; kind: 'group' | 'item' | 'total' };
  const meta: Meta[] = [];
  const body: RowInput[] = [];
  for (const g of r.groups) {
    const color = hexToRgb(g.project.color);
    meta.push({ emoji: g.project.emoji, color, kind: 'group' });
    body.push([
      pdfSafe(g.project.name),
      hrs(g.totals.plannedHours),
      hrs(g.totals.hours),
      hrs(g.totals.billableHours),
      '',
      money(g.totals.amount),
    ]);
    for (const row of g.rows) {
      const look = itemLook(row.item, g.project);
      meta.push({ emoji: look.emoji, color: hexToRgb(look.color), kind: 'item' });
      body.push([
        pdfSafe(row.item.name),
        hrs(row.totals.plannedHours),
        hrs(row.totals.hours),
        hrs(row.totals.billableHours),
        `${money(row.rate)}/h`,
        money(row.totals.amount),
      ]);
    }
  }

  autoTable(doc, {
    startY: 152,
    margin: { left: margin, right: margin },
    head: [['Project / item', 'Planned h', 'Worked h', 'Billable h', 'Rate', 'Amount']],
    body,
    foot: [['Total', hrs(r.totals.plannedHours), hrs(r.totals.hours), hrs(r.totals.billableHours), '', money(r.totals.amount)]],
    theme: 'plain',
    styles: { fontSize: 9.5, cellPadding: { top: 6, bottom: 6, left: 6, right: 6 }, textColor: 30 },
    headStyles: { textColor: 110, fontStyle: 'normal', fontSize: 8.5, lineWidth: { bottom: 0.8 }, lineColor: 200 },
    footStyles: { fontStyle: 'bold', lineWidth: { top: 1.2 }, lineColor: 40 },
    columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    didParseCell: (d) => {
      if (d.section === 'head' && d.column.index > 0) d.cell.styles.halign = 'right';
      if (d.section === 'foot' && d.column.index > 0) d.cell.styles.halign = 'right';
      if (d.section !== 'body') return;
      const m = meta[d.row.index];
      if (m.kind === 'group') {
        d.cell.styles.fillColor = tint(m.color, 0.85);
        d.cell.styles.fontStyle = 'bold';
      }
      if (d.column.index === 0) d.cell.styles.cellPadding = { top: 6, bottom: 6, left: m.kind === 'group' ? 26 : 40, right: 6 };
    },
    didDrawCell: (d: CellHookData) => {
      if (d.section !== 'body' || d.column.index !== 0) return;
      const m = meta[d.row.index];
      const x = d.cell.x + (m.kind === 'group' ? 4 : 18);
      const size = 13;
      const y = d.cell.y + (d.cell.height - size) / 2;
      if (m.kind === 'item') {
        doc.setFillColor(...m.color);
        doc.rect(d.cell.x + 4, d.cell.y + 4, 3, d.cell.height - 8, 'F');
      }
      doc.addImage(emojiImage(m.emoji), 'PNG', x, y, size, size);
    },
  });

  // Detail: every worked entry.
  const worked: { e: Entry; g: ReportGroup; rate: number }[] = [];
  for (const g of r.groups) for (const row of g.rows) for (const e of row.entries) if (e.kind === 'actual') worked.push({ e, g, rate: row.rate });
  worked.sort((a, b) => a.e.start - b.e.start);

  if (worked.length) {
    const startY = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY ?? 152) + 30;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(30);
    doc.text('Entries', margin, startY);
    const colors: [number, number, number][] = [];
    autoTable(doc, {
      startY: startY + 8,
      margin: { left: margin, right: margin },
      head: [['Date', 'Time', 'Item', 'Note', 'Hours', 'Amount']],
      body: worked.map(({ e, g }) => {
        const item = r.lookup.items.get(e.itemId);
        colors.push(hexToRgb(itemLook(item, g.project).color));
        return [
          format(e.start, 'EEE d MMM'),
          `${format(e.start, 'HH:mm')}–${e.end ? format(e.end, 'HH:mm') : 'now'}`,
          pdfSafe(`${g.project.name} › ${item?.name ?? ''}`),
          pdfSafe(e.note),
          entryHours(e).toFixed(2),
          e.billable ? money(entryAmount(e, r.lookup)) : 'non-billable',
        ];
      }),
      theme: 'striped',
      styles: { fontSize: 8.5, cellPadding: 4, textColor: 30 },
      headStyles: { fillColor: [47, 111, 94], textColor: 255 },
      alternateRowStyles: { fillColor: [247, 245, 240] },
      columnStyles: { 0: { cellWidth: 62 }, 1: { cellWidth: 64 }, 2: { cellWidth: 120 }, 4: { halign: 'right', cellWidth: 42 }, 5: { halign: 'right', cellWidth: 70 } },
      didParseCell: (d) => {
        if (d.section === 'head' && d.column.index >= 4) d.cell.styles.halign = 'right';
        if (d.section === 'body' && d.column.index === 2) d.cell.styles.cellPadding = { top: 4, bottom: 4, left: 10, right: 4 };
      },
      didDrawCell: (d) => {
        if (d.section !== 'body' || d.column.index !== 2) return;
        doc.setFillColor(...colors[d.row.index]);
        doc.rect(d.cell.x + 2, d.cell.y + 3, 3, d.cell.height - 6, 'F');
      },
    });
  }

  // Page numbers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`Page ${i} of ${pages}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 20, { align: 'right' });
  }

  return doc.output('blob');
}

export function pdfFilename(r: ReportData) {
  return `time-report_${fileStamp(r)}.pdf`;
}

