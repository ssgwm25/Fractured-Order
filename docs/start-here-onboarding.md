# Start Here role walkthrough

Every shipped role surface exposes a persistent **Start Here** guide. The guide
opens as a modeless popup and minimizes into its established position in the
sidebar. It explains the real native surface, highlights the current target,
and can focus or open that surface only after the user selects the explicit
action. It does not duplicate forms, submit records, approve work, advance game
state, or infer completion from visibility.

## Shared experience

- First-time and explicitly reopened walkthroughs appear in a responsive,
  viewport-level popup. The popup is modeless so highlighted role controls
  remain available during the walkthrough.
- **Minimize to sidebar**, the popup header, or `Escape` returns the guide to
  the compact Start Here card above the sidebar session block. Selecting that
  card restores the popup without losing the current step.
- Completed guides and guides previously minimized by the user load in the
  compact sidebar position. Completion remains replayable.
- The popup starts with two distinct introductory slides: **Platform
  orientation** and **Role focus**. Role-surface walkthrough slides follow;
  orientation and role copy never share a slide with Step 1.
- Each step contains a concise surface description, an in-play narrative, up to
  four bounded operational facts, and a human-readable target label.
- The live-tracker slide uses the stable `#header-game-state` and
  `#header-timer` hooks exposed by every applicable shipped role shell. Game
  Master exposes the game-state hook only because its timer controls remain in
  White Cell. The visible tracker is highlighted instead of being reported as
  conditionally unavailable.
- **Open _surface_** invokes the existing native control. Missing or conditional
  targets produce an inline status and do not block the rest of the guide.
- **Back**, **Next**, **Finish**, and **Minimize to sidebar** remain keyboard
  operable.
  Finishing persists a role-scoped completion marker but leaves Start Here
  available for replay.
- Legacy `done` state is read for compatibility. New state uses `step`,
  `minimized`, and `completed` under a role/team-scoped local-storage key.
- The local 2:28 Plenum platform overview owns the first slide. It never
  autoplays, includes the English WebVTT caption track, and retains the full
  visible transcript if video playback fails or is unwanted.
- Video pauses when the guide collapses, the page is hidden, the page unloads,
  or the component is destroyed.
- From Role focus onward, each slide exposes icon-only Play, Pause, and Stop
  controls with accessible names. Narration is opt-in and never autoplays.
- Spoken copy is derived from the complete visible slide text. Content-addressed
  filenames prevent changed copy from silently reusing stale audio.
- Narration does not simply recite the card. Role-focus clips explain ownership,
  workflow sequence, and authority boundaries. Each surface clip explains what
  to inspect, how the component is used during play, what to verify, and how to
  move into the native surface while keeping every factual instruction grounded
  in the visible slide.
- Audio pauses and resets on slide change, minimize, page hide, teardown, and
  completion. Playback failure leaves the visible slide fully usable.
- The screen-reader status identifies the narration as AI-generated Kokoro
  audio using the pinned `af_heart` voice.
- During `npm run dev`, Vite serves only content-addressed MP3 and WebVTT files
  from the ignored review batch. Byte-range requests are supported for reliable
  browser playback and seeking. This local review path is never included in a
  production build.
- Production remains fail-closed until the full listen-through and promotion
  workflow activates the approved manifest under `public/onboarding/`.

## Role coverage

| Role surface | Walkthrough coverage |
| --- | --- |
| Team Scribe | Role boundary; live tracker; Strategic Orientation and team-specific action/proposal authoring; RFIs; responses; received proposals; Tribe Street Journal; population sentiments; timeline; Quick Capture; explicit handoff check |
| Team Facilitator | Role boundary; live tracker; Team Action Review; deck; proposal threads; RFIs; communications; activity; presentation mode; final White Cell handoff check |
| Team Notetaker | Role boundary; live tracker; Quick Capture; Team Dynamics; Alliance Tracking; team artifacts; inbox; timeline; observation closeout |
| Observer compatibility view | Read-only boundary; tracker; team artifacts; RFIs; responses; received proposals; journal; sentiments; timeline; no write-oriented guidance |
| White Cell Lead / Support | Role boundary; live tracker; Simulation Settings; session tabs; every review queue; review history; Macro, Diplomacy/Information, NI/Escalation, and report PLI surfaces; journal; sentiments; RFIs; communications; timeline; notification control; operator closeout |
| Game Master | Role boundary; session tracker; dashboard; sessions; participants; exports; plugins; administration handoff |
| Econ SME | Queue state; Macro chain; explicit approve/override/send-back controls; specialist closeout |
| NI/Escalation SME | Queue state; Macro dependency; six-domain NI and Glasl evidence; explicit specialist controls; closeout |
| Diplomacy & Information SME | Queue state; Macro dependency; paired outputs; explicit specialist controls; closeout |
| TSJ SME | Queue state; source narrative; Copy then Mark done handoff; acknowledged history |
| Verba SME | Queue state; source narrative; Copy then Mark done handoff; acknowledged history |

The legacy filenames `facilitator.js` and `scribe.js` do not represent the
public labels. The former renders the Scribe workspace and the latter renders
the Facilitator support deck. Walkthrough copy follows the public semantic role
labels from `teamContext.js`.

## Human verification

Run the focused contract tests:

```powershell
npm test -- vite.config.test.js src/features/onboarding/audioGuide.test.js src/features/onboarding/startHereAudioManifest.test.js src/features/onboarding/followAlong.test.js scripts/start-here-audio/export-scripts.test.js tests/unit/start-here-role-coverage.test.js src/roles/facilitator.test.js src/roles/scribe.test.js src/roles/notetaker.test.js src/roles/whitecell.test.js src/roles/gamemaster.test.js src/roles/sme.test.js
```

Pass means the shared guide mounts once, opens in its modeless popup host,
minimizes back to the correct sidebar position, responds to `Escape`, resumes
legacy and current progress, keeps completion replayable, clears multi-target
highlighting deterministically, focuses requested native surfaces, keeps video
opt-in, and matches all shipped role guide contracts.

Then run the browser smoke gate:

```powershell
npm run test:e2e:smoke
```

Manually inspect at desktop and 390 px mobile width with one profile from each
row above. Confirm the popup is centered on desktop and bottom-aligned without
clipping at mobile width; keyboard focus order; visible focus rings; `Escape`
minimization and focus return; compact-card reopening; sidebar placement and
scrolling; orientation, role focus, and Step 1 appearing as separate slides;
missing-target recovery on an empty SME queue; captions; transcript toggling;
video pause on minimize; and reduced-motion behavior. The guide must not submit,
approve, publish, advance the timer, or mutate any native workflow state.

The static Kokoro generation and owner-approval workflow is documented in
`scripts/start-here-audio/README.md`. Review output stays ignored and outside
`public/onboarding/` until every unique clip has passed the full listen-through.
