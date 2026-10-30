# CoreConstruct controlled acceptance test

Use one test project first. Keep the firm's existing records alongside the pilot. Do not enter real national identity numbers during initial acceptance testing.

## Access and setup

1. Open the hosted pilot with the owner's existing account. Refresh if an older version is cached.
2. Create a project with a KES 100,000 internal allowance and KES 150,000 fixed contract. Enter the test client name, location and start/completion dates.
3. In Settings, try the three themes, brand colour, logo and firm details. Apply a firm preset, confirm disabled screens disappear, then restore Full design-build. Existing data must remain.
4. In Site & brief, enter the plot pin, geofence, LR/county, brief and client settings. A GPS exception must remain visible for office review.
5. Import `public/templates/boq-import.csv`: copy its contents into BOQ & allowances → Import BOQ. A repeated code must be rejected rather than overwrite the baseline.

## Labour, costs and payments

1. Add two fictional workers at KES 1,000/day. Record one full day and one half day: expected gross is KES 1,500.
2. Record a confirmed KES 300 advance. Prepare the wagebill: expected net KES 1,200. Approval records KES 1,500 labour cost, not KES 1,800.
3. Try changing attendance after submission: it must be blocked. Return an unpaid bill with a reason, correct it, then resubmit as a new revision.
4. For a current-week bill, explicitly confirm attendance is complete. Record any accepted piece work before submission and reconcile its addition to daily wages.
5. Add a petty-cash expense with an uploaded receipt. Confirm it is submitted, then separately approve it and record a partial payment.
6. Record payments only after checking your real payment channel. An approval must never mark a record paid. Overpayments and reused confirmed references must be rejected.
7. A single-owner test uses a reasoned principal override for self-approval. A real PM cannot approve their own submission. Do not use overrides as the routine live operating model.

## Materials and three-way match

1. Add a material, e.g. cement measured in bags. Create an order for 10 bags × KES 700 against the appropriate BOQ cost code. Approve it using another assigned approver, or a documented owner pilot override.
2. Submit an invoice before approving any delivery. Match & approve must fail: goods received are still zero.
3. Log a delivery of six bags using a test offload photo, signed note and device location. If GPS cannot match the site, record a reason; do not represent it as a verified match.
4. Confirm stock stays zero while the delivery is submitted. Approve it: stock becomes six bags. Repeating approval must not add another six.
5. Approve an invoice for four bags × KES 700: cost becomes KES 2,800; the remaining order commitment is KES 4,200. A second invoice for three bags must fail until more goods are approved. A mismatched rate must also fail.
6. Issue three bags, return one against that issue, and record one bag of wastage. Expected stock is three bags. Excess returns and negative stock must fail.
7. Test an office stock adjustment with a reason. If testing transfers, use a second test project and confirm equal outbound/inbound quantities.
8. Return an unapproved invoice, correct it and resubmit. An approved unpaid invoice can be reversed with a reason; its old cost remains in history and stops counting. A paid invoice first requires reversal/reconciliation of its payment record.
9. Supplier invoices are entered per order line in this pilot. Use distinct references for separately entered supplier lines; aggregate multi-line invoice entry and supplier tax validation are remaining work.

## Design, evidence and client decisions

1. Upload a PDF with sheet code A01. It must start as draft. Issue it, publish it and acknowledge the current revision.
2. Upload a second A01 PDF and issue it. Exactly one revision must be current. The first becomes superseded. Office downloads show a superseded watermark; a foreman cannot retrieve it for construction.
3. Capture site media with a caption. It must remain private until published. Short MP4 clips are supported within the 8 MB upload limit.
4. Create a variation for KES 5,000 with an assessed seven-day effect. Mark whether it actually affects completion and record the programme reasoning. Send it.
5. Revise and resend. A decision on the old revision must fail. Only acceptance of the current sent revision changes contract figures. Activity days that do not affect completion must not move the completion date.
6. In a client account, accept the published design revision separately from the variation. This is a client design decision, not professional/statutory certification.
7. Before separate-account testing, grant those named people hosted Site access. Then use Team access to create an email-bound invite and share it yourself. Invite a foreman, PM and client only to their test projects. Do not test by sharing the owner's login.
8. Confirm the foreman cannot approve invoices/payments or switch off firm checks. Confirm an architect cannot access invoice files. Inspect a fixed-price client's JSON response as well as the page: supplier costs, worker records and internal allowances must be absent.
9. Create a client link, open it with the assigned client account, revoke it, then reload the same link: it must fail. Disabling a membership removes project access on subsequent requests. Revoking a link does not itself revoke the person's membership or their direct client route.

## Receipts and publication

1. Issue a KES 50,000 client receipt with a checked transaction reference. Download its PDF and scan its QR using an authorised account.
2. Void it with a reason. The same QR must show void; the sequence number must remain used.
3. Save a weekly reporting note: it must not appear in the client view until published. Editing it must remove publication until it is reviewed again.
4. Fixed-price clients see contract, accepted variations and client receipts. Open-book clients see approved costs plus the configured fee. Neither route should send wage schedules or supplier documents to the client.
5. Confirm a milestone appears only after the firm records certification. This records the certificate status; it does not issue the appointed professional's certificate.

## Offline and device checks

1. Open the workspace online once on the test phone. Then disconnect while staying in that signed-in browser session.
2. Capture attendance, a petty-cash expense with its receipt, or delivery/site-media drafts. Confirm the offline inbox says these are local drafts, not saved/approved server records.
3. Reconnect and select Sync drafts. Stable command IDs should prevent duplicate costs or stock entries when requests are retried.
4. Change the same attendance on a second device before syncing the first draft. The draft must stay in needs-review status, without overwriting the newer row. Inspect queued values, save attachments if needed, create a reviewed correction, then remove the reviewed local draft.
5. Financial approvals and client decisions must be unavailable offline. Private API/document responses must not be cached by the service worker.
6. Check narrow and wide screens, keyboard navigation, camera/file picker, location denial, refresh, logout/account change, PDF download and QR scan on the actual devices your team uses. Browser/device acceptance was not completed in the build environment; these are release checks, not claimed results.

## Measure whether it helps

Use `public/templates/pilot-measurements.csv` for an existing-process baseline and four comparable weekly cycles. Record preparation minutes, missing entries, corrections, missing evidence and client follow-ups. Record avoided costs only with supporting evidence; usage counts do not prove savings.

A sensible pilot exit is: reconciled wage/cost/client balances, no unauthorised project access, current drawings used on site, successful phone/offline acceptance, and a repeatable reduction in weekly administration. Agree the required improvement with your team before judging the outcome.
