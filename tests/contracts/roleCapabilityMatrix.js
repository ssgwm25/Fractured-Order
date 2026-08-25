const TEAMS = Object.freeze(['blue', 'red', 'green', 'industry']);

const evidence = (layer, file, anchor) => Object.freeze({ layer, file, anchor });

export const ROLE_CAPABILITIES = Object.freeze({
    'entry.public': {
        label: 'Secure participant join, role routing, seat persistence, and reload',
        evidence: [
            evidence('unit', 'src/roles/landing.join.test.js', 'joins successfully by a valid code without listing public session inventory'),
            evidence('e2e', 'tests/e2e/live-demo-role-matrix.e2e.js', 'covers every shipped team and role through join, queue mount, reload persistence')
        ]
    },
    'entry.game_master': {
        label: 'Game Master operator authorization',
        evidence: [
            evidence('unit', 'src/roles/gamemaster.test.js', 'allows access only when the operator grant matches the Game Master surface'),
            evidence('e2e', 'tests/e2e/live-demo-playthrough.e2e.js', 'create the rehearsal session and fill the 18-browser role topology')
        ]
    },
    'entry.white_cell_lead': {
        label: 'White Cell Lead authorization and session scope',
        evidence: [
            evidence('unit', 'src/roles/whitecell.test.js', 'blocks access without a matching operator grant and enforces team/session scope'),
            evidence('e2e', 'tests/e2e/live-demo-role-matrix.e2e.js', 'covers every shipped team and role through join, queue mount, reload persistence')
        ]
    },
    'entry.sme': {
        label: 'SME authorization, role-scoped queue mount, and reload',
        evidence: [
            evidence('unit', 'src/roles/landing.join.test.js', 'authorizes SME with session code + access code (role from button)'),
            evidence('unit', 'src/roles/sme.test.js', 'mounts the %s workflow queue without throwing'),
            evidence('e2e', 'tests/e2e/live-demo-role-matrix.e2e.js', 'covers every shipped team and role through join, queue mount, reload persistence')
        ]
    },
    'scribe.orientation': {
        label: 'Create, validate, edit, and hand off the team-specific Strategic Orientation',
        evidence: [
            evidence('unit', 'src/roles/facilitator.test.js', 'requires every team-specific choice and rejects whitespace-only narratives'),
            evidence('e2e', 'tests/e2e/live-demo-playthrough.e2e.js', 'complete the orientation gate while retaining a returned Blue revision')
        ]
    },
    'scribe.blue_action': {
        label: 'Blue multi-page action drafting, validation, editing, and Facilitator handoff',
        evidence: [
            evidence('unit', 'src/roles/facilitator.test.js', 'forwards Blue drafts to the Facilitator without submitting them to White Cell'),
            evidence('e2e', 'tests/e2e/live-demo-playthrough.e2e.js', 'run Blue and Red action lifecycles through White Cell Lead adjudication')
        ]
    },
    'scribe.red_action': {
        label: 'Red shared multi-page action drafting, validation, editing, and Facilitator handoff',
        evidence: [
            evidence('unit', 'src/roles/facilitator.test.js', 'renders the Red Team action wizard with DIME checkboxes, PRC focus, and no implementation controls'),
            evidence('e2e', 'tests/e2e/live-demo-playthrough.e2e.js', 'run Blue and Red action lifecycles through White Cell Lead adjudication')
        ]
    },
    'scribe.green_proposal': {
        label: 'Green proposal drafting, conditional fields, revision, and Facilitator handoff',
        evidence: [
            evidence('unit', 'src/roles/facilitator.test.js', 'validates partner, sector, and conditional supply-chain proposal choices'),
            evidence('e2e', 'tests/e2e/live-demo-playthrough.e2e.js', 'cover proposal decisions plus independent immutable Blue and Red negotiation threads')
        ]
    },
    'scribe.industry_proposal': {
        label: 'Industry-specific proposal drafting, validation, revision, and Facilitator handoff',
        evidence: [
            evidence('unit', 'src/roles/facilitator.test.js', 'requires and persists the distinct US Industry proposal fields'),
            evidence('e2e', 'tests/e2e/live-demo-playthrough.e2e.js', 'cover proposal decisions plus independent immutable Blue and Red negotiation threads')
        ]
    },
    'scribe.shared_surfaces': {
        label: 'Read-only RFI history, White Cell updates, timeline, journal, and quick capture',
        evidence: [
            evidence('unit', 'src/roles/facilitator.test.js', 'keeps the user-facing Scribe RFI surface read-only on every team route'),
            evidence('unit', 'src/roles/facilitator.test.js', 'builds Tribe Street Journal entries from team capture events only'),
            evidence('e2e', 'tests/e2e/live-demo-playthrough.e2e.js', 'deliver ordered direct communications with exact unread notification behavior')
        ]
    },
    'facilitator.workspaces': {
        label: 'Team Action Review, support Deck, RFIs, Communications, presentation, and restored navigation state',
        evidence: [
            evidence('unit', 'src/roles/scribe.test.js', 'switches among four accessible workspaces and restores the last deck slide'),
            evidence('e2e', 'tests/e2e/live-demo-role-matrix.e2e.js', 'covers every shipped team and role through join, queue mount, reload persistence')
        ]
    },
    'facilitator.finalization': {
        label: 'Review, project, edit, and submit orientations, actions, responses, and proposals to White Cell',
        evidence: [
            evidence('unit', 'src/roles/scribe.test.js', 'submits completed action details from the facilitator to White Cell'),
            evidence('unit', 'src/roles/scribe.test.js', 'submits Strategic Orientation drafts from Facilitator to White Cell'),
            evidence('e2e', 'tests/e2e/live-demo-playthrough.e2e.js', 'run Blue and Red action lifecycles through White Cell Lead adjudication')
        ]
    },
    'facilitator.rfi_communications': {
        label: 'Create, revise, resubmit, and read RFIs plus isolated direct White Cell communications',
        evidence: [
            evidence('unit', 'src/roles/scribe.test.js', 'builds team-scoped Facilitator RFI slides with returned and answered workflow state'),
            evidence('unit', 'src/roles/scribe.test.js', 'keeps Facilitator direct communications scoped to its exact role and White Cell recipients'),
            evidence('e2e', 'tests/e2e/live-demo-playthrough.e2e.js', 'retain the simple RFI answer and add returned-RFI edit, resubmission, and answer history')
        ]
    },
    'facilitator.proposal_threads': {
        label: 'Recipient decisions and isolated append-only multi-round proposal negotiation threads',
        evidence: [
            evidence('unit', 'src/roles/scribe.test.js', 'persists a facilitator negotiation through the shared proposal response contract'),
            evidence('e2e', 'tests/e2e/live-demo-playthrough.e2e.js', 'cover proposal decisions plus independent immutable Blue and Red negotiation threads')
        ]
    },
    'facilitator.alerts': {
        label: 'Durable, deduplicated, focus-managed workflow notifications',
        evidence: [
            evidence('unit', 'src/roles/scribe.test.js', 'moves focus into the alerts dialog without clearing unread'),
            evidence('e2e', 'tests/e2e/live-demo-playthrough.e2e.js', 'deduplicate every inbound notification family across startup and reconnect reconciliation')
        ]
    },
    'notetaker.notes': {
        label: 'Seat-scoped dynamics, alliance tracking, and move notes with autosave',
        evidence: [
            evidence('unit', 'src/roles/notetaker.test.js', 'restores each notetaker seat without overwriting a second seat on the same move'),
            evidence('e2e', 'tests/e2e/live-demo-topology.e2e.js', 'preserve seat-scoped notetaker notes while shared captures append from two concurrent notetakers')
        ]
    },
    'notetaker.capture_review': {
        label: 'Quick captures, White Cell inbox, action review, and session timeline',
        evidence: [
            evidence('unit', 'src/roles/notetaker.test.js', 'renders full facilitator action details in the read-only action view'),
            evidence('unit', 'src/roles/notetaker.test.js', 'ships a dedicated White Cell inbox section on the notetaker surface'),
            evidence('e2e', 'tests/e2e/live-demo-playthrough.e2e.js', 'append observations from all eight Notetakers without cross-team overwrite')
        ]
    },
    'game_master.session_admin': {
        label: 'Create, archive, and retain evidence for sessions',
        evidence: [
            evidence('unit', 'src/roles/gamemaster.test.js', 'explains that session archival closes joins while retaining evidence'),
            evidence('e2e', 'tests/e2e/live-demo-playthrough.e2e.js', 'create the rehearsal session and fill the 18-browser role topology')
        ]
    },
    'game_master.participants': {
        label: 'Monitor, filter, and remove participant seats',
        evidence: [
            evidence('unit', 'src/roles/gamemaster.live.test.js', 'removes multiple selected participants and clears the local roster immediately'),
            evidence('e2e', 'tests/e2e/live-demo-role-matrix.e2e.js', 'operator roster visibility')
        ]
    },
    'game_master.exports_plugins': {
        label: 'Legacy/research exports and session-scoped plugin lifecycle',
        evidence: [
            evidence('unit', 'src/roles/gamemaster.live.test.js', 'wires each live export button to the matching legacy or research action'),
            evidence('unit', 'src/roles/gamemaster.test.js', 'mounts and tears down the registered Intercom plugin'),
            evidence('e2e', 'tests/e2e/live-demo-playthrough.e2e.js', 'export and reconcile workflow, revision, recipient-thread, notification, and RFI evidence')
        ]
    },
    'white_cell.controls': {
        label: 'Strategic Orientation gate, mark allocations, timer, move, and phase controls',
        evidence: [
            evidence('unit', 'src/roles/whitecell.test.js', 'gates Move 1 controls until all Strategic Orientation artifacts reach White Cell'),
            evidence('unit', 'src/roles/whitecell.test.js', 'saves White Cell timer allocations as seconds for each game-state mark'),
            evidence('e2e', 'tests/e2e/live-demo-playthrough.e2e.js', 'operate allocations, timer reset, and reversible move and phase progression from White Cell Lead controls')
        ]
    },
    'white_cell.review': {
        label: 'Orientation, action, response, proposal, return/revision, and completion review',
        evidence: [
            evidence('unit', 'src/roles/whitecell.test.js', 'returns Strategic Orientation to its submitting team and requires notes'),
            evidence('unit', 'src/roles/whitecell.test.js', 'forwards a proposal to its intended partner when White Cell selects forward'),
            evidence('e2e', 'tests/e2e/live-demo-playthrough.e2e.js', 'return, edit, and resubmit separate Blue and Red actions')
        ]
    },
    'white_cell.rfi_communications': {
        label: 'RFI answer/return, direct and broadcast communication, journal, and timeline',
        evidence: [
            evidence('unit', 'src/roles/whitecell.test.js', 'separates the actionable RFI queue from revision-aware history'),
            evidence('unit', 'src/roles/whitecell.test.js', 'sends Tribe Street Journal updates with explicit recipient metadata'),
            evidence('e2e', 'tests/e2e/live-demo-playthrough.e2e.js', 'retain the simple RFI answer and add returned-RFI edit, resubmission, and answer history')
        ]
    },
    'white_cell.admin_exports': {
        label: 'Participant/session administration, deck assignment, plugins, and evidence exports',
        evidence: [
            evidence('unit', 'src/roles/whitecell.test.js', 'loads a validated deck into the requested team facilitator seat'),
            evidence('unit', 'src/roles/whitecell.test.js', 'persists plugin toggles through game state and updates the panel immediately'),
            evidence('unit', 'src/roles/whitecell.test.js', 'exports the research archive from the fetched research bundle'),
            evidence('e2e', 'tests/e2e/live-demo-playthrough.e2e.js', 'export and reconcile workflow, revision, recipient-thread, notification, and RFI evidence')
        ]
    },
    'white_cell.pli_readonly': {
        label: 'Read-only PLI, SME result visibility, and SME vs engine efficacy',
        evidence: [
            evidence('unit', 'src/roles/whitecell.pli.test.js', 'mounts PLI review panels and the report panel as Lead-readonly'),
            evidence('unit', 'src/services/database.pli.test.js', 'blocks White Cell from reviewing PLI seats'),
            evidence('unit', 'src/features/pli/pliSmeEdits.test.js', 'summarizes session efficacy from seat_reviews')
        ]
    },
    'sme.macro': {
        label: 'Econ SME Macro approve, override, send-back, and finalization gate',
        evidence: [
            evidence('unit', 'src/roles/sme.test.js', 'sme_econ'),
            evidence('unit', 'src/services/database.pli.test.js', 'allows only the matching SME role to review a PLI seat'),
            evidence('unit', 'src/services/database.pli.test.js', 'rejects override without rationale before network I/O'),
            evidence('unit', 'src/features/pli/pliSmeEdits.test.js', 'records field-level macro diffs')
        ]
    },
    'sme.ni_escalation': {
        label: 'NI/Escalation review after Macro unlock, approve/override/send-back, and NI evidence rendering',
        evidence: [
            evidence('unit', 'src/roles/sme.test.js', 'sme_ni_escalation'),
            evidence('unit', 'src/features/pli/NiEscalationReview.test.js', 'renders numbered NI score with narrative'),
            evidence('unit', 'src/services/database.pli.test.js', 'resolves Glasl stage_after from NI override or track record'),
            evidence('unit', 'src/features/pli/pliSmeEdits.test.js', 'collects NI domain and Glasl stage edits')
        ]
    },
    'sme.diplomacy_information': {
        label: 'Diplomacy & Information review after Macro unlock with approve/override/send-back',
        evidence: [
            evidence('unit', 'src/roles/sme.test.js', 'sme_diplomacy_information'),
            evidence('unit', 'src/services/database.pli.test.js', 'allows only the matching SME role to review a PLI seat'),
            evidence('unit', 'src/features/pli/pliSmeEdits.test.js', 'collects Diplomacy taxonomy and Information brief section edits')
        ]
    },
    'sme.tsj': {
        label: 'TSJ action-narrative handoffs plus Approved PLI copy packets after seat finalize',
        evidence: [
            evidence('unit', 'src/roles/sme.test.js', 'sme_tsj'),
            evidence('unit', 'src/services/database.pli.test.js', 'gates handoff ack to matching TSJ / Verba SME roles'),
            evidence('unit', 'src/features/pli/pliSmeEdits.test.js', 'builds TSJ markdown and Verba JSON packets from finalized seats only')
        ]
    },
    'sme.verba': {
        label: 'Verba AI action-narrative handoffs plus Approved PLI copy packets after seat finalize',
        evidence: [
            evidence('unit', 'src/roles/sme.test.js', 'sme_verba'),
            evidence('unit', 'src/services/database.pli.test.js', 'gates handoff ack to matching TSJ / Verba SME roles'),
            evidence('unit', 'src/features/pli/pliSmeEdits.test.js', 'builds TSJ markdown and Verba JSON packets from finalized seats only')
        ]
    }
});

const TEAM_ROLE_CAPABILITIES = Object.freeze({
    scribe: ['entry.public', 'scribe.orientation', 'scribe.shared_surfaces'],
    facilitator: [
        'entry.public',
        'facilitator.workspaces',
        'facilitator.finalization',
        'facilitator.rfi_communications',
        'facilitator.proposal_threads',
        'facilitator.alerts'
    ],
    notetaker: ['entry.public', 'notetaker.notes', 'notetaker.capture_review']
});

const TEAM_SPECIFIC_SCRIBE_CAPABILITY = Object.freeze({
    blue: 'scribe.blue_action',
    red: 'scribe.red_action',
    green: 'scribe.green_proposal',
    industry: 'scribe.industry_proposal'
});

export const SHIPPED_ROLE_PROFILES = Object.freeze([
    ...TEAMS.flatMap((team) => Object.entries(TEAM_ROLE_CAPABILITIES).map(([role, capabilityIds]) => ({
        id: `${team}.${role}`,
        team,
        role,
        entry: 'public',
        capabilityIds: role === 'scribe'
            ? [...capabilityIds, TEAM_SPECIFIC_SCRIBE_CAPABILITY[team]]
            : [...capabilityIds]
    }))),
    {
        id: 'operator.game_master',
        role: 'game_master',
        entry: 'operator',
        capabilityIds: ['entry.game_master', 'game_master.session_admin', 'game_master.participants', 'game_master.exports_plugins']
    },
    {
        id: 'operator.white_cell_lead',
        role: 'white_cell_lead',
        entry: 'operator',
        capabilityIds: [
            'entry.white_cell_lead',
            'white_cell.controls',
            'white_cell.review',
            'white_cell.rfi_communications',
            'white_cell.admin_exports',
            'white_cell.pli_readonly'
        ]
    },
    ...[
        ['econ', 'sme.macro'],
        ['ni_escalation', 'sme.ni_escalation'],
        ['diplomacy_information', 'sme.diplomacy_information'],
        ['tsj', 'sme.tsj'],
        ['verba', 'sme.verba']
    ].map(([role, roleCapability]) => ({
        id: `sme.${role}`,
        role,
        entry: 'sme',
        capabilityIds: ['entry.sme', roleCapability]
    }))
]);

export const NON_ENTRY_ROLE_STATES = Object.freeze([
    {
        id: 'whitecell_support',
        reason: 'Compatibility and policy state only; the shipped landing page exposes White Cell Lead, not Support.'
    },
    {
        id: 'viewer',
        reason: 'Passive compatibility route only; Observer is not a public participant join option in the shipped landing flow.'
    }
]);

export const ROLE_MATRIX_TEAMS = TEAMS;
