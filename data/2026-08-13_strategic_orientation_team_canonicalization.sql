-- Canonicalize Strategic Orientation compatibility types before the existing
-- action workflow guard and actions_artifact_team_check evaluate the row.
-- Apply after data/2026-08-13_rfi_answer_completion_trigger.sql.
--
-- Contract-v2 envelopes contain both an own orientation and forecasts, while
-- the actions table deliberately retains the original two compatibility row
-- types. Blue owns strategic_orientation_selection; Red, Green, and Industry
-- own strategic_orientation_forecast. Enforce that mapping server-side for
-- both inserts and draft updates without broadening the team constraint.

BEGIN;

CREATE OR REPLACE FUNCTION public.canonicalize_strategic_orientation_artifact_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $canonicalize$
DECLARE
    normalized_team TEXT;
BEGIN
    normalized_team := LOWER(BTRIM(COALESCE(NEW.team, '')));

    IF LOWER(BTRIM(COALESCE(NEW.ally_contingencies, '')))
       LIKE 'strategic orientation details%' THEN
        IF normalized_team = 'blue' THEN
            NEW.artifact_type := 'strategic_orientation_selection';
        ELSIF normalized_team IN ('red', 'green', 'industry') THEN
            NEW.artifact_type := 'strategic_orientation_forecast';
        ELSE
            RAISE EXCEPTION
                'Strategic Orientation artifacts require Blue, Red, Green, or Industry team ownership.'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$canonicalize$;

DROP TRIGGER IF EXISTS canonicalize_strategic_orientation_artifact_type
    ON public.actions;

-- PostgreSQL runs same-kind triggers alphabetically. This trigger therefore
-- runs before normalize_action_workflow_write and before CHECK constraints.
CREATE TRIGGER canonicalize_strategic_orientation_artifact_type
    BEFORE INSERT OR UPDATE ON public.actions
    FOR EACH ROW
    EXECUTE FUNCTION public.canonicalize_strategic_orientation_artifact_type();

COMMENT ON FUNCTION public.canonicalize_strategic_orientation_artifact_type() IS
    'Canonicalizes the four-team Strategic Orientation compatibility type before workflow normalization and team constraint enforcement.';

COMMIT;
