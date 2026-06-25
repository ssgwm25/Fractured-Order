# Deployment

This project deploys as a root-level Vite multi-page app through GitHub Pages.

## GitHub Pages Workflow

The deployment workflow is `.github/workflows/deploy-pages.yml`.

Required repository secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Optional repository secret:

- `PAGES_ENABLEMENT_TOKEN`, used only when the workflow must bootstrap GitHub Pages publishing.

The Supabase anon key is browser-public runtime configuration. GitHub stores it as a repository secret so the workflow can inject it at build time, but after the Vite build it is visible to browser clients. Do not use a service-role key or any backend-only credential in a `VITE_*` variable.

## Build Contract

The workflow must publish the built `dist` artifact. It must not publish raw source HTML that points directly at `./src/main.js` or role modules.

Local production build:

```powershell
$env:VITE_SUPABASE_URL="https://<project-ref>.supabase.co"
$env:VITE_SUPABASE_ANON_KEY="<anon-key>"
$env:VITE_PUBLIC_BASE_PATH="/Fractured-Order/"
npm run build
```

Pass:

- `dist/index.html` exists.
- built HTML references `/Fractured-Order/assets/*.js`
- built HTML does not reference `./src/main.js`
- built HTML does not reference `./src/roles/landing.js`
- production source maps are not emitted by default

## Hosted Source Verification

Known live URL:

```text
https://ssgwm25.github.io/Fractured-Order/
```

Check hosted source:

```powershell
Invoke-WebRequest -Uri "https://ssgwm25.github.io/Fractured-Order/" -UseBasicParsing |
  Select-Object -ExpandProperty Content
```

Pass:

- page source contains `/Fractured-Order/assets/`
- page source does not contain `./src/main.js`
- page source does not contain `./src/roles/landing.js`

## Workflow Verification

```powershell
gh run list --workflow deploy-pages.yml --branch main --limit 5
gh run view <run-id> --log
```

Pass:

- latest run succeeds
- Supabase secret validation passes
- `npm ci` runs
- `npm run build` runs
- `.nojekyll` is added to `dist`
- Pages artifact upload and deploy complete

## Failure Handling

- Missing `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY`: add repository secrets and rerun the workflow.
- Placeholder Supabase values: replace placeholders with the real project URL and anon key.
- Raw-source hosted HTML: verify the workflow uploaded `dist`, not the repository root.
- Pages not enabled: enable Pages manually for GitHub Actions or provide `PAGES_ENABLEMENT_TOKEN`.
