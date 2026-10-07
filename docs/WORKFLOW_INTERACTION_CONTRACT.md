# Workflow interaction contract

This document is the product authority for unsaved changes and time language in
Fractured Order. It applies to every role surface and supersedes copy that
implies an unimplemented cutoff.

## Time and submission

Fractured Order has operator-controlled pacing timers. It does not implement a
submission deadline, late state, grace period, or server cutoff. The timer is
informational: reaching zero does not submit, reject, lock, label, or otherwise
change an artifact. Only explicit workflow actions and server-enforced move,
phase, role, revision, and completeness rules change records.

UI and onboarding copy must say `timer`, `review window`, `when ready`, or
`before handoff` only when those words describe the actual interaction. It must
not promise a deadline, due date, late penalty, or grace period. A future
deadline feature requires a separately approved server-time model, atomic
cutoff enforcement, exact-boundary tests, and updated glossary and component
entries before any deadline copy ships.

## Unsaved changes

A protected form starts clean. The first user `input` or `change` event marks
it dirty. Programmatic hydration, realtime reconciliation, and opening a form do
not. A successful persisted write closes or marks the form clean. Validation
failure, authorization failure, timeout, rejected write, or lost response leaves
the form open and dirty; the UI must never imply that such a write was saved.
Failed saves leave the form open and dirty, with the attempted values intact.

Every user-driven exit uses the same decision:

| Exit | Dirty behavior |
| --- | --- |
| Cancel button | Ask whether to discard; retaining edits keeps the form open. |
| `Escape` | Same decision as Cancel. |
| Modal close button | Same decision as Cancel. |
| Modal backdrop | Same decision as Cancel. |
| Browser navigation (in-app section or browser back/forward) | Ask once; retaining edits restores the current section. |
| Reload, tab close, or external browser navigation | Use the browser-native unsaved-change prompt. Browser-controlled wording is not a product promise. |
| Role/session switching (logout, disconnect, role change, or session change) | Confirm the seat-release action, then use the same discard decision; retaining edits cancels the release. |

The discard question is: `You have unsaved changes. Discard them and leave this
form?` The choices are the browser's conventional retain/cancel and discard/
leave actions. After a modal closes, focus returns to its trigger.

Notetaker fields with an explicit autosave status follow their documented
autosave contract and are outside modal dirty tracking. A security event such as
seat revocation or authorization loss clears protected content immediately;
unsaved work cannot keep unauthorized private data mounted.

The implementation source is `src/core/unsavedChanges.js`. Modal exit paths are
centralized in `src/components/ui/Modal.js`; shared navigation and seat release
are wired in `src/main.js`.

## Verification

Focused tests must prove:

- Cancel, `Escape`, close-button, and backdrop exits retain a dirty form when
  discard is declined and close it only after confirmation;
- reload/tab close arms the native prompt only while dirty;
- in-app navigation and role/session release do not proceed when edits are
  retained;
- successful saves clear the guard, while validation or write failures do not.
