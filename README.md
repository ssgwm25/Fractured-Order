# Fractured Order

Fractured Order is an economic statecraft seminar simulation delivered through Plenum for Statecraft Simulations Group exercises. Plenum is the delivery platform: it provides the browser role surfaces, live session state, facilitator controls, decision capture, inject/communication handling, timeline visibility, and export paths needed to run and review the exercise.

Statecraft Sim remains the package/internal product description in `package.json` and some operator-facing metadata. Public participant entry points should present the exercise as Fractured Order on Plenum.

## What It Supports

The current exercise topology ships with four actor teams and two operator surfaces:

| Surface | Purpose |
| --- | --- |
| Landing | Session-code join, team selection, role selection, and operator access |
| Game Master | Session creation/deletion, participant monitoring, and data export |
| White Cell | Game controls with per-mark time allocations for Strategic Orientation and Moves 1-3, pre-Move 1 Strategic Orientation gating for move/phase advancement, dedicated Strategic Orientation review, action/proposal/response review, RFI answers, communications, timeline review, and scribe deck assignment |
| Team Facilitator | One-time Blue Strategic Orientation selection and strategic action drafting with scribe handoff, one-time Green and Red Strategic Orientation forecasts, Green and Industry proposals, Red move responses, RFIs, received White Cell updates, timeline, and quick capture |
| Team Notetaker | Observations, team dynamics, alliance tracking, and move-scoped notes |
| Team Scribe | Team support deck, distinct Strategic Orientation slides, live action/communication slides, venue projection, and final Strategic Orientation/action submission to White Cell |

Facilitator action controls prioritize Strategic Orientation first: the orientation or forecast button is the primary green control until that team records its artifact, then the orientation control becomes secondary and the action/proposal/response control becomes primary.

The built-in teams are Blue, Red, Green, and Industry. Do not expand team geography or role topology during demo hardening unless the exercise design explicitly changes.

## Repository Layout

```text
.
|-- index.html                 Landing and join flow
|-- master.html                Game Master operator console
|-- whitecell.html             White Cell operator interface
|-- teams/
|   |-- blue/
|   |-- green/
|   |-- red/
|   `-- industry/              Facilitator, notetaker, and scribe role pages
|-- decks/                     Static facilitator deck HTML
|-- src/
|   |-- core/                  Config, role routing, enums, errors
|   |-- services/              Supabase, realtime, sync, timer, heartbeat, mock backend
|   |-- stores/                Session, game state, actions, RFIs, timeline, participants, communications
|   |-- roles/                 Role-surface controllers
|   `-- features/              Actions, RFIs, export, timeline, onboarding, scribe helpers
|-- styles/                    Shared CSS tokens, layouts, components, and page styles
|-- data/                      Supabase schema and migration SQL
|-- docs/                      Deployment, Supabase setup, and live-demo runbook
`-- tests/                     Vitest unit tests and Playwright e2e rehearsal tests
```

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
```

Pass conditions:

- `npm run build` creates `dist/` from the root Vite MPA inputs.
- The built site references bundled `assets/*.js`, not raw `./src/*.js` module paths.
- Unit tests pass without stale layout or naming expectations.
- E2E smoke/live-demo tests can create sessions, join role seats, exercise core flows, and render role surfaces without console failures.

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
- Runtime backend misconfiguration blocks startup with an alert dialog and managed focus.
- Scribe alert panels use dialog semantics and focus containment.
- Browser-facing source is tested for common mojibake markers.

## Credits

Developed by Sethu Nguna for the Statecraft Simulations Group, William & Mary (2026).
