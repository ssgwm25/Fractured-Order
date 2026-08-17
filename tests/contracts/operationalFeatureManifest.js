const evidence = (layer, file, anchor) => Object.freeze({ layer, file, anchor });

export const OPERATIONAL_SCOPE_EXCLUSIONS = Object.freeze([
    Object.freeze({
        id: 'pli.adjudication',
        reason: 'Explicitly excluded by the requested rehearsal scope: no PLI pipeline or adjudication execution.'
    }),
    Object.freeze({
        id: 'pli.sme_reviews',
        reason: 'Explicitly excluded: no Econ, NI/Escalation, or Diplomacy/Information PLI review procedures.'
    }),
    Object.freeze({
        id: 'pli.external_handoffs',
        reason: 'Explicitly excluded: no TSJ or Verba PLI handoff procedure.'
    }),
    Object.freeze({
        id: 'pli.reports',
        reason: 'Explicitly excluded: no PLI report surface or PLI-derived export assertions.'
    })
]);

export const SHIPPED_NON_PLI_OPERATIONAL_FEATURES = Object.freeze({
    'identity.session_topology': {
        label: 'Session creation, authorization, role routing, seat limits, persistence, logout, and recovery',
        evidence: [
            evidence('unit', 'src/roles/landing.join.test.js', 'joins successfully by a valid code without listing public session inventory'),
            evidence('e2e', 'tests/e2e/live-demo-topology.e2e.js', 'one-team topology covers operator session creation, onboarding, White Cell access, the dedicated facilitator deck, and seat contention'),
            evidence('e2e', 'tests/e2e/live-demo-playthrough.e2e.js', 'create the rehearsal session and fill the 18-browser role topology')
        ]
    },
    'team.strategic_orientation': {
        label: 'All four Strategic Orientation forms, handoff, gate, return, edit, resubmit, and completion',
        evidence: [
            evidence('unit', 'src/roles/facilitator.test.js', 'requires every team-specific choice and rejects whitespace-only narratives'),
            evidence('e2e', 'tests/e2e/live-demo-playthrough.e2e.js', 'complete the orientation gate while retaining a returned Blue revision and outcome-free completion')
        ]
    },
    'team.artifact_authoring': {
        label: 'Blue and Red actions, Green proposals, Industry proposals, validation, drafts, edit, and handoff',
        evidence: [
            evidence('unit', 'src/roles/facilitator.test.js', 'requires and persists the distinct US Industry proposal fields'),
            evidence('unit', 'src/roles/facilitator.test.js', 'validates partner, sector, and conditional supply-chain proposal choices'),
            evidence('e2e', 'tests/e2e/live-demo-playthrough.e2e.js', 'run Blue and Red action lifecycles through White Cell Lead adjudication'),
            evidence('e2e', 'tests/e2e/live-demo-playthrough.e2e.js', 'cover proposal decisions plus independent immutable Blue and Red negotiation threads')
        ]
    },
    'facilitator.presentation_decks': {
        label: 'Action Review, projection, support decks, deck assignment, workspace navigation, and restored state',
        evidence: [
            evidence('unit', 'src/roles/scribe.test.js', 'switches among four accessible workspaces and restores the last deck slide'),
            evidence('unit', 'src/roles/whitecell.test.js', 'loads a validated deck into the requested team facilitator seat through shared communications'),
            evidence('e2e', 'tests/e2e/live-demo-topology.e2e.js', 'verify the dedicated facilitator deck and complete the Scribe-to-Facilitator-to-White Cell workflow'),
            evidence('e2e', 'tests/e2e/live-demo-operator-controls.e2e.js', 'load a real facilitator deck and persist both plugin enablements across reload')
        ]
    },
    'white_cell.artifact_review': {
        label: 'Cross-team queues, source labels, complete/return decisions, revision history, stale-write protection, and outcome-free completion',
        evidence: [
            evidence('unit', 'src/roles/whitecell.test.js', 'rejects a stale review revision without closing the modal or changing local state'),
            evidence('unit', 'src/roles/whitecell.test.js', 'accepts an action as complete without assigning an outcome'),
            evidence('e2e', 'tests/e2e/live-demo-playthrough.e2e.js', 'return, edit, and resubmit separate Blue and Red actions without weakening normal completion')
        ]
    },
    'proposals.recipient_threads': {
        label: 'Independent recipient approval, isolation, immutable multi-round negotiation, notification, and close history',
        evidence: [
            evidence('unit', 'src/roles/scribe.test.js', 'persists a facilitator negotiation through the shared proposal response contract'),
            evidence('integration', 'src/services/supabaseMock.test.js', 'mirrors independent recipient approvals and append-only isolated proposal rounds'),
            evidence('e2e', 'tests/e2e/live-demo-playthrough.e2e.js', 'cover proposal decisions plus independent immutable Blue and Red negotiation threads')
        ]
    },
    'rfi.lifecycle': {
        label: 'Team-scoped creation, category history, return, edit, resubmit, immutable answer, and stale-response protection',
        evidence: [
            evidence('unit', 'src/roles/whitecell.test.js', 'separates the actionable RFI queue from revision-aware history without priority UI'),
            evidence('unit', 'src/roles/whitecell.test.js', 'refreshes and removes a stale RFI when completion wins the response race'),
            evidence('e2e', 'tests/e2e/live-demo-playthrough.e2e.js', 'retain the simple RFI answer and add returned-RFI edit, resubmission, and answer history')
        ]
    },
    'communications.notifications_realtime': {
        label: 'Direct/broadcast communications, updates, durable alerts, unread behavior, realtime fanout, outage, reconciliation, dedupe, and isolation',
        evidence: [
            evidence('unit', 'src/roles/scribe.test.js', 'keeps Facilitator direct communications scoped to its exact role and White Cell recipients'),
            evidence('e2e', 'tests/e2e/live-demo-playthrough.e2e.js', 'deduplicate every inbound notification family across startup and reconnect reconciliation'),
            evidence('e2e', 'tests/e2e/live-demo-realtime.e2e.js', 'fanout, outage recovery, reconciliation, and isolation stay correct')
        ]
    },
    'notetaker.operational_record': {
        label: 'Two-seat notes, dynamics, alliances, quick captures, inbox, action/timeline review, autosave, concurrency, and isolation',
        evidence: [
            evidence('unit', 'src/roles/notetaker.test.js', 'restores each notetaker seat without overwriting a second seat on the same move'),
            evidence('e2e', 'tests/e2e/live-demo-topology.e2e.js', 'preserve seat-scoped notetaker notes while shared captures append from two concurrent notetakers and survive logout'),
            evidence('e2e', 'tests/e2e/live-demo-playthrough.e2e.js', 'append observations from all eight Notetakers without cross-team overwrite')
        ]
    },
    'white_cell.game_controls': {
        label: 'Orientation gate, per-mark allocations, timer start/pause/reset, and reversible move/phase progression',
        evidence: [
            evidence('unit', 'src/roles/whitecell.test.js', 'gates Move 1 controls until all Strategic Orientation artifacts reach White Cell'),
            evidence('unit', 'src/roles/whitecell.test.js', 'saves White Cell timer allocations as seconds for each game-state mark'),
            evidence('e2e', 'tests/e2e/live-demo-playthrough.e2e.js', 'operate allocations, timer reset, and reversible move and phase progression from White Cell Lead controls')
        ]
    },
    'plugins.intercom_recorder': {
        label: 'Plugin enable/disable persistence, Intercom record/send, recorder start/pause/resume/stop/download/reset, and participant notice',
        evidence: [
            evidence('unit', 'src/features/plugins/intercom.test.js', 'routes small clips inline and larger clips through storage'),
            evidence('unit', 'src/features/plugins/sessionRecorder.test.js', 'persists, returns, and removes session recording artifact metadata by session'),
            evidence('e2e', 'tests/e2e/live-demo-operator-controls.e2e.js', 'record and send Intercom audio, then run the recorder lifecycle with participant notices and file download')
        ]
    },
    'operator.participant_session_admin': {
        label: 'Participant roster filters, bulk removal, session creation/archive/deletion, join closure, and retained audit evidence',
        evidence: [
            evidence('unit', 'src/roles/gamemaster.live.test.js', 'removes multiple selected participants and clears the local roster immediately'),
            evidence('unit', 'src/roles/whitecell.test.js', 'filters White Cell participants by session, team, and role plus timeline event filters'),
            evidence('e2e', 'tests/e2e/live-demo-operator-controls.e2e.js', 'filter and bulk-remove seats, archive and delete the session, reject rejoin, and retain audit evidence')
        ]
    },
    'exports.evidence_bundle': {
        label: 'JSON, all CSVs, research ZIP, print report, recording references, reconciliation, and cross-session ZIP from operator surfaces',
        evidence: [
            evidence('unit', 'src/features/export/researchExport.test.js', 'builds the full research archive dataset with the 1.9.0 workflow-evidence file set'),
            evidence('unit', 'src/roles/gamemaster.live.test.js', 'wires each live export button to the matching legacy or research action'),
            evidence('e2e', 'tests/e2e/live-demo-playthrough.e2e.js', 'export and reconcile workflow, revision, recipient-thread, notification, and RFI evidence'),
            evidence('e2e', 'tests/e2e/live-demo-operator-controls.e2e.js', 'exercise every legacy export plus research archive, print, recording references, and cross-session archive')
        ]
    },
    'resilience.scale_degraded_sync': {
        label: 'Large-session bounded rendering plus realtime outage and deterministic reconciliation behavior',
        evidence: [
            evidence('unit', 'src/roles/whitecell.test.js', 'bounds the pending RFI queue for large exercise datasets'),
            evidence('e2e', 'tests/e2e/live-demo-scale.e2e.js', 'larger exercise seeded records keep operator and team views usable'),
            evidence('e2e', 'tests/e2e/live-demo-realtime.e2e.js', 'surface an outage, reconcile the missed message, and avoid duplicate alerts')
        ]
    },
    'quality.accessibility_mobile_ui': {
        label: 'Shared tokens, semantic controls, keyboard-operable workspaces, modal focus, 390px layout, empty/error/retry states, and document integrity',
        evidence: [
            evidence('unit', 'src/features/onboarding/followAlong.test.js', 'collapses instead of removing the guide when the final step is done'),
            evidence('unit', 'src/roles/scribe.test.js', 'moves focus into the alerts dialog without clearing unread'),
            evidence('e2e', 'tests/e2e/live-demo-playthrough.e2e.js', 'enforce a shared UI shell, token, and document-integrity contract across every role')
        ]
    }
});
