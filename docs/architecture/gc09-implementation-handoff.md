# GC09 implementation handoff to GC10

GC09 implementation is complete for the repository's supported unified,
four-seat, shared-Facilitator and regional-pair models. GC10 may begin. This is
an implementation handoff, not an overall operational or release-gate pass, and
it does not edit the human-owned prompt status table.

## GC09 acceptance mapping

| GC09 acceptance area | Implemented evidence |
| --- | --- |
| Accurate onboarding for both regional Scribes and the shared Facilitator | Runtime guides, visible text and generated transcripts describe the implemented orientation, proposal, RFI, announcement and ownership flows. Focused guidance regressions passed in the retained user runs. |
| Working shared Facilitator deck/RFI workspace | Shared and paired assignment scopes, real Scribe handoffs, Facilitator-owned RFIs and White Cell flows have retained local and hosted evidence. |
| Distinct regional state | Regional working keys, scoped Notetaker records, deck assignment isolation, reload behavior and exact-key removal cleanup retain separate Asia-Pacific and Europe ownership. Server authorization derives from the authenticated seat. |
| Announcement delivery | Intercom reaches both regional Scribes. Replacement, delayed refresh, autoplay denial and expired/missing current-clip behavior have retained focused evidence. |
| Compatible session guidance | Unified and four-seat behavior remains covered, including the legacy role identifiers and unified uploaded-deck cleanup repair. |
| Runtime deck and media truth | The actual default deck and onboarding text were updated. Browser-local upload distribution and stale/owner-unapproved media remain explicit limitations. |

The demonstrated Notetaker persistence, Intercom callback and unified deck
cleanup defects were repaired, covered by narrow regressions and exercised
against the rehearsal backend. Earlier failed evidence remains unchanged.

## Why GC10 is not blocked

GC10 names three prerequisites: the GC04A identity/model contract, GC05's
unchanged orientation semantics and Blue-orientation dependency, and GC06's
authoritative proposal owner/revision contract. Those contracts are implemented
and covered. GC10 does not require exercise activation, a deployed frontend,
manual accessibility acceptance, approved replacement media, or a hosted
Notetaker move-change race before implementation begins.

The move-change race is useful additional hosted robustness coverage. Its fresh
audit found no active legitimate regional fixture, so it is correctly recorded
as `BLOCKED_NO_LEGITIMATE_FIXTURE`. That blocker applies to that coverage item,
not to GC09 implementation acceptance or GC10's prerequisites.

## Requirements carried forward

- Operational exercise approval and activation.
- Manual keyboard, screen-reader, 200% zoom/mobile and reduced-motion review.
- Deployed-frontend verification and physical media audibility/owner approval.
- Browser-local uploaded-deck distribution and stale narration/image replacement.
- The hosted Notetaker move-change race when a legitimate qualified fixture exists.
- Other broader reconnect, recipient-thread, missed-event, concurrent-submission
  and stale-review coverage already identified in the hosted reports.

These remain visible requirements for later operational or release gates. They
must not be silently declared passed, but they do not require GC09 reimplementation
and do not prevent GC10 work.
