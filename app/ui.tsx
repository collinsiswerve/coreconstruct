import type { ReactNode } from 'react';
import { ClipboardList, CheckCircle2, Clock3 } from 'lucide-react';
import { kes } from '../lib/domain';
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) { return <span className={'badge ' + tone}>{children}</span>; }
export function Status({ status, paid = 0, amount = 0 }: { status: string; paid?: number; amount?: number }) { const label = status === 'approved' ? paid >= amount ? 'Settled' : paid ? 'Part paid' : 'Approved' : status === 'returned' ? 'Returned' : 'Awaiting review'; return <Badge tone={status === 'approved' ? 'green' : status === 'returned' ? 'red' : 'amber'}>{status === 'approved' ? <CheckCircle2 size={11} /> : <Clock3 size={11} />}{label}</Badge>; }
export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) { return <div className="empty"><span className="empty-icon"><ClipboardList size={25} /></span><h3>{title}</h3><p>{text}</p>{action}</div>; }
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function WageTable({ entries, showDeductions = true }: {
  entries: { workerId: string; name: string; units: number; grossCents: number; advanceCents: number; payableCents: number }[];
  showDeductions?: boolean;
}) {
  return <div className="table-scroll"><table>
    <thead><tr><th scope="col">Worker</th><th scope="col">Days</th><th scope="col">Gross</th>
      {showDeductions && <><th scope="col">Advances</th><th scope="col">Net</th></>}</tr></thead>
    <tbody>{entries.map(entry => <tr key={entry.workerId}><td>{entry.name}</td><td>{entry.units / 2}</td>
      <td>{kes(entry.grossCents)}</td>{showDeductions && <><td>{kes(entry.advanceCents)}</td>
      <td className="strong">{kes(entry.payableCents)}</td></>}</tr>)}</tbody>
  </table></div>;
}
