'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Download, Upload } from 'lucide-react';
import { addDays, dateKey, kes, type Project } from '../lib/domain';
import { boqColumns, boqLineValue, guessBoqMapping, previewBoqRows, type BoqMapping } from '../lib/boq-import';
import { openingBalanceFigures, parseOpeningBalances, type OpeningBalances } from '../lib/opening-balances';
import { readBoqWorkbook } from './boq-workbook';
import { Field } from './ui';
import { useWorkspaceRuntime } from './workspace-runtime';

type Save = (type: string, payload: Record<string, unknown>, message?: string) => Promise<boolean>;
type Workbook = Awaited<ReturnType<typeof readBoqWorkbook>>;

function columnLetter(index: number) {
  let column = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
    column = String.fromCharCode(65 + (value - 1) % 26) + column;
  }
  return column;
}

export function BoqExcelImport({ projectId, codes, saving, command }: {
  projectId: string; codes: string[]; saving: boolean; command: Save;
}) {
  const { href } = useWorkspaceRuntime();
  const [open, setOpen] = useState(false);
  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [name, setName] = useState('');
  const [sheet, setSheet] = useState('');
  const [grid, setGrid] = useState<string[][]>([]);
  const [header, setHeader] = useState(1);
  const [last, setLast] = useState(0);
  const [mapping, setMapping] = useState<BoqMapping>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const preview = grid.length ? previewBoqRows(grid, header - 1, last, mapping, codes) : null;

  async function selectSheet(wb: Workbook, chosen: string) {
    setSheet(chosen);
    setGrid([]);
    const rows = await wb.rows(chosen);
    const candidate = rows.findIndex(row => {
      const mapped = guessBoqMapping(row);
      return boqColumns.filter(col => col.required && mapped[col.key] !== undefined).length >= 3;
    });
    const start = candidate === -1 ? rows.findIndex(row => row.some(cell => cell.trim())) : candidate;
    if (start === -1) throw new Error('This worksheet is empty. Choose a sheet with BOQ items.');
    setGrid(rows);
    setHeader(start + 1);
    setLast(rows.length);
    setMapping(guessBoqMapping(rows[start]));
  }

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError('');
    setResult('');
    try { await task(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not read the workbook.'); }
    finally { setBusy(false); }
  }

  return <section className="panel boq-setup-panel">
    <div className="panel-heading">
      <div><h2>Excel BOQ import</h2><p>Map columns and review quantities and costs before adding items.</p></div>
      <div className="row-actions">
        <a className="btn" href={href('/templates/boq-import.xlsx')} download><Download size={15} />Download Excel template</a>
        <button className={'btn ' + (open ? '' : 'primary')} type="button" disabled={busy || saving}
          aria-expanded={open} onClick={() => setOpen(!open)}><Upload size={15} />{open ? 'Close importer' : 'Import Excel BOQ'}</button>
      </div>
    </div>
    {result && <p className="boq-setup-status" role="status">{result}</p>}
    {open && <div className="boq-setup-body">
      <div className="boq-setup-fields">
        <Field label="Excel workbook" hint=".xlsx, up to 2 MB. Only confirmed BOQ rows are saved.">
          <input type="file" accept=".xlsx" disabled={busy || saving} onChange={event => {
            const file = event.target.files?.[0];
            setWorkbook(null);
            setGrid([]);
            setName(file?.name ?? '');
            if (!file) return;
            void run(async () => {
              const wb = await readBoqWorkbook(file);
              if (!wb.sheets.length) throw new Error('This workbook has no worksheets.');
              setWorkbook(wb);
              await selectSheet(wb, wb.sheets.includes('BOQ') ? 'BOQ' : wb.sheets[0]);
            });
          }} />
        </Field>
        {workbook && <Field label="Worksheet"><select value={sheet} disabled={busy || saving}
          onChange={event => { const chosen = event.target.value; void run(() => selectSheet(workbook, chosen)); }}>
          {workbook.sheets.map(title => <option key={title}>{title}</option>)}
        </select></Field>}
        {grid.length > 0 && <>
          <Field label="Heading row"><input type="number" min="1" max={grid.length} value={header || ''} disabled={saving}
            onChange={event => { const row = Number(event.target.value); setHeader(row); setMapping(guessBoqMapping(grid[row - 1] ?? [])); }} /></Field>
          <Field label="Last item row" hint="Stop above worksheet totals or notes."><input type="number" min={header + 1} max={grid.length}
            value={last || ''} disabled={saving} onChange={event => setLast(Number(event.target.value))} /></Field>
        </>}
      </div>
      {busy && <p className="muted" role="status">Reading worksheet…</p>}
      {error && <div className="notice error" role="alert">{error}</div>}
      {preview && <>
        <fieldset className="boq-column-map" disabled={saving}>
          <legend>Match columns</legend>
          <div className="boq-setup-fields">{boqColumns.map(column => <Field key={column.key} label={column.label + (column.required ? ' *' : '')}>
            <select value={mapping[column.key] ?? ''} onChange={event => {
              const selected = event.target.value;
              setMapping({ ...mapping, [column.key]: selected === '' ? undefined : Number(selected) });
            }}>
              <option value="">{column.required ? 'Choose column' : 'Omit column'}</option>
              {(grid[header - 1] ?? []).map((heading, index) => <option value={index} key={index}>
                {columnLetter(index) + (heading ? ' · ' + heading : '')}
              </option>)}
            </select>
          </Field>)}</div>
        </fieldset>
        {preview.issues.length > 0 && <div className="notice error boq-setup-issues" role="alert">
          <strong>Resolve these items before importing</strong>
          <ul>{preview.issues.slice(0, 8).map(issue => <li key={issue}>{issue}</li>)}</ul>
          {preview.issues.length > 8 && <span>{preview.issues.length - 8} more issues in this worksheet</span>}
        </div>}
        {preview.lines.length > 0 && <>
          <h3>{preview.issues.length ? 'Valid rows' : 'Import preview'} · {preview.lines.length} {preview.lines.length === 1 ? 'item' : 'items'}</h3>
          {preview.totals && <BalanceFigures rows={[
            ['Client BOQ value', preview.totals.clientTotal],
            ['Internal allowances', preview.totals.allowanceTotal],
            ['Labour allowances', preview.totals.labourTotal],
          ]} />}
          <div className="table-scroll boq-setup-preview"><table>
            <thead><tr><th>Cost code</th><th>Description</th><th>Stage</th><th>Quantity / unit</th><th>Client value</th><th>Internal allowance</th></tr></thead>
            <tbody>{preview.lines.map(line => <tr key={line.code}><td>{line.code}</td><td>{line.description}</td><td>{line.stage}</td>
              <td>{line.quantityMilli / 1000} {line.unit}</td><td>{kes(boqLineValue(line))}</td><td>{kes(line.allowanceCents)}</td></tr>)}</tbody>
          </table></div>
        </>}
        <div className="row-actions"><button className="btn primary" type="button" disabled={saving || !!preview.issues.length || !preview.lines.length}
          onClick={async () => {
            const message = 'Imported ' + preview.rows.length + ' BOQ ' + (preview.rows.length === 1 ? 'item.' : 'items.');
            if (await command('boq.import', { projectId, source: name + ' · ' + sheet, rows: preview.rows }, message)) {
              setResult(message);
              setOpen(false);
              setWorkbook(null);
              setGrid([]);
            }
          }}>Confirm BOQ import</button></div>
      </>}
    </div>}
  </section>;
}

function BalanceFigures({ rows }: { rows: [string, number][] }) {
  return <dl className="boq-setup-totals">{rows.map(([label, amount]) =>
    <div key={label}><dt>{label}</dt><dd>{kes(amount)}</dd></div>)}</dl>;
}

const openingFields = [
  ['budget', 'Opening internal budget', 'budgetCents'],
  ['clientBilled', 'Client billed through cutoff', 'clientBilledCents'],
  ['clientReceived', 'Client payments received through cutoff', 'clientReceivedCents'],
  ['costsIncurred', 'Costs incurred through cutoff', 'costsIncurredCents'],
  ['costsPaid', 'Costs paid through cutoff', 'costsPaidCents'],
] as const;

export function OpeningBalancePanel({ project, canEdit, saving, command }: {
  project: Project; canEdit: boolean; saving: boolean; command: Save;
}) {
  const { opening } = project;
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<{ values: Record<string, unknown>; opening: OpeningBalances } | null>(null);
  const [error, setError] = useState('');
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const shown = pending?.opening ?? opening;
  const figures = shown && openingBalanceFigures(shown);
  if (!canEdit && !opening) return null;

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      setPending({ values, opening: parseOpeningBalances(values, new Date().toISOString(), '', (opening?.revision ?? 0) + 1) });
      requestAnimationFrame(() => reviewHeading.current?.focus());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check the opening amounts.');
    }
  }

  return <section className="panel boq-setup-panel">
    <div className="panel-heading">
      <div><h2>Opening balances</h2><p>Bring in the approved budget and totals through your cutoff date.</p></div>
      {canEdit && !editing && <button className="btn" type="button" onClick={() => setEditing(true)}>
        {opening ? 'Correct opening balances' : 'Record opening balances'}
      </button>}
    </div>
    <div className="boq-setup-body">
      {shown && figures && (!editing || pending) && <>
        <h3 ref={reviewHeading} tabIndex={-1}>{pending ? 'Review opening balances' : 'Balances through ' + shown.asOf}</h3>
        <p className="muted boq-setup-source">{shown.reference}{pending ? ' · cutoff ' + shown.asOf : ' · revision ' + shown.revision}</p>
        <BalanceFigures rows={[
          ['Opening internal budget', shown.budgetCents],
          [figures.clientBalance < 0 ? 'Opening client credit' : 'Opening client balance due', Math.abs(figures.clientBalance)],
          ['Opening unpaid costs', figures.unpaidCosts],
          ['Opening tracked cash', figures.cash],
        ]} />
        <details className="boq-setup-details" open={pending ? true : undefined}>
          <summary>Source totals</summary>
          <BalanceFigures rows={openingFields.slice(1).map(([, label, key]) => [label, shown[key]])} />
        </details>
      </>}
      {!shown && !editing && <p className="muted">Use the signed-off BOQ budget, client billing register and payment and cost records for the same date.</p>}
      {editing && <>
        <form className="boq-opening-form" hidden={!!pending} onSubmit={review}>
          <div className="boq-setup-fields">
            <Field label="Opening cutoff date"><input name="asOf" type="date" max={dateKey()} required readOnly={!!opening}
              defaultValue={opening?.asOf ?? addDays(dateKey(), -1)} /></Field>
            <Field label="Source or budget version"><input name="reference" required maxLength={120} defaultValue={opening?.reference ?? ''}
              placeholder="e.g. Signed BOQ v1 and ledger extract" /></Field>
            {openingFields.map(([name, label, key]) => <Field key={name} label={label + ' (KES)'}>
              <input name={name} type="number" step="0.01" min={name === 'budget' ? '0.01' : '0'} required
                defaultValue={opening ? (opening[key] / 100).toFixed(2) : name === 'budget' ? project.budgetCents / 100 : '0'} />
            </Field>)}
          </div>
          {opening && <Field label="Correction reason"><textarea name="reason" required maxLength={240} /></Field>}
          {error && <div className="notice error" role="alert">{error}</div>}
          <div className="row-actions">
            <button type="button" className="btn" onClick={() => { setEditing(false); setError(''); }}>Cancel</button>
            <button type="submit" className="btn primary">Review balances</button>
          </div>
        </form>
        {pending && <div className="row-actions">
          <button className="btn" type="button" disabled={saving} onClick={() => setPending(null)}>Back to entries</button>
          <button className="btn primary" type="button" disabled={saving} onClick={async () => {
            if (await command('opening.record', { projectId: project.id, ...pending.values, revision: pending.opening.revision - 1 },
              'Opening balances saved.')) {
              setPending(null);
              setEditing(false);
            }
          }}>Save opening balances</button>
        </div>}
      </>}
    </div>
  </section>;
}
