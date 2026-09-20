import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getRoleRoute, getSemanticRoleSurface, parseTeamRole, SME_ROLES } from '../../src/core/teamContext.js';
import { getRoleLimit } from '../../src/core/config.js';
import { PROPOSAL_ORIGINATORS } from '../../src/features/actions/proposalDetails.js';
import { STRATEGIC_ORIENTATION_FORECAST_TARGETS } from '../../src/features/actions/strategicOrientationDetails.js';

const repositoryUrl = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, repositoryUrl), 'utf8');
const contract = JSON.parse(read('docs/architecture/green-regional-contract.json'));
const document = read('docs/architecture/green-regional-contract.md');
const allSeats = [...contract.regional_seats, ...contract.legacy_seats, ...contract.shared_seats];

function permission(profile, capability) {
    const index = contract.permission_columns.indexOf(capability);
    expect(index, `Unknown capability: ${capability}`).toBeGreaterThanOrEqual(0);
    return contract.permission_matrix[profile][index];
}

// These audit the proposed specification and existing compatibility adapters.
// They do not execute proposed permissions or constitute regional RLS evidence.
describe('GC-01 regional Green specification', () => {
    it('preserves the original paired model with one Facilitator, Scribe and existing Notetaker per region', () => {
        expect(contract.parent_team).toBe('green');
        expect(contract.authority).toBe('authenticated_active_session_seat');
        expect(contract.delegations.map(({ id }) => id)).toEqual(['asian_pacific', 'europe']);
        expect(contract.regional_seats).toHaveLength(6);
        expect(new Set(allSeats.map(({ role }) => role)).size).toBe(allSeats.length);
        for (const { id } of contract.delegations) {
            const seats = contract.regional_seats.filter((seat) => seat.delegation_id === id);
            expect(seats.map(({ semantic_role }) => semantic_role).sort()).toEqual(['facilitator', 'notetaker', 'scribe']);
            for (const seat of seats) {
                expect(seat.capacity).toBe(1);
                expect(seat.role).toBe(`green_${id}_${seat.semantic_role}`);
                expect(seat.permission_profile).toBe(`regional_${seat.semantic_role}`);
            }
        }
        const noteCapacity = contract.regional_seats
            .filter(({ semantic_role }) => semantic_role === 'notetaker')
            .reduce((total, { capacity }) => total + capacity, 0);
        expect(noteCapacity).toBe(2);
        expect(noteCapacity).toBe(getRoleLimit('green_notetaker'));
        expect(contract.regional_seats.reduce((sum, seat) => sum + seat.capacity, 0)
            - contract.legacy_seats.reduce((sum, seat) => sum + seat.capacity, 0)).toBe(2);
    });

    it('maps semantic regional roles to existing pages without changing legacy inversion', () => {
        const pages = { facilitator: 'scribe', scribe: 'facilitator', notetaker: 'notetaker' };
        for (const seat of contract.regional_seats) {
            expect(seat.route).toBe(`teams/green/${pages[seat.semantic_role]}.html?delegation=${seat.delegation_id}`);
            expect(existsSync(new URL(seat.route.split('?')[0], repositoryUrl))).toBe(true);
        }
        for (const seat of contract.legacy_seats) {
            expect(seat.delegation_id).toBeNull();
            expect(getSemanticRoleSurface(parseTeamRole(seat.role).surface)).toBe(seat.semantic_role);
            expect(getRoleRoute(seat.role, { basePath: '/' })).toBe(`/${seat.route}`);
            expect(getRoleLimit(seat.role)).toBe(seat.capacity);
        }
    });

    it('defines four unified and five regional orientation subjects with stable Red forecast links', () => {
        expect(contract.topologies.unified_green).toEqual({
            session_topology_version: 1, required_orientations: ['blue', 'green', 'red', 'industry']
        });
        expect(contract.topologies.regional_green).toEqual({
            session_topology_version: 2,
            required_orientations: ['blue', 'green:asian_pacific', 'green:europe', 'red', 'industry']
        });
        for (const delegation of contract.delegations) {
            expect(STRATEGIC_ORIENTATION_FORECAST_TARGETS.map(({ key }) => key)).toContain(delegation.forecast_target);
            expect(delegation.forecast_target).toBe(`green_${delegation.id}`);
        }
    });

    it('retains the original conflicting roster evidence without rewriting the briefing', () => {
        const [form, briefing] = contract.roster.candidates;
        expect(contract.roster.candidates).toHaveLength(2);
        expect([...form.asian_pacific, ...form.europe].sort()).toEqual([...PROPOSAL_ORIGINATORS].sort());
        expect(form.asian_pacific).toEqual(['ROK', 'ASEAN', 'Japan']);
        expect(form.europe).toEqual(['EU', 'France', 'UK']);
        expect(briefing.asian_pacific).toEqual(['Australia', 'Japan', 'Republic of Korea']);
        expect(briefing.europe).toEqual(['European Union', 'Germany', 'United Kingdom']);
        const slide = read(briefing.source).match(/<section\b[^>]*data-n="11"[\s\S]*?<\/section>/)?.[0];
        expect(slide).toBeTruthy();
        for (const entity of [...briefing.asian_pacific, ...briefing.europe]) {
            expect(slide).toContain(`<li>${entity}</li>`);
        }
    });

    it('pins the explicitly approved regional roster with supplied session-bound validation and no membership expansion', () => {
        expect(contract.roster.status).toBe('approved');
        expect(contract.roster.approved_version).toBe('green-roster-v1');
        expect(contract.roster.approval_source).toBe('Explicit user instruction in this conversation');
        expect(contract.roster.approval_date).toBe('2026-09-20');
        expect(contract.roster.approved_members).toEqual({
            asian_pacific: ['ROK', 'Japan', 'ASEAN'], europe: ['UK', 'France', 'EU']
        });
        expect(contract.roster.approved_labels).toEqual({
            ROK: 'South Korea', Japan: 'Japan', ASEAN: 'ASEAN', UK: 'UK', France: 'France', EU: 'EU'
        });
        expect(contract.roster.aliases).toEqual({ 'South Korea': 'ROK' });
        expect(Object.values(contract.roster.approved_members).flat().sort())
            .toEqual([...PROPOSAL_ORIGINATORS].sort());
        expect(contract.roster.membership_validation_enabled).toBe(true);
        expect(contract.status).toBe('proposed_not_activated');
        expect(document).toContain('green-roster-v1');
    });

    it('keeps regional drafting, submission, private threads and notes in separate capabilities', () => {
        expect(permission('regional_scribe', 'submit_artifacts')).toBe('no');
        expect(permission('regional_scribe', 'rfis')).toBe('read_own');
        expect(permission('regional_scribe', 'proposal_threads')).toBe('read_own');
        expect(permission('regional_facilitator', 'submit_artifacts')).toBe('own');
        expect(permission('regional_facilitator', 'rfis')).toBe('manage_own');
        expect(permission('regional_facilitator', 'proposal_threads')).toBe('append_own');
        expect(permission('regional_notetaker', 'notes')).toBe('own_seat');
        expect(permission('regional_notetaker', 'edit_artifacts')).toBe('no');
        expect(permission('regional_notetaker', 'proposal_threads')).toBe('no');
        for (const seat of contract.regional_seats) {
            expect(permission(seat.permission_profile, 'review_or_control')).toBe('no');
            expect(contract.permission_matrix[seat.permission_profile].some((value) => /both|legacy/.test(value))).toBe(false);
        }
    });

    it('covers all operator and SME identities without granting participant decision powers', () => {
        expect(contract.other_roles.map(({ role }) => role).sort()).toEqual([
            'whitecell_lead', 'whitecell_support', 'white', 'viewer',
            ...Object.values(SME_ROLES).map((role) => `sme_${role}`)
        ].sort());
        for (const { permission_profile: profile } of contract.other_roles) {
            expect(permission(profile, 'edit_artifacts')).toBe('no');
            expect(permission(profile, 'submit_artifacts')).toBe('no');
        }
        expect(permission('white_cell', 'review_or_control')).toBe('white_cell');
        expect(permission('sme_review', 'review_or_control')).toBe('matching_pli_seat');
        expect(permission('sme_handoff', 'review_or_control')).toBe('matching_ack');
        expect(permission('observer', 'review_or_control')).toBe('no');
    });

    it('keeps the architecture identity and permission tables synchronized with the fixture', () => {
        expect(document).toContain(`Contract version **${contract.contract_version}**`);
        const tableRows = document.split(/\r?\n/).filter((line) => line.startsWith('| '));
        for (const seat of allSeats) {
            const topology = seat.delegation_id === null && seat.role !== 'green_shared_facilitator' ? 1 : 2;
            expect(tableRows).toContain(`| ${topology} | \`${seat.role}\` | ${seat.semantic_role} | ${seat.delegation_id} | ${seat.capacity} | \`${seat.route}\` | ${seat.permission_profile} |`);
        }
        for (const role of contract.other_roles) {
            expect(tableRows.some((row) => row.startsWith(`| \`${role.role}\` | \`${role.route}\` | ${role.permission_profile} |`))).toBe(true);
        }
        const profiles = new Set([
            ...[...allSeats, ...contract.other_roles].map(({ permission_profile }) => permission_profile),
            ...contract.historical_permission_profiles
        ]);
        expect([...profiles].sort()).toEqual(Object.keys(contract.permission_matrix).sort());
        expect(tableRows).toContain(`| Profile | ${contract.permission_columns.join(' | ')} |`);
        for (const [profile, permissions] of Object.entries(contract.permission_matrix)) {
            expect(permissions).toHaveLength(contract.permission_columns.length);
            expect(tableRows).toContain(`| ${profile} | ${permissions.join(' | ')} |`);
        }
    });

    it('links the actual architecture and source files without presenting the contract as activated', () => {
        expect(contract.status).toBe('proposed_not_activated');
        expect(read('docs/green-cell-regional-split-prompt-book.md'))
            .toContain('(architecture/green-regional-contract.md)');
        for (const candidate of contract.roster.candidates) {
            expect(existsSync(new URL(candidate.source, repositoryUrl))).toBe(true);
        }
        for (const [, relativePath] of document.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
            expect(existsSync(new URL(relativePath, new URL('docs/architecture/green-regional-contract.md', repositoryUrl))), relativePath).toBe(true);
        }
    });
    it('pins the new three-seat model independently of the five-submission gate and old evidence', () => {
        const model = contract.seat_models.shared_facilitator_v1;
        expect(model.session_topology_version).toBe(2);
        expect(model.operational_roles).toEqual(['green_asian_pacific_scribe', 'green_europe_scribe', 'green_shared_facilitator']);
        expect(model.notetaker_roles).toHaveLength(2);
        expect(contract.shared_seats).toHaveLength(1);
        expect(contract.shared_seats[0]).toMatchObject({ capacity: 1, delegation_id: null, semantic_role: 'facilitator', route: 'teams/green/scribe.html' });
        expect(permission('shared_facilitator_foundation', 'submit_artifacts')).toBe('no');
        expect(permission('shared_facilitator_foundation', 'proposal_threads')).toBe('no');
        expect(model.deferred_mutations).toEqual(['GC-07']);
        expect(model.permission_stage).toBe('GC-06-proposals');
        expect(permission('shared_facilitator_orientations', 'submit_artifacts')).toBe('orientation_handoff_revision_only');
        expect(permission('shared_facilitator_proposals', 'proposal_threads')).toBe('approved_current_revision_threads');
        expect(permission('shared_facilitator_proposals', 'rfis')).toBe('no');
        expect(permission('shared_facilitator_proposals', 'notes')).toBe('no');
        expect(contract.topologies.regional_green.required_orientations).toHaveLength(5);
    });
});
