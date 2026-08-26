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
- owner-approved onboarding audio and video under `public/onboarding/` when the
  encoded media is an authored product asset accompanied by its exact script,
  transcript/captions, timings, checksums, generation settings, model/voice
  provenance, license, and approval record
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
- neural-media model weights and local onboarding-media generation output,
  including raw WAVs, review renders, loudness measurements, caches, and
  approval evidence under `scripts/start-here-audio/work/` or
  `scripts/start-here-audio/models/`; signed approval evidence belongs in the
  approved release system, not Git
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
   editable source or reproducible generator where available. Onboarding media
   additionally requires visible text, captions where applicable, output and
   script checksums, exact engine/model/voice/license provenance, and owner
   approval before it enters `public/onboarding/`.
5. If a generated path is accidentally tracked, remove it from the Git index
   without deleting the developer's local copy, then verify the applicable
   `.gitignore` rule.

The curated contents of `pli/deliverables/` are the explicit exception to the
generated-output rules above. Updating those files follows the existing PLI
publishing workflow; this repository policy neither regenerates them nor
changes their behavior.

Approved onboarding media is a separate authored-product exception, not a broad
generated-output exception. Only final encoded deliverables and their small
text sidecars are versioned. Model weights, raw generation output, rejected
samples, editing caches, and listen-through evidence remain untracked.
Approval is asset-version specific; a replacement batch needs its own exact
scripts, captions, checksums, clip count, provenance, and owner listen-through
before the manifest can treat it as approved.

## Automated Enforcement

Pull requests and pushes to `main` run `npm run verify:repo-artifacts` before
installing dependencies, followed by the focused artifact contract tests. The
cross-platform verifier inspects Git's tracked paths, normalizes Windows and
POSIX separators, and fails closed when it finds dependency folders, runtime
secrets, test or build output, browser storage, recordings, local evidence, or
unapproved report binaries.

The verifier's allowlist is deliberately narrow. Environment templates and
the reviewed sample, briefing, codebook-evidence, and `pli/deliverables/`
binaries are allowed only for the deny rule they intersect; an allowed binary
location does not exempt a nested dependency, secret, or test-output path.

When the gate reports a filename, follow its remediation message: remove the
generated or sensitive path from the Git index, add or correct the narrow
`.gitignore` rule, and rotate any credential that may have been exposed. A new
published report binary requires a reviewed allowlist entry and documentation
of its stable repository purpose in the same change.
