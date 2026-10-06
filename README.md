# Fractured Order

Fractured Order is an economic statecraft seminar simulation delivered through Plenum for Statecraft Simulations Group exercises. Plenum is the delivery platform: it provides the browser role surfaces, live session state, facilitator controls, decision capture, inject/communication handling, timeline visibility, and export paths needed to run and review the exercise.

Statecraft Sim remains the package/internal product description in `package.json` and some operator-facing metadata. Public participant entry points should present the exercise as Fractured Order on Plenum.

## What It Supports

The current exercise topology ships with four actor teams and two operator surfaces:

| Surface | Purpose |
| --- | --- |
| Landing | Session-code join, team selection, role selection, and operator access |
| Game Master | Session creation/deletion, participant monitoring, and data export |
| White Cell | Game controls with per-mark time allocations for Strategic Orientation and Moves 1-3, pre-Move 1 Strategic Orientation gating for move/phase advancement, dedicated Strategic Orientation review, action/proposal/response review, RFI answers, communications, timeline review, facilitator deck assignment, and session-scoped plugin management |
| Team Scribe | One versioned Strategic Orientation artifact per team, using the team-specific workflow matrix below, plus Blue and Red strategic action drafting with handoff to the Facilitator, Green and Industry proposal creation with handoff to the Facilitator, read-only RFI history, received White Cell updates, timeline, and quick capture |
| Team Notetaker | Observations, team dynamics, alliance tracking, and move-scoped notes |
| Team Facilitator | Four focused workspaces for Team Action Review, the support Deck, Facilitator-owned RFIs, and isolated direct Communications with White Cell; distinct Strategic Orientation slides; final Strategic Orientation/action/proposal submission; recipient-isolated, append-only multi-round proposal threads with proposing-team follow-ups; and venue projection |

The Tribe Street Journal live page fills the available journal section on White Cell and Team Scribe surfaces. New session-persisted Tribe Street Journal updates produce accessible in-app popup notifications for the addressed Team Scribe and Team Facilitator; previously loaded history is not re-announced when a role surface starts.

Scribe action controls prioritize Strategic Orientation first: the Strategic Orientation button is the primary green control until that team records its artifact, then the control becomes secondary and the action/proposal/response control becomes primary.

| Team | Ordered Strategic Orientation workflow |
| --- | --- |
| Blue | Choose Blue's orientation; forecast Red's orientation; describe what Red is expected to do. |
| Red | Choose and explain Red's orientation; forecast Blue, Green (Asian Pacific), and Green (Europe). |
| Green | Forecast Blue; choose Green's orientation; describe Green's strategy given that forecast. |
| Industry | Complete the Move 1 Industry Strategic Plan: sector, business overview, three risks, Blue forecast, Red priorities, partner map and first ambassador target, three strategic priorities, numeric stance, and red line. Industry does not choose an own orientation. |

Every catalogue choice persists its stable ID, label, and tag. Required narratives are stored independently and values are never inferred. The Industry plan is a versioned nested sub-contract within the same version 2 Strategic Orientation envelope; its Blue forecast remains in the canonical forecast-target representation. Version 1 selection-only and forecast-only artifacts, existing version 2 records, and old-style Industry records remain readable. The expanded fields stay inside the existing additive Strategic Orientation envelope in the `actions` table, so no database migration is required.

Research export schema `2.0.0` / format revision `11` generates two publication views from one validated session dataset: `report.html` for immediate browser review and `report.tex` for a formal LuaLaTeX PDF workflow. The archive also includes `latexmkrc` and `LATEX_REPORT_README.md`; CSV, JSON, and JSONL projections remain the canonical machine-readable evidence. It preserves raw topology, Green roster/model provenance, regional delegation ownership, original persisted roles, semantic roles, shared-facilitator submission provenance, and removed-seat history without rewriting legacy rows. Strategic Orientation, action, proposal, workflow-review, thread, and RFI history remain available as research evidence. PLI scores, outcomes, notes, narratives, packets, adjudication projections, and derived outcome-taxonomy files are intentionally excluded because PLI is a separate tool. The manifest validates workflow and distinct-artifact ownership reconciliation, records the raw and compatible effective Green seat model, declares `pli_included: false`, and records whether `event_log` came from a captured audit log or was deterministically reconstructed from persisted session rows. The HTML report labels reconstructed chronologies explicitly, while the formal LaTeX report refuses to print reconstructed rows as captured audit history.

Compatibility note: the current route and storage keys remain `teams/<team>/facilitator.html` / `*_facilitator` for the Scribe workspace and `teams/<team>/scribe.html` / `*_scribe` for the Facilitator support deck. New display labels use the corrected role semantics while legacy identifiers remain stable for existing sessions and Supabase policies. When a schema migration introduces canonical role IDs, new persisted identifiers should use semantic role names rather than carrying the inversion forward.

The built-in teams are Blue, Red, Green, and Industry. Do not expand team geography or role topology during demo hardening unless the exercise design explicitly changes.

## Repository Layout

```text
.
|-- index.html                 Landing and join flow
|-- master.html                Game Master operator console
|-- whitecell.html             White Cell operator interface
|-- plenary.html               Plenary projector board for finalized PLI outputs
|-- sme.html                   SME review consoles
|-- pli/                       Petrihos Lever Index (multi-track adjudication + CI)
|-- teams/
|   |-- blue/
|   |-- green/
|   |-- red/
|   `-- industry/              Scribe, facilitator-support, and notetaker role pages
|-- decks/                     Static facilitator deck HTML
|-- src/
|   |-- core/                  Config, role routing, enums, errors
|   |-- services/              Supabase, realtime, sync, timer, heartbeat, mock backend
|   |-- stores/                Session, game state, actions, RFIs, timeline, participants, communications
|   |-- roles/                 Role-surface controllers
|   `-- features/              Actions, RFIs, export, timeline, role-aware Start Here onboarding, plugin registry, PLI SME panels, and deck helpers
|-- styles/                    Shared CSS tokens, layouts, components, and page styles
|-- data/                      Supabase schema and migration SQL
|-- docs/                      Deployment, Supabase setup, and live-demo runbook
`-- tests/                     Vitest unit tests and Playwright e2e rehearsal tests
```

Repository inputs, generated output, fixtures, migrations, and intentionally
published binaries follow the [repository artifact policy](docs/repository-artifact-policy.md).
In particular, the curated PDFs under `pli/deliverables/` remain versioned
deliverables.

The proposed Green Cell subdivision into Asia-Pacific and European Facilitator/Scribe
pairs is tracked in the [Green Cell regional split prompt book](docs/green-cell-regional-split-prompt-book.md),
including implementation prompts, session procedures, open decisions, and verification status.

## PLI (Petrihos Lever Index)

Multi-track adjudication for Fractured Order lives under `pli/` (vendored from [ssgwm25/petrihos-lever-index](https://github.com/ssgwm25/petrihos-lever-index)). After White Cell marks actions submitted, the GitHub Action **PLI Adjudication** writes `pli_adjudications` rows. Econ, NI, and Dip-Info SMEs approve or edit those seats in Plenum; White Cell Lead has a read-only view plus a **PLI SME efficacy** summary. After a matching seat is approved or overridden, Tribe Street Journal and Verba SMEs copy the finalized packet from the SME console (no live API into those tools). Action-complete narrative queues remain separate. Apply `data/2026-07-17_pli_adjudications.sql`, `data/2026-07-20_sme_handoffs.sql`, and `data/2026-08-25_sme_pli_packets.sql`, and see `pli/plenum/INTEGRATION.md`.

## Local Development

Use the root project directory. This is a root-level Vite multi-page app.

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Set these values in `.env.local` before starting Vite:

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<supabase-anon-key>
```

The Supabase anon key is browser-public runtime configuration. It is not a service-role secret. Service-role/backend secrets must never be committed, embedded in Vite env vars, or exposed to browser traffic.

## Build And Test

```powershell
npm run build
npm test -- --run
npm run test:e2e:smoke
npm run test:e2e:live-demo
npm run test:roles
npm run test:operational
```

Pass conditions:

- `npm run build` creates `dist/` from the root Vite MPA inputs.
- The built site references bundled `assets/*.js`, not raw `./src/*.js` module paths.
- Unit tests pass without stale layout or naming expectations.
- E2E smoke/live-demo tests can create sessions, join role seats, exercise core flows, and render role surfaces without console failures.
- `test:roles` fail-closes against the auditable [role capability matrix](docs/role-capability-test-matrix.md), joins every shipped role (including all five SME consoles), and runs the complete cross-role procedural playthrough.
- `test:operational` runs the [complete non-PLI operational rehearsal](docs/operational-rehearsal.md): the Windows-safe `test:non-pli` focused suite plus topology, scale, realtime recovery, the expanded 18-actor operation, and compact operator controls. PLI is explicitly excluded from this gate.

## Deployment

GitHub Pages deployment is handled by `.github/workflows/deploy-pages.yml`. The workflow:

- installs dependencies with `npm ci`
- validates required Supabase repository secrets
- builds the root Vite app into `dist`
- adds `.nojekyll`
- uploads the built `dist` artifact to GitHub Pages

Required repository secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Optional repository secret:

- `PAGES_ENABLEMENT_TOKEN`, only needed to bootstrap Pages if it has not been enabled manually.

Known live URL:

```text
https://ssgwm25.github.io/Fractured-Order/
```

Hosted source check:

```powershell
Invoke-WebRequest -Uri "https://ssgwm25.github.io/Fractured-Order/" -UseBasicParsing |
  Select-Object -ExpandProperty Content
```

Pass: page source contains `/Fractured-Order/assets/*.js` and does not contain `./src/main.js` or `./src/roles/landing.js`.

See [docs/deployment.md](docs/deployment.md) for the full deployment checklist.

## Supabase Setup

The app requires anonymous auth to be enabled because browser clients establish a Supabase anonymous identity before joining sessions or claiming seats. Live access is then bounded by session-code lookup, role-seat RPCs, operator grants, and row-level security.

Use [docs/supabase-setup.md](docs/supabase-setup.md) as the authoritative operator setup and verification guide. Legacy broad-policy SQL files are not the final live hardening state.


## Accessibility And Reliability Contracts

- Role surfaces include skip links, keyboard-reachable sidebar navigation, and persistent sync-degraded banners.
- Landing validation renders inline errors as well as toast notifications.
- Error notifications use plain-language summaries and recovery guidance; raw service errors stay in logs.
- Runtime service failures block startup with a user-facing alert dialog, managed focus, and a Try again action. Infrastructure details stay in operator logs and runbooks.
- Facilitator alert panels use dialog semantics and focus containment.
- Browser-facing source is tested for common mojibake markers.

## Credits

Developed by Sethu Nguna for the Statecraft Simulations Group, William & Mary (2026).
