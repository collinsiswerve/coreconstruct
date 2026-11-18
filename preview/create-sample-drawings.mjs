import { mkdir, writeFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const folder = new URL('./public/samples/', import.meta.url);
await mkdir(folder, { recursive: true });

for (const revision of [1, 2]) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([720, 510]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(.09, .19, .16);
  const green = rgb(.19, .37, .3);
  const gray = rgb(.48, .55, .51);
  const wall = (x1, y1, x2, y2, thickness = 3) => page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color: ink });
  const label = (text, x, y, size = 11, face = font, color = ink) => page.drawText(text, { x, y, size, font: face, color });

  page.drawRectangle({ x: 26, y: 26, width: 668, height: 458, borderWidth: 1, borderColor: green });
  label('CORECONSTRUCT  /  FICTIONAL DEMO DRAWING', 48, 451, 11, bold, green);
  label('Sample residence', 48, 424, 22, bold);
  label('Ground-floor plan', 48, 405, 12);

  page.drawRectangle({ x: 157, y: 147, width: 389, height: 221, color: rgb(.98, .98, .96) });
  wall(157, 147, 157, 368);
  wall(157, 368, 546, 368);
  wall(546, 368, 546, 147);
  wall(157, 147, 315, 147);
  wall(351, 147, 546, 147);
  wall(283, 368, 283, 294);
  wall(283, 262, 283, 147);
  wall(435, 368, 435, 293);
  wall(435, 261, 435, 147);
  wall(157, 256, 247, 256, 2);
  wall(283, 256, 366, 256, 2);
  wall(398, 256, 435, 256, 2);
  wall(435, 256, 505, 256, 2);
  wall(532, 256, 546, 256, 2);
  label('BEDROOM 1', 182, 310);
  label('BEDROOM 2', 325, 310);
  label('BEDROOM 3', 455, 310);
  label('KITCHEN', 191, 205);
  label('LOUNGE', 322, 205);
  label('UTILITY', 461, 205);
  label('ENTRY', 314, 129, 9, bold, green);
  if (revision === 2) {
    page.drawRectangle({ x: 297, y: 108, width: 72, height: 38, borderWidth: 1.2, borderColor: green, borderDashArray: [4, 3] });
    label('Canopy extension', 383, 119, 9, font, green);
  }

  wall(47, 94, 673, 94, .7);
  label('A-101', 48, 63, 20, bold);
  label('Architectural drawing register', 48, 45, 9, font, gray);
  label('REVISION 0' + revision, 520, 66, 13, bold, green);
  label(revision === 1 ? 'Initial issue' : 'Entry canopy amendment', 520, 45, 9, font, gray);
  pdf.setTitle('A-101 · CoreConstruct sample ground-floor plan');
  await writeFile(new URL('floor-plan-r' + revision + '.pdf', folder), await pdf.save());
}
