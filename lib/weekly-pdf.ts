import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { ReportNote } from './domain';
import { weeklyUpdateContent, type ClientProject } from './weekly-update';

function safeText(value: string, font: PDFFont) {
  return Array.from(value.replace(/\r\n?/g, '\n').replaceAll('\t', ' ')).map(char => {
    if (char === '\n') return char;
    try { font.encodeText(char); return char; }
    catch { return '?'; }
  }).join('');
}

function wrap(value: string, font: PDFFont, size: number, width: number) {
  const fits = (text: string) => font.widthOfTextAtSize(text, size) <= width;
  return safeText(value, font).split('\n').flatMap(paragraph => {
    let line = '';
    const lines: string[] = [];
    for (const word of paragraph.trim().split(/\s+/)) {
      const joined = line ? line + ' ' + word : word;
      if (fits(joined)) { line = joined; continue; }
      if (line) lines.push(line);
      line = '';
      for (const char of word) {
        if (line && !fits(line + char)) { lines.push(line); line = ''; }
        line += char;
      }
    }
    lines.push(line);
    return lines;
  });
}

export async function weeklyUpdatePdf(project: ClientProject, note: ReportNote) {
  const update = weeklyUpdateContent(project, note);
  const doc = await PDFDocument.create();
  doc.setTitle('Weekly project update · ' + note.weekStart);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(.09, .21, .17), muted = rgb(.30, .43, .38), rule = rgb(.82, .88, .84);
  const [width, height] = [595.28, 841.89];
  const margin = 48, inner = width - margin * 2;
  let page: PDFPage, y = 0;
  function draw(text: string, font: PDFFont, size: number, color = ink) {
    page.drawText(text, { x: margin, y, font, size, color });
  }
  function nextPage() {
    page = doc.addPage([width, height]);
    page.drawRectangle({ x: 0, y: height - 10, width, height: 10, color: ink });
    y = height - margin;
    for (const line of wrap(update.firm, bold, 11, inner)) {
      draw(line, bold, 11);
      y -= 15;
    }
    draw(safeText(update.copy, regular), regular, 9, muted);
    y -= 30;
  }
  function paragraph(text: string, font = regular, size = 11, leading = 17, color = ink) {
    for (const line of wrap(text, font, size, inner)) {
      if (y < 66) nextPage();
      draw(line, font, size, color);
      y -= leading;
    }
  }
  nextPage();
  paragraph('Weekly project update', bold, 24, 31);
  paragraph(update.name, bold, 16, 22);
  paragraph(update.location + ' · ' + update.period, regular, 10, 16, muted);
  paragraph(update.stage + ' · ' + update.progress + '% reported progress', regular, 11, 18);
  y -= 10;
  for (const [title, value] of update.sections) {
    if (y < 110) nextPage();
    paragraph(title, bold, 12, 21);
    paragraph(value || 'None recorded.');
    y -= 14;
  }
  const pages = doc.getPages();
  pages.forEach((sheet, index) => {
    sheet.drawLine({ start: { x: margin, y: 52 }, end: { x: width - margin, y: 52 }, color: rule, thickness: .7 });
    sheet.drawText('CoreConstruct · Week starting ' + note.weekStart, { x: margin, y: 36, size: 9, font: regular, color: muted });
    const count = (index + 1) + ' / ' + pages.length;
    sheet.drawText(count, { x: width - margin - regular.widthOfTextAtSize(count, 9), y: 36, size: 9, font: regular, color: muted });
  });
  return doc.save();
}
