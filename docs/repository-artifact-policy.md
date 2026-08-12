# Repository Artifact Policy

This policy defines the boundary between versioned product inputs and local or
reproducible output. It changes repository hygiene only; it does not change
Fractured Order or PLI runtime behavior.

## Commit These Artifacts

Commit artifacts that are required to build, test, review, deploy, or replay a
specific repository revision:

- application source, configuration templates, documentation, and automation
  scripts
- dependency lock files, including `package-lock.json`, so dependency
  resolution is reproducible
- narrow, reviewed test fixtures kept with the source tests; fixture data must
  be synthetic or otherwise approved and must not contain runtime secrets,
  participant data, browser storage, or captured live-session content
- additive, dated migration source under `data/` and `supabase/`; generated
  database dumps and local database state are not migration source
- intentionally published binary assets such as approved images, briefing
  material, and reference PDFs when the binary itself is a reviewed product
  input or deliverable and its provenance is documented
- the curated PLI PDFs under `pli/deliverables/`; these are intentionally
  published deliverables, remain trackable, and this policy does not alter PLI
  generation or adjudication behavior

Binary files are committed by exception, not merely because a tool generated
them. A new published binary should have a stable repository purpose, a named
owner or generating source, and review in the same change.

## Do Not Commit These Artifacts

The following are reproducible, machine-local, sensitive, or run-specific and
must remain outside version control:

- installed dependencies in `node_modules/`
- Vite build output in `dist/`
- Vitest coverage output in `coverage/` or `.nyc_output/`
- Playwright output in `test-results/`, `playwright-report/`, and
  `.playwright-mcp/`
- local release evidence under `output/release-evidence/` or
  `release-evidence/`; release evidence must be stored in the approved release
  system, not treated as source
- generated PLI reports under `pli/reports/out/`
- downloaded session recordings in `recordings/`, `session-recordings/`, or
  root-level `session-recording-*` audio files
- temporary LaTeX `report.*` build files such as `report.aux`,
  `report.fdb_latexmk`, `report.fls`, `report.log`, `report.synctex.gz`, and
  `report.toc`
- local environment files, secrets, browser storage, database dumps, or other
  participant/session data not expressly approved as a synthetic fixture

Do not add a global ignore rule for ordinary source or fixture formats such as
JSON, CSV, YAML, SQL, HTML, Markdown, images, archives, or PDFs. Ignore the
generated directory or filename convention instead, so reviewed fixtures,
migrations, and intentionally published binaries remain trackable.

## Adding Or Publishing An Artifact

Before committing a new artifact:

1. Confirm that it is an input or intentionally published deliverable rather
   than output that can be regenerated.
2. Confirm that it contains no secret, personal data, browser state, or live
   session evidence.
3. For a fixture, keep it narrowly scoped and document how it was synthesized.
4. For a binary, document why the binary must be versioned and retain its
   editable source or reproducible generator where available.
5. If a generated path is accidentally tracked, remove it from the Git index
   without deleting the developer's local copy, then verify the applicable
   `.gitignore` rule.

The curated contents of `pli/deliverables/` are the explicit exception to the
generated-output rules above. Updating those files follows the existing PLI
publishing workflow; this repository policy neither regenerates them nor
changes their behavior.
