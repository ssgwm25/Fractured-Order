# Fractured Order

![Fractured Order facilitator deck](screenshot.PNG)

This repository holds the facilitation materials and the web-based delivery layer (the Plenum platform) for running the game.

---

## What it is

*Fractured Order* simulation tests how effective non-military tools - sanctions, export and investment controls, incentives, standards-setting, information, and diplomacy - actually are at shaping state behavior, and surfaces the inflection points where one actor's choices reinforce or undermine alliance cohesion.

## Teams

| Team | Plays | Role in the system |
|------|-------|--------------------|
| **Blue** | Sets the agenda with economic statecraft |
| **Green** | The swing weight whose alignment decides the outcome |
| **Red** | Contests Blue, courts or coerces Green | Defines antagonistic objectives within the simulation
| **White Cell** | Control & adjudication | Clarifies requests, scores effects, paces and resets the scene |

Supporting roles include a facilitator, facilitator assistants, IT/AV support, and notetakers seated with each team.

## How a game runs

Three **MOVES**, each following the same loop and separated by plenary adjudication:

1. **Orient** to the current scene
2. **Deliberate** within the team
3. **Act** - Blue selects instruments and targets; Red responds and works Green directly; Green answers the three standing questions (*How are you positioned? What changes with Blue? What changes with Red?*)
4. **Adjudicate** in plenary, where the White Cell scores effects and sets the next scene

A closing hot wash reviews where cohesion held, where it cracked, which levers bit, and what each side could have done differently.

---

## Repository contents

```text
.
|-- decks/                          Facilitator support folders (HTML slide viewers)
|   |-- fractured-order-facilitator-deck.html          # Blue team
|   |-- fractured-order-green-facilitator-deck.html    # Green team
|   `-- fractured-order-red-facilitator-deck.html      # Red team
|-- platform/                       Plenum delivery platform
|   |-- index.html                  Landing + boot loader, session join
|   `-- src/                        Frontend modules and role surfaces
`-- docs/                           Player's guide, scenario, reference matrices
```

> Adjust the tree above to match your actual layout - this reflects the materials produced so far.

### Facilitator decks

Each team has its own self-contained facilitator deck: a slide viewer with a sidebar table of contents, arrow/keyboard navigation, a clickable progress bar, and a fullscreen present mode. The slides are native HTML (editable text, not images), with a single team-accent CSS variable.

Open any deck file directly in a browser - no build step or server required.

| Key | Action |
|-----|--------|
| `ArrowRight` / `Space` / `PageDown` | Next slide |
| `ArrowLeft` / `PageUp` | Previous slide |
| `Home` / `End` | First / last slide |
| `F` | Toggle fullscreen present mode |
| `Esc` | Exit fullscreen |

### Plenum platform

The web delivery layer for running the game live: a **Vite** frontend with a **Supabase** backend, session-code access, realtime state push, and JSON export of game state for post-game analysis. Teams join by session code and select their team and role from the landing page.

Dedicated facilitator, notetaker, and scribe role surfaces live under `teams/<team>/`. Scribe shells share the common modal stylesheet so logout and confirmation dialogs render consistently with the rest of the platform.

Each role surface mounts a role-specific onboarding guide above the sidebar session label. The guide explains the role's main workflow plus the live move, phase, and timer indicators. When collapsed or completed, it remains available as `Start Here` so users can reopen the role reference without logging out and joining again.

The White Cell guide explicitly walks operators through game controls, session operations, Blue actions, Green proposals, Red move responses, Tribe Street Journal, Verba AI sentiment updates, RFIs, communications, the session timeline, and queue notification muting.

The Blue facilitator guide explicitly walks facilitators through strategic actions, RFIs, White Cell responses, received proposals, Tribe Street Journal, Verba AI sentiment updates, the timeline, and Quick Capture.

The Green facilitator guide follows the same full tour pattern with proposal-specific guidance for drafting, White Cell review, forwarded proposal responses, RFIs, updates, timeline review, and Quick Capture.

Game Master and White Cell operators can create and delete live sessions from their admin surfaces. Participant rosters are scoped and labeled by the selected or active session so operators can distinguish seats across concurrent exercises.

White Cell scribe deck controls render default team decks immediately while live communications hydrate. Browser-uploaded decks remain same-device cache assignments; blocked browser storage must fail with an operator-visible error rather than leaving the deck workflow in a loading state.

Scribe deck navigation is split into distinct `Actions` and `Deck` groups. Live actions use a separate accented treatment from support deck slides, and each section can be expanded or collapsed independently; closing the active section must not force another section open.

White Cell operators can mute queue arrival notifications from the header. Muting suppresses the toast interruption only; sidebar counts and in-queue NEW labels remain visible so adjudication awareness is not lost.

The Blue Team action builder includes inline helper text for Objective and Expected Outcomes so facilitators distinguish intended goals from anticipated downstream effects.

### UI accessibility contracts

Role-surface sidebars are hash-addressable section navigators. Activating a sidebar link updates the visible section, sets `aria-current="page"` on the active link, preserves the section hash, and moves focus to the newly active section heading for keyboard and screen-reader orientation.

Landing and operator access validation must render persistent inline errors in addition to toast notifications. Invalid fields set `aria-invalid`, point at their error region with `aria-describedby`, and keep the error visible until the user changes that field.

Repeated team forms use semantic fieldsets for capture-type radio groups and explicit `for`/`id` label bindings for textareas, sliders, and other controls.

Scribe alert panels are real dialogs: the trigger owns the panel with `aria-controls`, the panel has `role="dialog"` and `aria-modal="true"`, focus moves into the dialog on open, `Tab` wraps within it, `Escape` closes it, and focus returns to the trigger.

Game Master create-session modal controls use modal-scoped IDs (`newSessionName`, `newSessionCode`, and `newSessionDescription`) so they do not collide with the sidebar session label IDs.

Inline SVG icons in role and operator shells are decorative by default. They must include `aria-hidden="true"` and `focusable="false"` unless a future icon is intentionally named and exposed.

Browser-facing UI source is guarded against common mojibake markers, including corrupted dash/apostrophe bytes and Unicode replacement characters.

---

## Running a session

**Tabletop / projector only.** Open the relevant facilitator deck in a browser, present fullscreen, and run the three-move loop from the schedule slides. This needs nothing beyond a browser.

**Platform-backed.** Stand up the Plenum frontend and point it at a Supabase project, then share the session code with players. See `platform/` for setup.

```bash
# from platform/
npm install
npm run dev        # local development
npm run build      # production build
```

Provide Supabase credentials via environment variables (see `platform/.env.example`).

---

## Credits

Developed by Sethu Nguna for the **Statecraft Simulations Group**, William & Mary (2026).
