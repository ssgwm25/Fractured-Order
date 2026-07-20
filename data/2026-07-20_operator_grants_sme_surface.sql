-- Allow SME surface on operator_grants (missed when SME authorize path was added).

ALTER TABLE public.operator_grants
    DROP CONSTRAINT IF EXISTS operator_grants_surface_check;

ALTER TABLE public.operator_grants
    ADD CONSTRAINT operator_grants_surface_check
    CHECK (surface = ANY (ARRAY['gamemaster'::text, 'whitecell'::text, 'sme'::text]));
