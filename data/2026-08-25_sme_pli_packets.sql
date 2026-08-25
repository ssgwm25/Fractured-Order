-- SME-approved PLI copy packets for TSJ / Verba
--
-- Purpose:
-- Persist copy-ready PLI payloads for Tribe Street Journal and Verba SMEs
-- after Econ / NI / Dip-Info finalize a seat. Distinct from sme_handoffs,
-- which remain the White Cell action-complete narrative queues.
--
-- Depends on: 2026-07-17_pli_adjudications.sql, 2026-07-20_sme_handoffs.sql
-- Safe to reapply: CREATE IF NOT EXISTS + DROP POLICY IF EXISTS.

BEGIN;

CREATE TABLE IF NOT EXISTS public.sme_pli_packets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    adjudication_id UUID NOT NULL REFERENCES public.pli_adjudications(id) ON DELETE CASCADE,
    action_id UUID REFERENCES public.actions(id) ON DELETE SET NULL,
    pli_seat TEXT NOT NULL CHECK (
        pli_seat IN (
            'macro',
            'diplomacy_information',
            'national_interest_escalation'
        )
    ),
    handoff_seat TEXT NOT NULL CHECK (handoff_seat IN ('tsj', 'verba')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    copy_text TEXT,
    acknowledged_by TEXT,
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    CONSTRAINT sme_pli_packets_adjudication_seat_unique
        UNIQUE (adjudication_id, pli_seat, handoff_seat)
);

CREATE INDEX IF NOT EXISTS idx_sme_pli_packets_session
    ON public.sme_pli_packets(session_id);

CREATE INDEX IF NOT EXISTS idx_sme_pli_packets_session_handoff_status
    ON public.sme_pli_packets(session_id, handoff_seat, status);

ALTER TABLE public.sme_pli_packets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sme_pli_packets_select ON public.sme_pli_packets;
DROP POLICY IF EXISTS sme_pli_packets_insert ON public.sme_pli_packets;
DROP POLICY IF EXISTS sme_pli_packets_update ON public.sme_pli_packets;
DROP POLICY IF EXISTS sme_pli_packets_delete ON public.sme_pli_packets;

CREATE POLICY sme_pli_packets_select
    ON public.sme_pli_packets FOR SELECT
    USING (
        public.live_demo_can_write_session_surface(
            session_id,
            ARRAY['whitecell', 'gamemaster', 'sme']::TEXT[]
        )
        OR public.live_demo_has_operator_grant('gamemaster')
        OR public.live_demo_has_operator_grant('sme', session_id)
        OR public.live_demo_has_operator_grant('whitecell', session_id)
    );

CREATE POLICY sme_pli_packets_insert
    ON public.sme_pli_packets FOR INSERT
    WITH CHECK (
        public.live_demo_can_write_session_surface(
            session_id,
            ARRAY['whitecell', 'gamemaster', 'sme']::TEXT[]
        )
        OR public.live_demo_has_operator_grant('gamemaster')
        OR public.live_demo_has_operator_grant('sme', session_id)
        OR public.live_demo_has_operator_grant('whitecell', session_id)
    );

CREATE POLICY sme_pli_packets_update
    ON public.sme_pli_packets FOR UPDATE
    USING (
        public.live_demo_can_write_session_surface(
            session_id,
            ARRAY['whitecell', 'gamemaster', 'sme']::TEXT[]
        )
        OR public.live_demo_has_operator_grant('gamemaster')
        OR public.live_demo_has_operator_grant('sme', session_id)
        OR public.live_demo_has_operator_grant('whitecell', session_id)
    )
    WITH CHECK (
        status IN ('pending', 'done')
        AND (
            public.live_demo_can_write_session_surface(
                session_id,
                ARRAY['whitecell', 'gamemaster', 'sme']::TEXT[]
            )
            OR public.live_demo_has_operator_grant('gamemaster')
            OR public.live_demo_has_operator_grant('sme', session_id)
            OR public.live_demo_has_operator_grant('whitecell', session_id)
        )
    );

COMMENT ON TABLE public.sme_pli_packets IS
    'Copy-ready PLI packets for TSJ and Verba SMEs after matching-seat finalize.';

COMMIT;
