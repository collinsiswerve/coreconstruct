import { strToU8, zipSync } from 'fflate';

// Put user text in inline string cells so Excel reads it as data, including text starting with =.
const xml = (value: string) => Array.from(value).filter(char => {
  const point = char.codePointAt(0)!;
  return point === 9 || point === 10 || point === 13 || point >= 32 && point !== 0xfffe && point !== 0xffff
    && (point < 0xd800 || point > 0xdfff);
}).join('').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll('\r', '&#13;');

const sheetNamespace = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const documentRelationships = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const packageRelationships = 'http://schemas.openxmlformats.org/package/2006/relationships';
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

export function weeklyWorkbook(rows: (string | number)[][]) {
  // Excel caps row height. Wrap long notes into continuation rows.
  const displayRows: (string | number)[][] = [];
  for (const [label, value] of rows) {
    if (typeof value === 'number') { displayRows.push([label, value]); continue; }
    const parts: string[] = [];
    let lines = 0;
    const flush = () => {
      displayRows.push([lines === 0 ? label : label + ' (continued)', parts.join('\n')]);
      parts.length = 0;
      lines++;
    };
    let wrappedLines = 0;
    for (const paragraph of value.split('\n')) {
      const height = Math.max(1, Math.ceil(Array.from(paragraph).length / 70));
      if (parts.length && wrappedLines + height > 22) { flush(); wrappedLines = 0; }
      if (height > 22) {
        const characters = Array.from(paragraph);
        for (let offset = 0; offset < characters.length; offset += 1540) {
          parts.push(characters.slice(offset, offset + 1540).join(''));
          if (offset + 1540 < characters.length) flush();
        }
        wrappedLines = 22;
      } else {
        parts.push(paragraph);
        wrappedLines += height;
      }
    }
    if (parts.length) flush();
  }
  const sheetRows = displayRows.map(([label, value], index) => {
    const number = index + 1;
    const style = index === 0 ? '1' : '2';
    const text = String(value);
    const lines = text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(Array.from(line).length / 70)), 0);
    const height = index === 0 ? 26 : Math.min(409, Math.max(20, 6 + 15 * lines));
    const cell = (column: string, content: string | number) => typeof content === 'number'
      ? `<c r="${column}${number}" s="${style}"><v>${content}</v></c>`
      : `<c r="${column}${number}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(content)}</t></is></c>`;
    return `<row r="${number}" ht="${height}" customHeight="1">${cell('A', label)}${cell('B', value)}</row>`;
  }).join('');

  const entries = {
    '[Content_Types].xml': `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
      <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
      <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
    </Types>`,
    '_rels/.rels': `<Relationships xmlns="${packageRelationships}">
      <Relationship Id="rId1" Type="${documentRelationships}/officeDocument" Target="xl/workbook.xml"/>
    </Relationships>`,
    'xl/workbook.xml': `<workbook xmlns="${sheetNamespace}" xmlns:r="${documentRelationships}">
      <sheets><sheet name="Weekly update" sheetId="1" r:id="rId1"/></sheets>
    </workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships xmlns="${packageRelationships}">
      <Relationship Id="rId1" Type="${documentRelationships}/worksheet" Target="worksheets/sheet1.xml"/>
      <Relationship Id="rId2" Type="${documentRelationships}/styles" Target="styles.xml"/>
    </Relationships>`,
    'xl/styles.xml': `<styleSheet xmlns="${sheetNamespace}">
      <fonts count="2"><font><sz val="11"/><color rgb="FF17372F"/><name val="Calibri"/></font>
      <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
      <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
      <fill><patternFill patternType="solid"><fgColor rgb="FF17372F"/><bgColor indexed="64"/></patternFill></fill></fills>
      <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
      <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
      <cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
      <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
      <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>
      <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
    </styleSheet>`,
    'xl/worksheets/sheet1.xml': `<worksheet xmlns="${sheetNamespace}">
      <dimension ref="A1:B${displayRows.length}"/>
      <cols><col min="1" max="1" width="29" customWidth="1"/><col min="2" max="2" width="79" customWidth="1"/></cols>
      <sheetData>${sheetRows}</sheetData>
    </worksheet>`,
  };
  return zipSync(Object.fromEntries(Object.entries(entries).map(([path, content]) => [path, strToU8(declaration + content)])));
}
