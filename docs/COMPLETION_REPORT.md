# CoreConstruct implementation report

Prepared 30 October 2026 against the supplied CoreConstruct PRD v1.1 and the existing owner pilot.

The result is a functional, bounded design-build pilot with connected workflows across all seven product modules. It is ready for controlled acceptance testing. It is not a completed commercial SaaS launch, and the remaining items below are part of the handoff rather than silently treated as complete.

## Product vision coverage

| PRD module | Implemented and available for testing | Boundaries / remaining work |
| --- | --- | --- |
| 1. Firm identity and modules | Organization isolation, project roles, logo/colours, three themes, KRA/NCA receipt text, firm presets, project overrides, non-destructive switches and principal-controlled evidence policy | Configurable legal stamp/signatures; complete multi-document letterhead system; normalized PostgreSQL/RLS architecture at commercial scale |
| 2. Client, plot and lifecycle vault | Project/client details, timezone/reference currency, dated manual FX reference, plot pin/geofence/navigation, brief, county/LR, six document folders, assigned actions/RFIs/instructions/snags | Automated client onboarding messages, live FX feed, richer structured survey/land records |
| 3. Design document control | Disciplines/sheet codes, numbered drafts, explicit issue, automatic superseding, revision/status watermarks, site acknowledgements, client publication and revision-bound design acceptance | Qualified signatures/statutory approval integrations; previously exported copies cannot be recalled |
| 4. Labour and anti-ghost review | Worker registry, optional encrypted ID/phone with duplicate ID check, full/half days, task/BOQ allocation, rate snapshots, cross-site day limits, piece work, advances, wagebill locks/revisions, separated approvals, reasoned owner pilot overrides, payment ledger, anomaly signals | Government identity verification, biometrics, automated Daraja payouts and payroll/statutory integrations |
| 5. Materials and BOQ | CSV BOQ import, quantities/allowances/progress, stock suggestions, multi-line POs, evidence-backed deliveries, office receiving approval, stock issues/returns/wastage/adjustments/paired transfers, invoice three-way match, correction and reversal, BOQ commitment/labour signals | Invoice entry is per order line; aggregate supplier invoice/tax/credit-note/closeout workflows and automated valuation remain extensions |
| 6. Dual financial views and receipts | Gross approved costs vs confirmed payments, contract vs internal allowance, accepted variation deltas, open-book fee, remaining-cost forecast and indicative margin, sequential client receipts, branded PDF, live authenticated QR status, void/correction history, CSV/JSON record exports | Bank reconciliation, payment execution, eTIMS tax invoicing, full accounting/tax/retention, complete backup/restore and custom stamp workflows |
| 7. Client trust portal and variations | Assigned authenticated client view, explicit filtered response, reviewed media/reports/current drawings, receipts/certified milestones, expiring revocable links, exact-revision variation decisions, separately identified office-recorded signed decisions, assessed completion effects | External testers also need hosted Site audience grants; WhatsApp/email notifications are manual; completion is not a full scheduling engine |

Offline field capture is implemented for attendance, petty-cash expense evidence, delivery and site-media drafts. Stable command IDs, attachment retention, attendance conflict tokens, explicit sync and needs-review conflicts protect the supported flow. Financial approvals and client decisions remain online.

## What gives this product a distinct testable value

The value is the connection between controls: a drawing revision reaches the foreman; a PO becomes stock only after delivery approval; an invoice becomes a cost only after goods/rate matching; labour, advances and payments reconcile without inflating cost; the client's contract and published evidence remain separate from the firm's internal allowance; a revision-specific client decision changes scope/price/time together. The pilot can now test those connections with actual firm workflows.

## Verification

Automated verification covers financial/domain rules, authenticated API routes with SQLite persistence and private object-storage fixtures, access invitations/revocation, tenant/project isolation, private file reads, client response filtering, document generation, all project panel rendering and offline queue storage. The route-level cycle exercises order → upload → receiving → invoice → ledger, followed by drawing/client-file access and receipt void verification.

A detailed results file records the final command outcomes. Browser QA was attempted using the supported preview; the browser received `ERR_CONNECTION_REFUSED` although the preview daemon reported running. Consequently, actual browser clicks, phone layout, camera/GPS permissions, QR scanning and offline service-worker boot were not verified here. Static rendering and API tests do not substitute for those checks.

The review fixed observed issues including attendance replay conflicts, report-publication invalidation, file-category substitution checks, invoice corrections/reversals, uncertain-save attachment retries, and a project-authorization bypass involving unrelated record IDs. Regression coverage was added for the relevant rules. This is evidence of checks performed, not a zero-defect guarantee.

## Delivery and use

- Source and setup/acceptance documentation are in the requested GitHub repository.
- The hosted pilot is published through its existing private Site; its audience is preserved.
- An encryption secret is configured through runtime secret storage, separate from GitHub.
- CI is included for subsequent repository changes. Its remote execution status is reported separately from local verification.
- No real payment was executed and no invitation, WhatsApp message or email was sent on the firm's behalf. Test records live in isolated test fixtures, not the live database.

## Recommended first pilot

Use one project, a principal/PM, a foreman and one consenting client. Perform the acceptance checklist with fictional values, then reconcile a real week alongside existing records. Compare an existing-process baseline with four weekly cycles using the measurement template. Decide whether weekly wagebill/report time, missing proof, corrections and follow-up messages materially improve.

Before multi-person testing, grant the named testers hosted Site access and invite their application accounts to the correct projects. Before broader business dependence, complete handset/browser acceptance, recovery testing, independent security review and the required scale/integration work in the technical notes. No additional developer purchase or paid payment/messaging integration is required to begin the controlled owner test.
