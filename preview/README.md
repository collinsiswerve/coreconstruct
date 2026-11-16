# CoreConstruct GitHub Pages demo

This build uses the CoreConstruct workspace and business rules with fictional Archi-Hub records. The demo API runs inside the browser, including document attachments and client decisions. Reset demo clears the browser's demo records and files.

Use **Pilot results → Open sample weekly close** for the end-to-end sample. The app's signed-in role, offline retry and records-and-files recovery checks use the hosted application routes and fresh test storage.

Use [Project portfolio](https://collinsiswerve.github.io/coreconstruct/?demo=portfolio&view=portfolio) for M6. The ten fictional projects started between 2022 and 2026. Each has a project workspace, a client page, four weekly reports, certificates and receipts, a priced BOQ, and a sample drawing issue history. The documentation and geometry illustrate the workflow. A concept render helps identify each project.

The portfolio stores demo changes separately in the browser, including changes made from a sample client page. Reset the portfolio from an open project to restore the fictional records. The production build also packages the same browser demo at `/portfolio/` in the private app.

Open the [M8 subscription billing rehearsal](https://collinsiswerve.github.io/coreconstruct/?demo=billing&view=billing) as the principal of fictional Ridgeway Works. Start a KSh 10,000 monthly subscription, record a failed test payment and then a successful one, simulate the next month, and test cancellation at the end of a paid period. This price follows the blueprint’s break-even example. The demo stores its invoices and payment attempts in this browser. The signed-in pilot exposes the same rehearsal under **Manage → Subscription billing** with firm-scoped records.

## Build

Requires the Node and pnpm versions in the parent repository. From the repository root:

```sh
pnpm install --frozen-lockfile
node preview/create-sample-drawings.mjs
pnpm exec vite build --config vite.preview.config.ts
```

Publish the contents of `dist/pages-demo` to the root of the `gh-pages` branch, including `.nojekyll`. The build uses relative asset paths for the GitHub Pages project URL.

The separate hosted pilot handles sign-in, shared records, team access and server-side verification.
