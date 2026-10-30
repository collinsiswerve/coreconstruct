export function makeCsv(rows: unknown[][]): string {
  return '\uFEFF' + rows.map(row => row.map(value => {
    let s = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  }).join(',')).join('\r\n');
}
