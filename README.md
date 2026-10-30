# CoreConstruct

CoreConstruct joins design control, site operations and client reporting for a Kenyan design and construction firm. This repository contains the executable pilot, automated checks, database migrations and test guide.

[Open the hosted pilot](https://coreconstruct-pilot-cis.upbeatfern7.chatgpt.site) · [Completion report](docs/COMPLETION_REPORT.md) · [Test guide](docs/PILOT_CHECKLIST.md) · [Technical notes](docs/TECHNICAL_NOTES.md)

The hosted pilot remains owner-private. The application supports team invitations and assigned client accounts, but those people also need permission to enter the hosted Site. An invitation does not change hosting access.

## What you can test

- Firm branding, light/dark/sunlight themes, firm presets and non-destructive module switches with project overrides.
- Project briefs, plot coordinates, navigation, county/LR references, client contacts, reference currency and completion forecasts.
- A six-folder document vault, discipline/sheet revisions, current/superseded construction issues, stamped downloads, site acknowledgements and exact-revision client design acceptance.
- Daily attendance, full/half days, historical rates, BOQ work items, piece work, advances, wagebill submission, separate approval and confirmed payment records.
- BOQ CSV imports, measured progress and review signals for rates, labour budgets, purchase commitments and reported GPS evidence.
- Purchase orders, delivery photo/note review, stock issues/returns/wastage/adjustments/transfers, supplier invoice three-way matching and corrections.
- Internal costs and forecasts separated from fixed-price client figures; open-book clients receive approved cost totals plus the configured fee.
- Sequential client receipts, branded PDF downloads, authenticated QR status verification, publication controls and revocable client links.
- Versioned variations: scope, price and assessed programme impact change only when the exact sent revision is accepted.
- Offline field drafts with attachments, account/firm scoping, deliberate sync and retained conflicts. Approvals, payment records and client decisions require a connection.

M-Pesa payouts, bank reconciliation, WhatsApp/email delivery, eTIMS submission, government identity verification and a multi-firm commercial launch are not activated. Payment entries acknowledge references checked by your firm; they do not move money. See the completion report for the precise remaining gaps.

## Start testing

Use the [test guide](docs/PILOT_CHECKLIST.md) with one project and fictional inputs first. Load the sample project from the workspace if you want to explore the original labour/expense screens. The new procurement/document flows require your own test uploads and a BOQ; [sample BOQ](public/templates/boq-import.csv) is included.

Keep source code in GitHub and operational records in private storage. This repository intentionally excludes credentials, database contents, uploaded documents and exports. Its public visibility does not make your hosted workspace public.

## Run code checks

Requires Node.js 22.13 or newer and the pinned pnpm version in `package.json`.

```sh
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
pnpm test
pnpm run typecheck
pnpm run build
```

The test suite uses Node SQLite and a private object-storage test double. It does not need your production credentials. CI runs the same checks after pushes and pull requests.

`pnpm run dev` starts the local framework. The source uses the hosted platform's authenticated identity headers and D1/R2 bindings. A plain GitHub clone does not supply a production login gateway, database or file bucket. Use the hosted pilot for signed-in manual testing; read [technical notes](docs/TECHNICAL_NOTES.md) before deploying elsewhere. GitHub Pages cannot run this backend.

## Scope

This is a bounded pilot, with one JSON workspace per firm and application-enforced tenant/role checks. It is not the PostgreSQL/RLS commercial architecture proposed in the original PRD. Each workspace is capped at 950 KB of serialized records; uploads are separate and capped at 8 MB each. Original drawing PDFs may contain up to 80 pages.

Exports support reconciliation and manual recovery work. They are not a tested complete disaster-recovery/restore service. Attachments and the encryption key need separate recovery arrangements before larger live use.
