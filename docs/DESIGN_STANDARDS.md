# Design Standard for an Agent-Built Strategy Game UI

Version 2. Replaces the Anti-Vibecode Styling Standard (v1).

This standard targets AI coding agents building the interface of a grand strategy / geopolitical game. It is a greenfield project with no inherited brand guide. The stack is HTML, CSS, and vanilla JavaScript, rendered entirely in the DOM.

The goal is an interface that looks designed for this game and could not be mistaken for a generic template. A list of banned looks does not achieve that, because banning one default produces the next most common one. This standard works by requiring decisions to be made, recorded, and checked.

---

## 0. How to read this document

Three tiers, three kinds of obligation.

| Tier | Meaning | Exceptions |
|---|---|---|
| Hard constraints (H) | Must hold in every build | None |
| Required qualities (R) | Must be present in the output and verified | Only with a logged reason |
| Defaults needing justification (J) | Allowed, but each use needs a written product reason | Justification is the exception process |

MUST means the build is not done until it is true. SHOULD means do it unless you can give a reason. MAY means optional.

**Precedence.** Hard constraints always win. Among everything else, when rules conflict: intuitiveness (R11) beats visual identity (R1), and visual identity beats novelty (R10). If a styling choice makes something harder to understand, the styling changes.

Every example value in this document (hex codes, pixel sizes, durations, font names) is illustrative. Do not copy it into the project. Derive real values from the design brief.

Writing standards for UI text, tooltips, event text, and in-world writing live in a separate document, `WRITING_STANDARDS.md`, which requires its own `VOICE.md`. This document covers visual design, interaction, and structure only. Both documents apply to the same build, and the verification and conformance report in section 5 cover both.

Marketing-site concerns (hero sections, pricing, testimonials, feature grids) are out of scope. If a marketing site is ever built, it gets its own module.

---

## 1. Process (before any UI is written)

Do these in order. Do not generate screens until every artifact in 1.1 to 1.7 exists.

### 1.1 Write `DESIGN_BRIEF.md`

It MUST answer:

1. **Premise and setting.** What the game is about, in plain terms. Time period, actors, stakes.
2. **Player and session.** Who plays, for how long per sitting, on what device, with what input (mouse, keyboard, touch). State the assumed experience level: what the player already knows about strategy games and about the subject matter, and what they do not.
3. **Conventions honored.** The specific interaction habits the target player already has, from this genre or adjacent ones (selection then action, map pan and zoom, tooltip depth, how queues and end-turn work). These are the conventions R11 requires the interface to respect. Name them, do not just say "standard".
4. **Core loop and screens.** The decision cycle the player repeats, and the list of screens or panels it requires.
5. **First five minutes.** A step-by-step script of the first decisions a new player makes, using the template in Appendix E: the player's goal, the decision they face, what they must see to make it, where it appears, and whether a hint is shown. This script drives onboarding (R11) and the walkthrough check (5.4).
6. **Interaction budget.** The most frequent actions in the core loop, each with the maximum number of interactions (clicks, key presses, or taps) it may take. Set the numbers deliberately and justify them.
7. **Information inventory.** Everything the player needs to see to decide well, ranked: always visible, one action away, on demand.
8. **Visual references.** At least three named sources from outside software, such as printed atlases, archival documents, instrument panels, or other physical or editorial artifacts relevant to the premise. Say specifically what is borrowed from each (a structural habit, a proportion, a way of labeling), not just a mood. References from other games or UI galleries do not count.
9. **Tone.** Three or four concrete adjectives, each tied to a visible consequence ("austere: no ornament on data panels"). The same tone words feed `VOICE.md`.
10. **Supported viewports and input.** The exact minimum and target sizes. Everything later is tested against these.
11. **Novelty budget.** At most three places where the interface is allowed to be unusual (see R10). Each is subject to the precedence rule: it may not reduce intuitiveness.
12. **Accessibility targets.** Confirm the H3 floor and list anything higher.
13. **Out of scope.** What this build will not attempt.

### 1.2 Write `tokens.css`

All visual values MUST live here as CSS custom properties. Components reference tokens only. Required groups:

- Color roles (see R2), including every semantic role the game uses
- Type scale, line heights, and font stacks (see R3)
- Spacing scale
- Radius scale (may be a single value, including zero)
- Border and divider weights
- Elevation or layering, only if the design uses it
- Motion durations and easings (see R7)
- Z-index layers

Each token group begins with a one-line comment stating why the values suit this game.

### 1.3 Start `DESIGN_DECISIONS.md`

An append-only log. One entry per justified item from tier J, and one per approved exception to tier R:

```
## [ID or rule] Short title
Where: file and selector or screen
Decision: what was done
Reason: the product, hierarchy, interaction, or state purpose it serves
```

An entry with no real reason is not an entry. Remove the thing instead.

### 1.4 Write `GLOSSARY.md`

One canonical term per concept in the game. The glossary is the single source for every label, tooltip, event message, code identifier, and CSS class name that refers to a game concept. Use the template in Appendix E.

Rules:

- Define each term once, in one plain sentence, with its unit if it is a quantity.
- For every computed value, list what it is computed from. This feeds the breakdown requirement in R11.
- List the synonyms that MUST NOT be used for the concept. These become lint checks (Appendix B).
- Link each term to its symbol in the legend (R4), if it has one.
- `WRITING_STANDARDS.md` adds in-world terms, plain glosses, and actor name forms to the glossary (its Appendix C).
- Changing or adding a term means updating every use in the same change.

### 1.5 Write `COMPONENTS.md`

The registry of every reusable interface component, and the map that ties each game event to one color, symbol, motion, and sound. Use the template in Appendix E. It is the reference for R12.

- Each component has one entry: its single purpose, its variants (each with a reason), its states, the tokens it uses, and where it appears.
- The semantic event map has one row per semantic event: color role, symbol, motion token, and sound role.
- Update the registry in the same change as any component work. Components that are not in the registry do not ship.

### 1.6 Write `AUDIO.md`

The audio design for the game, written before any sound is added. Use the template in Appendix E. It is the reference for R13.

- The sound palette, with the brief-derived tone and named references.
- Sound roles with category, level target, and ducking rules.
- The cue map: every game event and interaction mapped to a sound role, or recorded as deliberately silent.
- The default settings for volume and mute, and the reasons.

If the game ships without audio, `AUDIO.md` says so in one line, and R13 does not apply.

### 1.7 Write `VOICE.md`

The voice sheet for all copy, required by `WRITING_STANDARDS.md` (section 1.1 and Appendix C). It defines the speaker, form of address, register, never-say list, naming conventions, formats, length limits, reading level target, and the templates for event text and in-world documents.

- Write it after the brief, because its tone words and its reading level come from the brief's tone, player description, and assumed experience level.
- Screens contain text, so no screen is built until `VOICE.md` exists. Placeholder copy written without it is rewritten, not patched.
- The length limits and reading level target in it are derived for this game by the procedure in `WRITING_STANDARDS.md` (W8), each with a recorded basis. Neither standard supplies default numbers.

---

## 2. Tier 1: Hard constraints

### H1. Stack

HTML, CSS, and vanilla JavaScript only. No frameworks, libraries, preprocessors, transpilers, or build tools. No runtime requests to third-party hosts (CDNs, font services, analytics) unless the brief explicitly allows them. Fonts, if custom, are local files loaded with `@font-face`. Sounds, if used, are local files or are synthesized with the browser's built-in audio APIs.

Rendering is DOM and CSS only. No canvas or WebGL. Map regions, units, and markers are DOM elements. Region shapes may be drawn with CSS (`clip-path`, borders, layered elements) or with inline SVG elements that belong to the document, as long as each interactive region is an individually focusable, labeled element.

### H2. No emoji in the interface

Emoji are never used as icons, status markers, bullets, or decoration, in markup, CSS `content`, or JavaScript strings.

### H3. Accessibility floor

All of the following MUST hold:

- Text contrast is at least 4.5:1 (3:1 for text 24px and larger, or 18.66px bold and larger).
- Meaningful non-text elements (borders of controls, map region boundaries, chart marks, icons that carry information) have at least 3:1 contrast against adjacent colors.
- Information is never carried by color alone. Every color-coded state, faction, or relation also has a second channel: shape, pattern, label, position, or glyph.
- Every action in the game is operable by keyboard, with a logical tab order and no traps. Map regions are reachable and activatable by keyboard.
- Focus is always visible, with at least 3:1 contrast. Never remove an outline without replacing it.
- Interactive targets are at least 24 by 24 CSS px, and primary game controls SHOULD be 32px or larger.
- Interactive elements use semantic elements (`button`, `a`, `input`, `select`, `table`, `dialog`). A clickable `div` is a defect.
- Turn events and alerts that appear without user action are announced through an appropriate live region.
- Sound never carries information alone. Every audio cue has a visual equivalent. Audio can be muted by category and its volume adjusted, and nothing plays before the first user gesture.
- `prefers-reduced-motion` is honored. Layout survives 200% text zoom without loss of content or function.

### H4. Truthful and realistic data

- Scenario data attached to real countries, leaders, or institutions is clearly labeled as fictional or simulated wherever it appears. Wording and placement rules for these labels are in `WRITING_STANDARDS.md` (WH1).
- No invented real-world statistics presented as fact.
- Placeholder and seed data MUST be realistic and internally consistent: plausible names for the setting, uneven values, correct units, and totals that add up. No lorem ipsum, "Acme", "John Doe", or tidy round numbers used as data.
- Never fabricate testimonials, endorsements, reviews, or usage figures.

### H5. Legal and privacy surfaces

If the game collects any user information, stores accounts or saves server-side, or ships publicly, it MUST expose real terms, acceptable-use rules, and a privacy statement covering what is collected, why, retention, sharing, deletion, and user rights. No placeholder links.

---

## 3. Tier 2: Required qualities

### R1. Visual language derived from the domain

The look comes from the brief's references and tone, applied consistently. Document in `tokens.css` and the brief how each reference shows up. If an element cannot be traced to hierarchy, state, interaction, or the brief, remove it.

### R2. Semantic color and faction identity

Color carries meaning, and each meaning has a named role in `tokens.css`. At minimum define roles for: primary action, secondary action, selected, hover, focus, disabled, information, success, warning, critical, and neutral. Strategy games add:

- **Faction identity.** One distinguishable identity per actor. Identities MUST remain distinguishable for common color-vision deficiencies, and each MUST carry a non-color channel (pattern, emblem shape, edge treatment, or label).
- **Relation.** Allied, neutral, hostile, and unknown, visually distinct from faction identity so the two systems never collide.
- **Resource and indicator types.** Stable colors per type, reused everywhere that type appears.
- **Fog and uncertainty.** A defined treatment for unknown, estimated, and stale information.

Do not assign colors to make adjacent panels look different. A color that appears in the interface without a role is a defect.

### R3. Typography and numerals

Choose type for legibility at the smallest sizes the game uses and for dense numeric data. Define the roles you need (for example display, interface, reading, data) and use one family where it suffices. State the reason for each choice in `tokens.css`. Requirements:

- A named type scale in tokens, with no arbitrary sizes in components
- Tabular (fixed-width) numerals in every column or list of numbers, so digits align
- Defined fallbacks and a loading behavior that avoids layout shift
- Licensing confirmed for any custom face

### R4. Symbology and icons

A strategy game is a symbol system. Design it as one:

- One consistent construction: stroke weight, grid, corner treatment, and level of detail
- Symbols distinguishable at their real rendered size by silhouette, not by color
- A glossary or legend reachable from the interface for every unit, resource, and action symbol
- A text label wherever a symbol is not instantly recognizable or an action is destructive
- No generic "intelligence" symbols (sparkles, wands) and no unmodified stock icon set used as the whole identity

Symbols are authored as inline SVG or CSS shapes. They are not emoji (H2).

### R5. Information hierarchy and density

Grand strategy is dense by nature. Density is a requirement, clutter is a defect.

- Use the brief's three levels: always visible, one action away, on demand.
- Hold layout positions stable. A given kind of information appears in the same place on every turn and every screen where it appears.
- Present quantities with units, with the change since last turn shown beside the value (delta and direction).
- Prefer tables, ledgers, lists, and annotated maps over card grids. Use grouping, alignment, and typographic weight before adding containers.
- Show the information the player needs to make the decision on the same screen as the decision.

### R6. Interaction and feedback

- Every action produces immediate acknowledgment.
- Before committing a consequential action, show its cost and expected effects with numbers.
- Irreversible actions require confirmation. Reversible ones SHOULD offer undo.
- Turn resolution shows what changed, in a reviewable log and highlighted on the board, not only the new state.
- Hover and focus behavior communicates something specific: clickable, selected, previewable, draggable, expandable. Hover alone never gates information that keyboard users need.
- Keyboard shortcuts for frequent actions are documented in the interface.

### R7. Motion

- Define duration and easing tokens, and use only those.
- Motion explains causality, state change, or navigation: a unit moving, a value changing, a panel opening, a turn resolving.
- Resolution sequences can be skipped or shortened by the player.
- No decorative or idle looping animation, no bouncing prompts.
- Under `prefers-reduced-motion`, replace movement with instant or fade-only changes while preserving the information.
- Which motion token applies to which kind of change is recorded once and applied everywhere (R12).

### R8. Layout and viewports

- Build on the spacing scale and a defined panel structure from the brief.
- Test at every viewport listed in the brief. If a viewport is unsupported, say so in the brief and show a clear message rather than a broken layout.
- Scrolling regions are deliberate: the board and main panels do not scroll the whole page unexpectedly.
- Panel sizes respond to content and the viewport, not fixed pixel widths that clip data.

### R9. Complete states

Every screen and component specifies and implements its non-ideal states. Required, where applicable:

- Loading, empty, error, offline, saving, saved, save or load failed
- Disabled (with the reason visible), unauthorized or locked, partial data
- Game states: setup, player turn, waiting on other players or AI, resolving, paused, event interruption, victory, defeat, session ended
- Unknown or stale information (see R2)

Messages in these states say what happened, why if known, and what the player can do next.

### R10. Familiarity and novelty budget

Standard controls (forms, tables, menus, dialogs, tabs, settings) behave the way users already expect. Distinctiveness comes from identity, hierarchy, map and board treatment, and key moments. Spend novelty only in the places named in the brief's novelty budget. Making a common control strange is a usability defect, not a style. See R11 for the full intuitiveness requirements.

### R11. Intuitiveness

Intuitiveness outranks visual identity and novelty (see section 0). If a styling choice makes something harder to understand, change the styling.

A player MUST be able to tell what a screen is for, what they can do on it, and what changed, without instructions. Design for these properties:

- **Discoverability.** Interactive elements are distinguishable from static content without hovering or guessing. Flat or minimal styling must still keep buttons, links, tabs, and selectable map regions visibly interactive through shape, weight, contrast, or placement.
- **Recognition over recall.** Available actions are visible at the point of decision. Nothing the player needs is hidden behind a memorized shortcut or an unlabeled gesture.
- **Predictability.** The same action always produces the same kind of result. One concept has one term (see `GLOSSARY.md`), one symbol, and one place in the layout. Do not create near-duplicate components for the same function. See R12 for the system-wide consistency rules.
- **Explained causality.** Every computed value can show where it came from: a breakdown of its contributing modifiers, available on hover and on focus, and reachable by keyboard and touch. A number the player cannot trace is a defect in a strategy game.
- **Explained unavailability.** A disabled or locked action states why it is unavailable and what would make it available.
- **Error prevention and recovery.** Previews, confirmations, and undo as specified in R6.
- **Attention guidance.** The player can always answer "what needs my attention now?" through an attention queue or equivalent, and "what changed since my last turn?" through the change log in R6.
- **Progressive disclosure.** Default views show the essentials from the first level of the information inventory (R5). Advanced detail is opt-in and never required to make a basic decision.
- **Familiar conventions.** "Familiar" means familiar to the target player named in the brief: the conventions listed there for selection, map interaction, tooltip depth, and queues. A departure is logged in `DESIGN_DECISIONS.md` and counts against the novelty budget.
- **Onboarding inside the interface.** First-use hints follow the first-five-minutes script in the brief. Hints are dismissable and can be reopened from a help entry. No forced tutorial that blocks play, unless the brief justifies one.
- **Shared vocabulary.** All labels, tooltips, event text, and code identifiers use the terms in `GLOSSARY.md`. Wording rules for those texts are in `WRITING_STANDARDS.md`.

The checks in 5.4 are proxies. Only a playtest with novice players (5.5) shows whether intuitiveness was achieved.

### R12. System consistency

Every kind of thing has one definition, and every instance uses it. Inconsistency is a defect even when each instance looks fine on its own. Consistency applies across all of these:

- **Color.** Each color role from R2 has one value and one meaning everywhere. A role never means two things, and one meaning is never expressed by two colors. A new color needs a new role in `tokens.css` first.
- **Buttons and controls.** Each control type (primary button, secondary button, destructive button, icon button, toggle, tab, input, select, slider, checkbox) is defined once in `COMPONENTS.md` with its variants and its states: default, hover, focus, active, disabled, loading, selected. The same function uses the same component. Size, padding, radius, label position, and state treatment come from the shared definition, with no one-off variants.
- **Action hierarchy.** One primary action per panel or dialog. Confirm and cancel sit in the same positions in every dialog. Destructive actions are styled the same everywhere.
- **Motion.** The same kind of change uses the same motion token and easing everywhere: panel open, value change, selection, turn resolution. Duration scales by a stated rule, not by taste at the time of writing.
- **Audio.** The same event always makes the same sound (R13).
- **Feedback.** Success, warning, error, and information messages each follow one pattern for position, structure, and duration.
- **Symbols and terms.** One symbol and one term per concept (R4, R11, `GLOSSARY.md`).
- **Spacing and layout.** Panels, headers, lists, and tables use the spacing scale and one internal structure per panel type.
- **Cross-channel mapping.** For each semantic event (select, confirm, success, warning, critical, turn start, turn resolve, notification by severity, and the game's own events), `COMPONENTS.md` holds one row: color role, symbol, motion token, sound role. An implementation uses the whole row, not parts of it.

Working rules:

- Before building a component, check `COMPONENTS.md`. Reuse it, extend it with a logged variant, or add a new component with a stated reason.
- A change to a shared definition updates every instance in the same change.
- Consistency is checked by the registry audit in 5.4 and by the lint patterns in Appendix B.

### R13. Audio design

Audio gets the same discipline as color and motion. If the game has no audio, this principle does not apply (see 1.6).

- **Palette.** `AUDIO.md` defines the characteristics shared by every sound: tonal family, timbre, attack and decay, dryness or reverb, pitch range. They are derived from the brief's tone and from named references, held to the same standard as R1. Every sound belongs to the palette.
- **Roles, not buttons.** Sounds are assigned to semantic roles: interface (press, toggle, error, success), world events (turn start, turn resolve, notification by severity), ambient, and music if any. One role, one sound family. Variation within a role is deliberate and documented, for example pitch steps that encode magnitude.
- **Cue map.** `AUDIO.md` maps every game event and interaction to a sound role or to silence. Silence is a valid decision and is recorded.
- **Levels.** Loudness targets per category are set once, with defined relationships between categories (for example interface quieter than alerts, ambient beneath everything). Ducking rules for overlapping sounds are defined.
- **Single entry point.** All playback goes through one audio module (`audio.js`). Components request a role, for example `play(role)`, and never reference files or create audio objects themselves. This keeps levels, ducking, and mute behavior uniform.
- **Repetition.** Frequent actions get short, quiet, low-fatigue sounds that stay tolerable on the hundredth repetition. Rare, important events get distinctive sounds.
- **Player control.** Master volume and per-category mute (interface, alerts, ambient, music) are in settings, remembered between sessions, and respected everywhere. Nothing plays before the first user gesture, and no audio autoplays on load.
- **Accessibility.** Sound never carries information alone (H3). Every cue has a visual equivalent, and critical alerts also have an announced equivalent.
- **Alignment with motion.** A sound that accompanies a visual change is timed to the motion token for that change, with the same timing relationship every time.
- **Assets.** Local files or browser-synthesized only (H1), in one format with consistent sample rate and normalization. Licensing is confirmed for every file.

---

## 4. Tier 3: Defaults requiring justification

These are not banned. Each use needs a `DESIGN_DECISIONS.md` entry giving a product reason. Details are in Appendix A.

- **J1. Color defaults.** Gradients, dark-plus-violet or electric-blue schemes, neon, generic pastels, pure white as the main surface.
- **J2. Type defaults.** Reaching for a fashionable face without a stated reason.
- **J3. Depth and decoration.** Drop shadows on every container, glass and blur, glowing orbs, dot-grid backdrops.
- **J4. Layout defaults.** Three-card rows, bento grids, colored-left-border cards, uniform large radii.
- **J5. Genre costume.** Military or sci-fi HUD dressing (scanlines, glitch effects, angled frames, fake telemetry), and antique-map skeuomorphism (parchment, burnt edges, fantasy lettering) applied as costume rather than derived from the brief.
- **J6. The replacement trap.** Swapping a flagged default for the next most common one is not a justification. If an agent removes violet gradients and Inter and lands on the current common alternative, that is still an unjustified default. Each choice must trace to the brief.
- **J7. Audio defaults.** Stock interface blips, a generic whoosh on every transition, hover sounds on everything, looping music the player cannot control, and sounds from mixed sources with no shared palette.

---

## 5. Verification (before declaring any screen done)

Run every check in this section. Report results, including deviations, in the final message.

### 5.1 Mechanical lint

Search the source for the patterns in Appendix B. Fail items must be fixed. Review items need a decisions entry or a fix.

### 5.2 Screenshot review

Capture each major screen at every viewport in the brief, and capture each state listed in R9 that applies. Check hierarchy, alignment, density, overflow, and clipped content. Do not review only the ideal state.

Also capture a component sheet: every component in `COMPONENTS.md` in every state, on one page. Compare it against the registry and against the screens, and look for any instance that differs from its definition.

### 5.3 Accessibility pass

- Tab through every screen using only the keyboard and perform one full turn.
- Check contrast of every text and non-text color pair against H3.
- Simulate color-vision deficiency and confirm factions and relations remain distinguishable.
- Toggle reduced motion and confirm information is preserved.
- Zoom text to 200% and confirm nothing is lost.
- Mute each audio category in turn and confirm no information is lost. Confirm nothing plays before the first user gesture.

### 5.4 Intuitiveness review

- **Five-second check.** For each major screen, state from a quick look alone: what the screen is for, what the player can do, and what changed since the last turn. If any of the three is not answerable, redesign the hierarchy.
- **Interaction budget.** Count the interactions each frequent action takes. Report any that exceed the budget in the brief.
- **Cognitive walkthrough.** Step through the first-five-minutes script as a new player who knows only what the brief says they know. At each step record whether the next action is obvious, whether it is visible, and whether feedback confirms it worked. Log every point of hesitation as a defect to fix or a decisions entry.
- **Label audit.** Every icon-only control has an accessible name and a legend entry. Every disabled control exposes its reason. Every computed number has a breakdown.
- **Consistency audit.** One component per function. The same term, symbol, and position for the same concept everywhere. Check wording against `GLOSSARY.md`.
- **Registry audit.** Every component in the code is in `COMPONENTS.md`, and every instance matches its definition in size, spacing, radius, and state treatment. No color, motion, or sound is used for a meaning other than its role. Every row of the semantic event map is implemented in full: color, symbol, motion, and sound.
- **Audio audit.** Every event in the game appears in the cue map. Levels between categories follow `AUDIO.md`. The same event produces the same sound every time. Repeated sounds stay tolerable over a long play session.

### 5.5 Playtest protocol

Agents cannot judge whether real novices find the game intuitive. The results of 5.4 are proxies until people have played it. When the owner schedules a playtest:

1. Recruit 3 to 5 players who match the brief's player description and have not seen this game.
2. Give each the goals from the first-five-minutes script, not instructions. Ask them to think aloud. Do not help.
3. Record per session: hesitation points (screen, element, time), misreadings, and what they said.
4. Run the copy check. After play, ask each player to explain in their own words what three event messages and two in-world documents meant, and what they would do next. Record each misunderstanding as a copy defect, and note whether the cause was vocabulary, structure, or length.
5. Turn each issue seen by two or more players into a fix or a decisions entry, using the template in Appendix E.
6. Re-run 5.4 after the fixes, and the copy checks in `WRITING_STANDARDS.md` (section 5) for any text that changed.

Until steps 1 to 5 have been done, the conformance report states that intuitiveness and comprehension are verified by proxy only. Use the playtest results to set or revise the length limits and reading level in `VOICE.md`.

### 5.6 Conformance report

End each work session with:

1. What was built or changed
2. Lint results
3. Viewports and states captured
4. Accessibility pass results
5. Intuitiveness review results (5.4) and playtest status (5.5)
6. New `DESIGN_DECISIONS.md` entries, and changes to `COMPONENTS.md` and `AUDIO.md`
7. Any requirement not met, and why
8. If copy was written or changed, the copy conformance report from `WRITING_STANDARDS.md` (section 5.6)

---

## Appendix A: Catalog of common tells

Use this to recognize what unexamined defaults look like. Presence is not a failure by itself under tier J. Absence of a reason is.

**Color and surface**
- Blue to purple, purple to pink, or cyan to violet gradients; gradient text
- Black backgrounds with violet or electric-blue accents and glow
- Neon without a luminous role in the product
- Mint, lavender, peach, baby blue, and pale yellow used together as a generic palette
- A pure `#fff` page background with no designed surface scale
- Different colors assigned to sibling cards just to separate them

**Typography**
- Inter, Geist, or Space Grotesk chosen by habit
- Substitute fashionable families (for example current "editorial" serif and geometric sans choices) chosen by habit
- Arbitrary font sizes outside a scale

**Depth and decoration**
- The same large soft shadow on every container
- Glassmorphism on nav bars, cards, dialogs
- Blurred glowing circles behind content
- Dot-grid or noise backdrops with no spatial function
- Sparkle icons for AI or automation features

**Layout**
- Three equal feature cards
- Bento grids where the modules are not independent
- Cards with a thick colored left border to signal hierarchy
- The same 12, 16, or 24px radius on everything
- Containers added to compensate for weak hierarchy

**Motion**
- Hover lift, glow, and scale on every element
- Bouncing arrows and idle loops
- `transition: all`

**Genre costume**
- Scanlines, CRT curvature, glitch, fake terminal output, fake live telemetry
- Parchment textures, torn edges, compass roses, and fantasy fonts that do not come from the brief
- Decorative "classified" or "confidential" stamps with no game meaning

**Audio**
- The same generic UI click on every control
- A different sound each time for the same event
- Sounds from unrelated packs with different loudness and character
- Looping background music with no player control
- Sound used as the only signal for an alert

**Content**
- Placeholder names, round-number statistics, uniform sample data
- Fabricated quotes, endorsements, or usage figures

---

## Appendix B: Lint patterns

Run these against all source files. Patterns are regular expressions. Pattern scope is stated in each item. The copy lint patterns are in `WRITING_STANDARDS.md` (Appendix B) and run in the same pass.

**Fail (must fix)**
- Raw colors outside `tokens.css`: `#[0-9a-fA-F]{3,8}\b`, `rgba?\(`, `hsla?\(`, `oklch\(`
- Raw font sizes, radii, or durations outside `tokens.css`: `font-size:\s*[\d.]+(px|rem|em)`, `border-radius:\s*[\d.]+`, `(transition|animation)[^;]*[\d.]+m?s`
- Emoji anywhere in markup, CSS, or JS strings (use a Unicode-aware search): `[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]`
- External dependencies: `(src|href)=["']https?://`, `@import\s+url\(["']?https?://`, `fetch\(["']https?://` (unless allowed by the brief)
- Removed focus without replacement: `outline:\s*(none|0)` with no `:focus-visible` rule for the same selector
- Non-semantic interactive elements: `<(div|span)[^>]*(onclick|role="button")`
- Canvas or WebGL: `<canvas`, `getContext\(`
- Placeholder content: `lorem ipsum`, `\bAcme\b`, `John Doe`, `Jane Doe`
- Animation or transition present but no `prefers-reduced-motion` media query anywhere in the CSS
- Audio playback outside the audio module: `new Audio\(`, `AudioContext`, `\.play\(\)`, `<audio` anywhere except `audio.js`
- Autoplay: `autoplay`

**Review (needs a fix or a decisions entry)**
- Gradients: `(linear|radial|conic)-gradient`
- Glass and blur: `backdrop-filter`, `filter:\s*blur`
- Left-border accents: `border-(left|inline-start)\s*:\s*[2-9]px`
- Shadows: `box-shadow`, and flag when more than three distinct values exist
- Flagged font names: `Inter|Geist|Space Grotesk|DM Sans|Fraunces|Instrument Serif|Plus Jakarta`
- Transition on everything: `transition:\s*all`
- Idle motion: `animation[^;]*infinite`
- Hover without keyboard parity: `:hover` selectors with no matching `:focus-visible` rule
- Colors used in component CSS that have no role in `tokens.css`
- Disabled controls with no stated reason: `<button[^>]*disabled` or `aria-disabled="true"` with no `aria-describedby` pointing at reason text
- Icon-only controls with no accessible name: `<button[^>]*>\s*<svg` with no `aria-label` and no visible text
- Glossary violations: any term listed under "Avoid" in `GLOSSARY.md` appearing in markup, strings, class names, or identifiers
- Inline styles that bypass tokens and components: `style="` in markup, and `\.style\.[a-zA-Z]+\s*=` in JavaScript (setting a custom property is acceptable)
- Forced overrides: `!important`
- Button-like classes not in the registry: `\.(btn|button)[-_]` selectors whose names are not listed in `COMPONENTS.md`
- Sound file references outside the audio module and `AUDIO.md`: `\.(mp3|ogg|wav|m4a|flac)`

---

## Appendix C: Mapping from v1

| v1 rule | Now |
|---|---|
| ST-01, 04, 05, 06 | J1 |
| ST-02 | J1, tokens |
| ST-03 | R2 |
| ST-07 | J2, R3 |
| ST-08 | R3, tokens |
| ST-09, 24, 25, 26 | `WRITING_STANDARDS.md` (WJ1, WJ2, WJ5, WJ3) |
| ST-10, 11 | R4 |
| ST-12 | H2 |
| ST-13, 14, 15, 16 | J4 |
| ST-17, 18, 19, 20 | J3 |
| ST-21, 23, 31 | Out of scope (marketing module) |
| ST-22 | J5 |
| ST-27, 28, 29 | R6, R7 |
| ST-30 | R9 |
| ST-32, 33 | H5 |

New in v2: process artifacts including the glossary (section 1), hard accessibility floor (H3), truthful data (H4), symbology (R4), information density (R5), viewports (R8), familiarity and novelty budget (R10), intuitiveness and the precedence rule (R11, section 0), system consistency with the component registry and event map (R12, `COMPONENTS.md`), audio design (R13, J7, `AUDIO.md`), the voice sheet and the companion copy standard (`VOICE.md`, `WRITING_STANDARDS.md`), replacement trap (J6), verification, playtest protocol, and reporting (section 5).

---

## Appendix D: Agent block

Paste into `CLAUDE.md` or `AGENTS.md`. It points to this file rather than duplicating it.

```md
## UI DESIGN STANDARD

Follow DESIGN_STANDARDS.md for all interface work. Summary:

### Process
1. Before writing UI, create DESIGN_BRIEF.md, tokens.css, DESIGN_DECISIONS.md, GLOSSARY.md,
   COMPONENTS.md, AUDIO.md, and VOICE.md.
2. All visual values come from tokens.css. No raw colors, sizes, radii, or durations in components.
3. Derive the visual language from the brief's named non-software references.
4. All copy follows WRITING_STANDARDS.md and VOICE.md. Use its agent block for copy work.

### Hard constraints
- HTML, CSS, and vanilla JavaScript only. DOM rendering only. No libraries, no external requests, no emoji.
- Accessibility floor (DESIGN_STANDARDS.md H3): contrast, keyboard operation, visible focus,
  no color-only meaning, semantic elements, reduced motion.
- Realistic, internally consistent seed data. Scenario data on real entities is labeled fictional.

### Required in every build
- Semantic color roles, with factions distinguishable without color
- Dense but hierarchical information, tabular numerals, deltas beside values
- Cost and effect previews before consequential actions; turn results shown as changes
- Every state implemented: loading, empty, error, saving, waiting, resolving, game over
- Standard controls behave conventionally; novelty only where the brief allows
- Intuitiveness outranks visual identity, and identity outranks novelty (R11):
  - interactive elements look interactive without hovering
  - every computed number has a breakdown, and every disabled action says why
  - one term per concept from GLOSSARY.md, used in labels, tooltips, and code
  - onboarding hints follow the brief's first-five-minutes script
- Consistency (R12): one definition per color role, button type, motion, sound, symbol, and term.
  - check COMPONENTS.md before building any component; reuse before creating
  - each semantic event uses its full row: color role, symbol, motion token, sound role
  - a change to a shared definition updates every instance in the same change
- Audio (R13), if the game has sound: one palette, sounds assigned to roles, all playback through
  audio.js, a cue map covering every event, player volume and mute controls, no sound-only information

### Defaults that need a written reason in DESIGN_DECISIONS.md
Gradients, glass, shadows, glow, neon, dark-plus-violet, fashionable font choices, three-card
rows, bento grids, colored-left-border cards, HUD or antique-map costume. Replacing one
default with the next most common one does not count as a reason.

### Before declaring done
Run the lint patterns (Appendix B), review screenshots at every supported viewport and state,
complete the keyboard and contrast pass, run the intuitiveness review (section 5.4), and end
with the conformance report (section 5.6), including the copy checks when text was written or
changed. State that intuitiveness and comprehension are verified by proxy only until a human
playtest has been run.
```

---

## Appendix E: Templates

### GLOSSARY.md

For this game, `WRITING_STANDARDS.md` (Appendix C) adds columns for the in-world term and plain gloss, and a separate table of actor name forms.

```md
# Glossary

One canonical term per concept. Use it in labels, tooltips, event text,
code identifiers, and CSS class names.

| Term | Definition (one sentence, with unit) | Computed from | Symbol | Appears in | Avoid |
|---|---|---|---|---|---|
| <canonical term> | <what it is, in plain words> | <inputs and modifiers, or "base value"> | <symbol id from the legend, or none> | <screens and panels> | <synonyms that must not be used> |
```

### First five minutes (goes in DESIGN_BRIEF.md)

```md
## First five minutes

The player is assumed to know: <list>
The player is assumed not to know: <list>

| Step | Player goal | Decision they face | What they must see | Where it appears | Hint shown |
|---|---|---|---|---|---|
| 1 | <goal> | <decision> | <information> | <screen or panel> | <yes or no, and the hint> |
```

### Playtest log (entries go in DESIGN_DECISIONS.md)

```md
## Playtest <date>
Players: <count>, <background in one line>
Script goals given: <step numbers>

### Issue: <short title>
Seen by: <count of players>
Where: <screen and element>
Observed: <hesitation, misreading, or quote>
Cause: <why the interface led to it>
Fix: <what changed, or why not>
```

### COMPONENTS.md

```md
# Components

## Registry

| Component | Single purpose | Variants (each with a reason) | States | Tokens used | Appears in |
|---|---|---|---|---|---|
| <name> | <one function> | <variants> | default, hover, focus, active, disabled, loading, selected | <token names> | <screens and panels> |

## Semantic event map

| Event | Color role | Symbol | Motion token | Sound role |
|---|---|---|---|---|
| <event> | <role from tokens.css> | <symbol id from the legend> | <token, or none> | <role from AUDIO.md, or silence> |
```

### AUDIO.md

```md
# Audio

## Palette
Tone derived from the brief: <description>
References: <named sources and what is borrowed from each>
Shared characteristics: <timbre, attack and decay, dryness or reverb, pitch range>

## Roles and levels

| Role | Category | Level target | Ducks | Expected frequency | Notes |
|---|---|---|---|---|---|
| <role> | interface, alert, ambient, or music | <relative to other categories> | <roles it lowers, if any> | <per minute, rough> | <variation rules> |

## Cue map

| Event or interaction | Sound role (or silence) | Visual equivalent | Motion token alignment |
|---|---|---|---|
| <event> | <role or silence, with reason if silent> | <what the player sees> | <token> |

## Player controls
Master volume and per-category mute. Defaults and the reasons: <description>
```
