# Verification record

## M5 release drill — 14 November 2026

| Check | Result |
| --- | --- |
| Weekly close | KSh 4,300 approved costs, KSh 2,500 confirmed cash out and KSh 1,800 payable. The open order commitment was KSh 4,200. Wagebill approved and weekly client update published. |
| Financial correction | Reversing the KSh 1,000 supplier payment reopened the balance to KSh 2,800 and released its linked funding. The corrected payment restored the KSh 1,800 balance. The reversal remained in history. |
| Role and firm access | Separate test identities drove the normal routes. The client saw the published update and receipt application. Another firm and a revoked test member were denied project and attachment access. |
| Offline retry | An interrupted delivery-note upload and an interrupted delivery save recovered as one delivery and two attachments. A stale attendance edit stayed in the review queue. |
| Recovery | A clean database and file store recovered the project, balances, payment history, report and exact photo/PDF bytes. A missing or altered attachment failed verification. The operator command also restored one project and one file to local D1 and R2 on disk. |
| Build checks | 72 automated tests passed. Type checking, Worker build and Pages build passed. |

Use the [weekly close demo](https://collinsiswerve.github.io/coreconstruct/?view=pilot&v=10) to try the workflow. Signed-in Archi-Hub role checks and testing on the pilot phones remain part of the controlled pilot.

## Initial verification — 30 October 2026

| Check | Result | Practical scope |
| --- | --- | --- |
| `pnpm test` | 63 passed, 0 failed, 0 skipped | Domain, permissions, API + SQLite/R2 fixtures, document generation, server rendering, offline IndexedDB |
| `pnpm run typecheck` | Passed | TypeScript static checks |
| Production build | Passed | Worker, client, server-rendered routes and asset compilation |
| `git diff --check` | Passed | Whitespace/conflict-marker hygiene |
| New SQL migration | Applied to local D1 successfully | Schema-only addition of organizations, memberships, invitations, links and file metadata |
| Credential-pattern scan | No matches in source candidates | Token/private-key patterns; not a third-party security audit |
| Browser preview | Unverified: `ERR_CONNECTION_REFUSED` | Preview daemon reported running; cloud browser could not reach it |
| Phone/GPS/camera/QR/offline boot | Pending acceptance | Requires real devices and user accounts |
| Hosted signed-in business flow | Pending owner acceptance | Isolated route tests passed; live records were not modified to simulate business transactions |
| GitHub Actions | Workflow supplied; remote result not claimed | Local results above do not imply a completed remote run |

The final publication rebuilds the exact source before commit and packaging. The native deployment result is reported in the handoff. A successful build/deployment is not a claim of completed manual acceptance or a zero-defect guarantee.
