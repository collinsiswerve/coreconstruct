# Architecture and operating boundaries

## Implementation

- TypeScript/React application with Vinext, a Cloudflare Worker runtime, D1 metadata and private R2 file bytes.
- Each firm has an organization and membership records. Project roles are selected on the server. Invitations bind a hashed single-use token to an email and expire after seven days.
- The firm's business workspace is a versioned JSON record. Optimistic compare-and-swap commits the command, financial changes, stock changes, idempotency marker and business audit together. Conflicting devices receive 409 rather than overwrite each other.
- Authorization derives the project from the identifier actually used by each command. Extraneous record IDs cannot redirect the access check. The API checks modules, membership, project assignment, file category and file ownership as well as UI visibility.
- Money uses integer cents. Quantities use thousandths; attendance uses full/half-day units. Daily rates and approved wage schedules are snapshots. Supplier invoice approval creates one linked expense; direct changes to that expense are blocked.
- Client routes construct an explicit response schema. Fixed-price clients receive no internal expense/wage/order data. Open-book clients receive aggregate approved costs and the configured fee. Media and reporting notes require publication; changes to reporting notes remove publication.
- File reads pass through authenticated routes. Superseded drawing downloads are watermarked and blocked for foremen. This cannot recall printed or previously downloaded copies.
- Optional worker identity/phone values are encrypted with AES-GCM and firm-specific additional data. A keyed, firm-scoped HMAC supports duplicate ID detection. The runtime encryption key is a secret; it is not in source or returned to the browser. The firm still verifies the worker in person. A formatted ID is not government identity verification.
- Offline IndexedDB records are scoped to account and firm; attachment blobs stay with the draft. Reference data expires after 24 hours. The service worker caches the shell/assets, not private API/documents/client pages. A shared device still needs normal browser/session security. Offline device flows need actual handset acceptance.

## Deployment

The supported hosted environment supplies the trusted ChatGPT identity gateway, D1 `DB`, R2 `BUCKET` and secret `DATA_ENCRYPTION_KEY`. Keep `.openai/hosting.json` as deployment configuration, not a secret store. New migrations extend the original workspace without deleting its records.

The application trusts platform-injected identity headers. Do not expose the underlying Worker directly to arbitrary requests that can set those headers. A deployment outside this gateway needs a real authentication/session integration before use; copying the application to GitHub Pages or an unprotected Worker is insufficient.

To provision an independent deployment, configure trusted authentication, private D1/R2 bindings, the encryption secret, all SQL migrations in order, and the same runtime build. A plain clone can run automated checks without any production secrets. The supplied GitHub workflow is CI, not an automatic live deployment.

## Pilot limits and remaining engineering

- 950 KB serialized business record per firm, 200 KB JSON request body, 500 rows per BOQ import, 50 lines per PO, 8 MB upload and 80 PDF pages. Large firms require normalized tables, indexes, archival and background jobs before scale.
- Application-enforced D1 tenant scoping replaces the PRD's proposed PostgreSQL RLS architecture for this bounded pilot. There is no independent penetration-test certification or scale benchmark.
- Business audit snapshots are part of the versioned workspace. Access-management changes have current DB state but no complete append-only security-event UI. History is not a tamper-proof external audit system.
- Exports are JSON/CSV records; private attachments are separate. The owner UI export omits protected identity ciphertext. Complete restore, encryption-key recovery, file backup, retention and disaster-recovery drills remain work. Do not delete or rotate the key without a re-encryption/recovery plan.
- File validation uses size/type checks and parses PDFs; it does not perform antivirus scanning, EXIF attestation or counterfeit-document detection. Geofencing uses client-reported coordinates, accuracy and time. Location matches support human review and do not prove authenticity or quantities.
- Supplier invoices currently map one entered invoice to one PO line. Aggregate multi-line invoice documents, tax rules, VAT/retention, supplier statements, purchase-order closeout and credit-note workflows need extension.
- Completion forecasts use a PM base date plus accepted, explicitly completion-affecting variation days. This is not critical-path scheduling; overlapping delays need the PM's assessment.
- Receipt PDFs use standard fonts, with unsupported Unicode characters replaced. Long or unusual firm/client names need PDF layout acceptance. The QR checks the current authorised receipt record, not the bank or M-Pesa transaction.
- Firm logo/colours and KRA/NCA text are supported. A configurable legal digital stamp, qualified electronic signatures and complete branded multi-document letterhead templates are remaining work.
- Manual reference recording is not payment execution or automated bank reconciliation. No Daraja payout, WhatsApp/email send, live FX feed, KRA eTIMS submission or government identity integration is active.
- No guarantee of a bug-free or fraud-proof system is made. Automated checks are evidence for the named cases, and need complementing with device testing, independent review and a controlled pilot.
