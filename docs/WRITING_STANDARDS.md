# Writing Standard for the Game's Copy

Version 1. Companion to `DESIGN_STANDARDS.md`.

This standard governs every word the player reads: interface text, event and consequence text, and in-world documents. It is written for AI coding agents and writers building a grand strategy game set among real countries, with an invented scenario, a fully in-world voice, and general players who are not assumed to know the subject.

Those four facts pull against each other. A fully in-world voice invites jargon and flavor. General players need plain words. Real countries require care about what the game claims. This standard resolves those tensions with explicit precedence and with required artifacts, so the result does not depend on taste at the moment of writing.

---

## 0. How to read this document

| Tier | Meaning | Exceptions |
|---|---|---|
| Hard constraints (WH) | Must hold in every string the player can read | None |
| Required qualities (W) | Must be present in the output and verified | Only with a logged reason |
| Defaults needing justification (WJ) | Allowed, but each use needs a written reason | Justification is the exception process |

MUST means the work is not done until it is true. SHOULD means do it unless you can give a reason. MAY means optional.

Every example string and number in this document is illustrative. Do not copy it into the game.

**Precedence.** Hard constraints always win. Among everything else, when rules conflict:

1. Clarity beats voice. The player must understand what a control does, what happened, and what they can do next.
2. Voice beats variety and flavor. One consistent voice is better than several clever ones.

If an in-world phrasing makes something harder to understand, the phrasing changes. This applies the intuitiveness principle (R11) and the data-truth rule (H4) from `DESIGN_STANDARDS.md` to text.

Scope: interface text, event and consequence text, and in-world documents. Reference text (codex, encyclopedia, scenario descriptions, help pages) is out of scope for this version. It must still use the terms in `GLOSSARY.md`.

---

## 1. Process (before any copy is written)

### 1.1 Write `VOICE.md`

Use the template in Appendix C. It MUST define:

1. **The speaker.** Who is "talking" in the interface: which institution, office, or staff the player is working inside, and what that body is like.
2. **The reader and form of address.** How the player is addressed (as their in-world role, by title, or as "you") and what the speaker assumes they know. Default assumption for this game: nothing about the subject matter.
3. **Register and attitude.** Three or four concrete adjectives, each tied to a visible writing consequence ("measured: no exclamation marks in event text").
4. **The never-say list.** Phrases, registers, and habits this voice does not use.
5. **Naming conventions.** The convention for naming real states, institutions, and offices, and the stated rule for contested names or territories. Apply it everywhere.
6. **Formats.** Dates (in-game calendar), numbers, currency, units, and percentage presentation, produced through the browser's `Intl` APIs, not hand-typed.
7. **Length limits** by text type, derived by the procedure in W8, each with a recorded basis.
8. **Sample lines** for each text type, written in the voice.
9. **Templates** for each event type and each in-world document type (see W5 and W6).
10. **Reading level target.** Derived from the reader described in the brief, by the procedure in W8, with a named measure and a recorded basis. This standard supplies no default number.

### 1.2 Extend `GLOSSARY.md`

The glossary from `DESIGN_STANDARDS.md` is the source of every term. For this game add:

- **In-world term and plain gloss.** Where the interface uses an in-world name for a concept, record the in-world term and a one-line plain explanation at the reading-level target.
- **Actor forms.** Every actor, real or invented, has one full name, one short name, and one adjective form, used consistently.
- **Avoid list.** Synonyms that must not appear for that concept.

### 1.3 Write templates before instances

Define the template for each event type and document type first, then write instances from them. Do not hand-write one-off messages in code.

---

## 2. Tier 1: Hard constraints

### WH1. Truthfulness about real-world material

The game puts invented events among real countries. Players MUST never be left unsure what is real.

- The scenario is labeled as simulated at entry, in plain words, stating that events, quotes, and figures are invented unless a source is cited.
- Every in-world document that concerns real states, institutions, or offices carries a visible "simulated" marker in its header.
- No invented direct quotes are attributed to real, named, living individuals. Use offices and roles ("the finance ministry", "a senior adviser"), or invented characters.
- Scenario figures about real places are never presented as real statistics. Real data used as a baseline is marked real with its source and year, and is kept lexically distinct from scenario data ("baseline" versus "scenario").
- No fabricated endorsements, reviews, usage figures, or outside references.
- Claims about how real-world mechanisms work are framed as the game's model where the game simplifies them.

### WH2. Fair and respectful treatment of real actors

- Every real actor of comparable standing gets comparable depth, naming care, and tone. No actor is a default villain or a default victim by authorial habit.
- No stereotypes, caricature, mockery, or loaded terms about nations, peoples, religions, or regions.
- Contested names and territories follow the single convention in `VOICE.md`. They are not decided silently in individual strings.
- Harm is written with gravity. Conflict, hunger, displacement, repression, and economic collapse are never framed as fun, as comic relief, or as a reward.

### WH3. Accessible text

- All meaningful text is real text, never text inside an image.
- The document language is declared, and a passage in another language is marked.
- Instructions never rely on color, shape, or position alone ("press the red button", "see the panel on the right").
- Link and button text makes sense out of context. No bare "click here" or "more".
- Messages announced through live regions are complete sentences that make sense without the surrounding screen.
- No ASCII art or decorative symbol runs that screen readers read aloud as noise.

---

## 3. Tier 2: Required qualities

### W1. One voice, defined first

All copy follows `VOICE.md`. The in-world voice is the voice of the institution the player works inside. It applies to framing, headings, descriptions, event narration, and documents. Every string is checked against the never-say list.

The voice is fully in-world, which includes the interface's own phrasing. W2 limits where that voice may reach.

### W2. Function before flavor

- **Controls say what they do.** A label is a plain verb plus object ("<verb> <object>"). A first-time player can predict the result from the label alone. In-world flavor goes in the surrounding heading or description, not in the label.
- **One verb per action type.** The same action always uses the same verb. Confirm and cancel actions use the same wording in every dialog.
- **Utility controls stay plain.** Settings, save and load, audio, accessibility, help, and exit use plain labels with no in-world renaming.
- **In-world names for concepts must be learnable.** Use them only if they are in the glossary. At first use, pair the in-world term with its plain gloss. After that the term stands alone, with the gloss available on hover and focus.
- **No puns, riddles, or oblique labels** on anything the player must act on.

### W3. Plain language for general players

- Write at the reading-level target, in short sentences, in active voice, with concrete nouns.
- Define every specialist term in context at first use, and link it to the glossary thereafter.
- Spell out an acronym at first use and list it in the glossary. Do not use an acronym that is not in the glossary.
- Every number comes with its unit, and where a bare number would mean nothing to a newcomer, a point of comparison or a direction ("higher is worse").
- **Plain summary for in-world documents.** Documents may use authentic specialist language, but each opens with a one-line summary at the reading-level target that says what it means for the player and what they are asked to decide.

### W4. Terminology and names from the glossary

- One term per concept, taken from `GLOSSARY.md`, in labels, tooltips, event text, documents, and code identifiers.
- Actors use their recorded forms. Never vary a name for elegance.
- Synonym variation for style ("income", "revenue", "receipts" for one quantity) is a defect.

### W5. Event and consequence text

Every event message follows its template and answers four questions in this order:

1. **What happened.** The outcome first, in one sentence.
2. **Why.** The cause, matching the modifier breakdown the player can open (R11 in `DESIGN_STANDARDS.md`).
3. **What changed.** The effects with numbers, including the change since last turn.
4. **What can be done.** The available responses, or a statement that none is needed.

Rules:

- Facts come from the game state through templates with named placeholders. Text MUST NOT describe an outcome the model did not produce, and no number is hand-typed into a message.
- Flavor lines may vary. The facts and their order do not.
- Tense is fixed: past for results, present for current state, imperative for choices.
- Severity levels (information, warning, critical) each have a fixed length and tone. Critical messages are short and direct.
- Frequent events have more than one phrasing for flavor but keep the same structure, so repetition does not make the player skim.
- Text is complete enough to read without the map or panel it refers to.

### W6. In-world documents

- Each document type (cable, briefing, press item, memo, treaty clause, statement) has one template: header, sender, recipient, in-game date, simulated marker, plain summary, body, and any decision requested.
- The register is authentic to the document type and legible. No dense jargon without the plain summary.
- Length limits are set per document type in `VOICE.md`.
- Content is generated from the game state or checked against it. A document never contradicts the numbers on screen.
- Invented people have invented names. Real offices appear as offices (WH1).
- Documents that ask for a decision state the choices in plain words at the end, and these match the controls' labels exactly.

### W7. Interface text conventions

| Element | Pattern |
|---|---|
| Button | Verb plus object, sentence case, no trailing punctuation. Same verb for the same action everywhere. |
| Confirmation | Names the action on the button, not "Yes" or "No". States what will happen and what cannot be undone. |
| Tooltip | First sentence says what it is. Next says how it is computed. Last says what the player can do. The first sentence stands alone. |
| Disabled control | Always shows why it is unavailable and what would enable it. |
| Error | What happened, why if known, and what to do next. No blame. No code without a plain sentence beside it. No generic "something went wrong". |
| Empty state | What belongs here and how to fill it. |
| Onboarding hint | One idea per hint, tied to a step in the first-five-minutes script, dismissable and reopenable. |
| Loading and saving | Says what is happening, and that it worked or failed when it finishes. |
| Number | Unit shown, formatted through `Intl`, never truncated. If space is short, shorten the label or reflow, and keep the full text available to assistive technology. |

Also: sentence case for labels and headings, consistent punctuation, no exclamation marks in interface text unless `VOICE.md` allows them for a named case, no all-caps strings beyond short established abbreviations.

### W8. Length, scannability, and reading level

Front-load the key information. Every text type has a length limit and a reading level target in `VOICE.md`, and each is derived for this game and recorded with its basis. This standard supplies no numbers, because a number that suits one layout, audience, and language fails another, and agents copy numbers literally.

**Length limits.** State each limit in words and in characters. Words track comprehension, and characters track what fits in the layout. Derive them in this order:

1. **Inventory the text types.** List every type: control label, tooltip, event headline, event body, alert by severity, document summary, each document body type, onboarding hint, error, confirmation.
2. **Measure the space.** For each type, find every container where it appears. At the narrowest supported viewport in the brief, at body text size and at 200% text zoom (H3), count how many characters and words fit without truncation, overflow, or hidden text. Take the smallest result across the containers for that type.
3. **Adjust for frequency.** Text the player sees every turn, or many times a session, gets a limit below its space limit. Set it from the interaction budget, the expected exposures per session, and the session length in the brief. Rare, high-stakes text may use more of the available space.
4. **Reserve headroom for translation.** If translation is planned, keep a margin so longer translated strings still fit, and record the margin and why it was chosen. If it is not planned, say so in `VOICE.md`.
5. **Check the limit against required structure.** The limit must leave room for the parts the standard requires: the four parts of event text (W5), the plain summary and decision of a document (W6), the three parts of a tooltip (W7). If a type cannot carry its required parts within its limit, the limit or the type is wrong. Split the text or move detail on demand.
6. **Record the basis.** Each limit in `VOICE.md` carries a one-line basis: the container measured, the frequency assumed, the headroom reserved.
7. **Validate with players.** In the playtest copy check, note where players skip, misread, or abandon text. Revise the limits and log each change in `DESIGN_DECISIONS.md`.

A limit is a test, not a target. Shorter is not better when it makes text cryptic, which breaks W3. A string that must exceed its limit is split, or its detail is moved on demand.

**Reading level.** Derive the target in this order:

1. **Describe the reader.** From the brief, write down in `VOICE.md` the reader's age range, education, language background, familiarity with the subject, and reading context (device, session, time pressure).
2. **Choose and name a measure.** Pick a measure suited to that reader, name it, and state its known limits. Readability formulas based on sentence length and word length are rough proxies for comprehension.
3. **Apply it at the right granularity.** Measure running text such as event bodies, document summaries, and hints. Do not apply it to labels or to the first line of a tooltip, and treat text dominated by proper nouns and glossary terms with caution, because such text scores harder than it reads. For short strings, rely on the cold read test (5.3).
4. **Account for defined terms.** A term defined at first use and in the glossary counts as known afterwards. Note how defined terms affect the measured figure.
5. **Set the target with a basis.** Record the value and why it suits the reader described in step 1.
6. **Hold documents to the plain summary.** In-world documents may exceed the target in their body. Their plain summary (W3) must meet it.
7. **Validate with players.** If players misread text that meets the target, the target or the measure is wrong. Revise it and log the change.

### W9. Text that stays true and can be translated

- Build sentences whole, with named placeholders. Never join fragments in code, because grammar breaks when a value changes.
- Plurals, numbers, dates, lists, and currencies go through `Intl` APIs.
- Keep text out of layout assumptions. Strings can be longer or shorter than the English without breaking the interface.
- Strings that appear in several places come from one source, so one edit changes all instances.

### W10. Tone for consequence

Match the language to the stakes. Routine changes use plain, light phrasing. Events that affect people's welfare use measured, specific language that states the cost without euphemism and without melodrama. Never celebrate the player's success at others' expense in the text. Never hide a cost in vague wording.

---

## 4. Tier 3: Defaults requiring justification

These are not banned. Each use needs an entry in `DESIGN_DECISIONS.md` with a reason. Details are in Appendix A.

- **WJ1. Punctuation as rhythm.** Em dashes and stacked colons used as flourish rather than for syntax.
- **WJ2. Stock rhetorical shapes.** "Not X, but Y" and "It's not X, it's Y" constructions, rhetorical-question headings, rule-of-three lists, "Here's the thing", and dramatic one-sentence paragraphs.
- **WJ3. Marketing vocabulary.** Words that promise instead of saying what happens: powerful, seamless, effortless, unlock, supercharge, transform, intelligent, next-generation.
- **WJ4. Geopolitical cliché.** Chessboard, powder keg, brink, tectonic shifts, perfect storm, delicate balance, complex landscape, high stakes, and similar stock phrases. Also "unprecedented" and "historic" applied to routine events.
- **WJ5. Checkmark and symbol bullets.** Used as a generic positive marker rather than to show an actual state.
- **WJ6. The replacement trap.** Removing one tell and substituting the next most common one is not a justification. A writer who bans "unlock" and then writes "empower" has not changed anything. Each choice must trace to `VOICE.md`.

---

## 5. Verification (before any copy is declared done)

Run every check. Report results, including deviations, in the final message.

### 5.1 Mechanical lint

Search the source for the patterns in Appendix B. Fail items must be fixed. Review items need a fix or a decisions entry.

### 5.2 Label prediction test

For every control label, write down what a first-time player would expect to happen from the label alone. Compare it with the real result. Any mismatch is a defect in the label.

### 5.3 Cold read test

Take each event message, tooltip, and document summary on its own, without the screen around it. State what it means and what the player can do. If this cannot be done, rewrite. Measure running text (event bodies, document summaries, hints) with the measure named in `VOICE.md`, compare it with the target, and report the figure. For short strings, rely on the cold read alone.

### 5.4 Truth and state check

- Compare every event message with the state change it describes. Numbers, directions, and causes must match.
- Check every reference to a real actor against WH1 and WH2, including the simulated markers and the naming convention.
- Confirm every in-world document is consistent with the numbers on screen at the time it appears.

### 5.5 Voice and consistency pass

- Read samples from each text type in a row. They should sound like the same speaker.
- Check against the never-say list.
- Check terms and actor names against `GLOSSARY.md`.
- Check that each action type uses the same verb everywhere.

### 5.6 Conformance report

End each work session with:

1. What copy was written or changed
2. Lint results
3. Label prediction mismatches found and fixed
4. Reading level figures
5. Truth and state check results
6. New `DESIGN_DECISIONS.md` entries and changes to `VOICE.md` or `GLOSSARY.md`
7. Any requirement not met, and why

State plainly that comprehension is verified by proxy only until real general players have read the copy. Add a short copy check to the playtest protocol in `DESIGN_STANDARDS.md` (5.5): ask each player to explain, in their own words, what three event messages and two documents meant.

---

## Appendix A: Catalog of common tells

Presence is not a failure by itself under tier WJ. Absence of a reason is.

**Punctuation and rhythm**
- Em dashes used for drama rather than syntax
- Semicolon and colon runs for effect
- Triplets of adjectives or clauses
- A one-sentence paragraph as a punchline

**Stock constructions**
- "It's not X, it's Y" and "not just X but Y"
- Questions used as headings ("What does this mean for you?")
- "Here's the thing", "Let's be clear", "In a world where"
- Closing lines that restate what was just said

**Vocabulary**
- Marketing verbs: unlock, supercharge, transform, elevate, empower, leverage
- Marketing adjectives: powerful, seamless, effortless, intelligent, revolutionary, next-generation
- Hollow intensifiers: very, truly, deeply, incredibly
- Filler verbs: navigate, delve, underscore, foster, showcase

**Geopolitical cliché**
- Chessboard, powder keg, brink, tipping point, tectonic shift, perfect storm, delicate balance
- "Complex landscape", "high stakes", "uncertain times"
- "Unprecedented" and "historic" for routine events
- Every crisis described as the worst, the biggest, or the first

**Interface**
- "Oops", "Uh-oh", "Something went wrong"
- "Yes" and "No" as the only labels on a consequential dialog
- Exclamation marks as cheerfulness
- Bare "OK" as the only response to news that requires a decision
- Checkmark bullets with no state meaning

**Truth**
- Hand-typed figures in messages
- Invented quotes from named real people
- Real and scenario numbers mixed without labels

---

## Appendix B: Lint patterns

Patterns are regular expressions. Run them over strings in markup, templates, and scripts.

**Fail (must fix)**
- Generic errors and cheerful errors: `Something went wrong`, `\bOops\b`, `Uh-oh`
- Bare vague links and buttons: `>\s*(click here|here|more|ok)\s*<` (case-insensitive)
- Yes and no as the only confirmation labels: `>\s*(yes|no)\s*<` (case-insensitive)
- Instructions relying on sensory characteristics: `(click|press|tap|select) the (red|green|blue|yellow|round|square)`, `the (left|right|top|bottom) (button|panel|menu)`
- Lorem ipsum and placeholder names: `lorem ipsum`, `\bAcme\b`, `John Doe`, `Jane Doe`
- Hand-built sentences from fragments: string concatenation that joins fragments with `+` inside user-facing text, such as `"You have " \+` or `\+ " units"`
- Numbers typed into message strings: digits inside a user-facing string literal that is not a placeholder (review the match, then fix)

**Review (needs a fix or a decisions entry)**
- Em dash or spaced en dash: `—`, ` – `
- Stock constructions: `[Ii]t'?s not .{1,60}, it'?s`, `not just .{1,60} but`, `Here'?s the thing`
- Marketing vocabulary: `\b(powerful|seamless|effortless|unlock|supercharge|transform|intelligent|next-generation|revolutionary|elevate|empower|leverage)\b`
- Geopolitical cliché: `\b(chessboard|powder keg|tipping point|tectonic|perfect storm|delicate balance|complex landscape|high stakes|uncertain times)\b`
- Overused significance words: `\b(unprecedented|historic|landmark|pivotal)\b`
- Exclamation marks in interface strings: `!` inside user-facing strings
- All-caps words in labels: `\b[A-Z]{5,}\b`
- Acronyms not in the glossary: `\b[A-Z]{2,6}\b` compared against `GLOSSARY.md`
- Terms listed under "Avoid" in `GLOSSARY.md`
- Names of real states or leaders in a document with no simulated marker, checked against the actor list
- Direct quotation marks around text attributed to a named real person: review every match against WH1

---

## Appendix C: Templates

### VOICE.md

```md
# Voice

## The speaker
Institution or office the player works inside: <description>
What it is like to work there: <two or three concrete traits>

## The reader and address
Player's in-world role: <role>
Form of address: <"you", title, or other>
Assumed knowledge: <what the player already knows, and does not>

## Register and attitude
<adjective>: <the visible writing consequence>
<adjective>: <the visible writing consequence>
<adjective>: <the visible writing consequence>

## Never say
<phrases, registers, habits>

## Naming conventions
Real states and offices: <convention>
Contested names and territories: <the one rule, applied everywhere>
Invented people: <naming approach>

## Formats
Date: <in-game calendar format, produced through Intl>
Numbers, currency, units: <rules>
Percentages and change: <how deltas are shown>

## Reader description
<age range, education, language background, familiarity with the subject,
device and session context, taken from the brief>

## Reading level
Measure: <named measure and its known limits>
Target: <value>
Basis: <why this target suits the reader described above>
Applies to: <running text types. Short strings use the cold read test>

## Length limits
Derived by the procedure in W8. Record the basis for every row.

| Text type | Words | Characters | Basis (container measured, frequency, headroom) |
|---|---|---|---|
| Control label | | | |
| Tooltip | | | |
| Event headline | | | |
| Event body | | | |
| Alert, by severity | | | |
| Onboarding hint | | | |
| Error | | | |
| Confirmation | | | |
| Document summary | | | |
| Document body (by type) | | | |

## Sample lines
Control label: <>
Tooltip: <>
Event message: <>
Document opening: <>
Error: <>
Confirmation: <>

## Event templates
Type: <event type>
Severity: <information, warning, or critical>
Template: <what happened, with {placeholders}>. <why, with {cause}>. <what changed, with {delta}>. <what can be done>.
Flavor variants allowed: <yes or no, and how many>

## Document templates
Type: <cable, briefing, press item, memo, statement, treaty clause>
Header: <fields>
Simulated marker: <wording and position>
Plain summary: <pattern>
Body: <structure and length>
Decision requested: <how choices are stated, matching control labels>
```

### Additional GLOSSARY.md columns and actor rows

```md
| Term | Definition | In-world term | Plain gloss | Computed from | Symbol | Appears in | Avoid |
|---|---|---|---|---|---|---|---|

| Actor | Full name | Short name | Adjective form | Real or invented | Naming notes |
|---|---|---|---|---|---|
| <actor> | <full name> | <short name> | <adjective> | <real or invented> | <contested names, conventions> |
```

### Scenario entry notice (plain wording pattern)

```md
This is a simulation. The events, quotes, and figures in it are invented unless a source
is shown. It uses real countries to explore decisions, and it does not predict real events.
```

---

## Appendix D: Agent block

Paste into `CLAUDE.md` or `AGENTS.md` alongside the design block. It points to this file rather than duplicating it.

```md
## COPY STANDARD

Follow WRITING_STANDARDS.md for every string the player reads. Summary:

### Process
1. Before writing copy, create VOICE.md and extend GLOSSARY.md with in-world terms,
   plain glosses, and actor forms.
2. Define event and document templates first. Write instances from templates.

### Hard constraints
- The scenario is labeled as simulated. Documents about real actors carry a simulated marker.
- No invented quotes from named real people. Scenario figures are never presented as real.
- Real actors are treated fairly, with one stated convention for contested names.
- Accessible text: real text, no color or position-only instructions, meaningful link text.

### Required in every string
- Clarity beats voice, voice beats variety.
- Controls say what they do with a plain verb and object. Utility controls stay plain.
- General players: reading level target, terms explained at first use, units on numbers,
  and a plain summary at the top of every in-world document.
- Length limits and reading level come from VOICE.md, derived by the procedure in W8.
  Do not assume numbers. If VOICE.md has no derived value for a text type, derive it first.
- One term per concept and one verb per action, from the glossary.
- Event text: what happened, why, what changed, what can be done. Facts come from state
  through templates, never typed by hand.
- Errors, confirmations, disabled controls, and empty states follow the patterns in W7.
- Sentences built whole with placeholders, formatted through Intl.

### Defaults that need a written reason in DESIGN_DECISIONS.md
Em dashes for rhythm, "not X, it's Y" shapes, marketing vocabulary, geopolitical cliché,
generic symbols as bullets. Swapping one tell for the next most common one does not count.

### Before declaring done
Run the lint patterns (Appendix B), the label prediction test, the cold read test, and the
truth and state check, then end with the conformance report (section 5.6). State that
comprehension is verified by proxy only until real players have read the copy.
```

---

## Appendix E: Mapping from the v1 design standard

| v1 rule | Now |
|---|---|
| ST-09 (em dashes as decoration) | WJ1 |
| ST-24 ("It's not X, it's Y") | WJ2 |
| ST-25 (checkmark bullet spam) | WJ5 |
| ST-26 (generic AI marketing language) | WJ3 |

New in this standard: voice sheet and templates (section 1), truthfulness and fair-treatment rules for real-world material (WH1, WH2), function-before-flavor rule (W2), plain-language rules for general players (W3), event text structure (W5), in-world document templates (W6), interface text patterns (W7), geopolitical cliché (WJ4), and copy verification (section 5).
