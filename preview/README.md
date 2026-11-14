# CoreConstruct GitHub Pages demo

This build uses the CoreConstruct workspace and business rules with fictional Archi-Hub records. The demo API runs inside the browser, including document attachments and client decisions. Reset demo clears the browser's demo records and files.

## Build

Requires the Node and pnpm versions in the parent repository. From the repository root:

```sh
pnpm install --frozen-lockfile
node preview/create-sample-drawings.mjs
pnpm exec vite build --config vite.preview.config.ts
```

Publish the contents of `dist/pages-demo` to the root of the `gh-pages` branch, including `.nojekyll`. The build uses relative asset paths for the GitHub Pages project URL.

The separate hosted pilot handles sign-in, shared records, team access and server-side verification.
