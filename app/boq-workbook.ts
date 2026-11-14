const maxWorkbookBytes = 2 * 1024 * 1024;
const maxUnpackedBytes = 16 * 1024 * 1024;

export async function readBoqWorkbook(file: File) {
  if (!/\.xlsx$/i.test(file.name) || !file.size || file.size > maxWorkbookBytes) {
    throw new Error('Choose an Excel .xlsx workbook up to 2 MB.');
  }
  const buffer = await file.arrayBuffer();
  const [{ unzipSync, strFromU8 }, { default: readSheet, readSheetNames }] = await Promise.all([
    import('fflate'),
    import('read-excel-file'),
  ]);
  let expanded = 0, count = 0;
  const worksheets = unzipSync(new Uint8Array(buffer), {
    filter(entry) {
      expanded += entry.originalSize;
      count++;
      if (count > 500 || expanded > maxUnpackedBytes) throw new Error('Save the BOQ worksheet in a smaller workbook.');
      return /^xl\/worksheets\/[^/]+\.xml$/i.test(entry.name);
    },
  });
  // Bound the worksheet grid before the reader allocates its rows and columns.
  for (const bytes of Object.values(worksheets)) {
    const cellReferences = /<(?:[\w-]+:)?(?:dimension|c)\b[^>]*\s(?:ref|r)\s*=\s*["']([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?["']/gi;
    for (const cell of strFromU8(bytes).matchAll(cellReferences)) {
      const column = (cell[3] ?? cell[1]).toUpperCase();
      const index = Array.from(column).reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0);
      if (index > 128 || Number(cell[4] ?? cell[2]) > 2_000) throw new Error('Use a worksheet with up to 2,000 rows and 128 columns.');
    }
  }
  const sheets = await readSheetNames(buffer);
  return {
    sheets,
    async rows(sheet: string) {
      const rows = await readSheet(buffer, { sheet, parseNumber: value => value });
      if (rows.length > 2_000 || (rows[0]?.length ?? 0) > 128) throw new Error('Use a worksheet with up to 2,000 rows and 128 columns.');
      return rows.map(row => row.map(cell => cell == null ? '' : String(cell)));
    },
  };
}
