-- GC-08; apply once after September 28. No roster approval or history backfill.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $$ BEGIN
    IF to_regprocedure('public.configure_session_green_shared_facilitator(uuid,text)') IS NULL
        OR to_regprocedure('public.submit_regional_orientation(uuid,text,uuid,bigint,bigint)') IS NULL
        OR to_regprocedure('public.write_regional_proposal(uuid,text,uuid,bigint,bigint,text,jsonb,text)') IS NULL
        OR to_regprocedure('public.write_regional_rfi(uuid,text,uuid,bigint,text,text[],text)') IS NULL THEN
        RAISE EXCEPTION 'GC08_OPERATIONAL_PREREQUISITES_MISSING';
    END IF;
END $$;

-- A receipt is private to the server. The caller/key pair survives lost responses.
CREATE TABLE public.gc08_session_creations (
    operator_id UUID NOT NULL,
    request_key UUID NOT NULL,
    request JSONB NOT NULL,
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE RESTRICT,
    PRIMARY KEY(operator_id,request_key)
);
ALTER TABLE public.gc08_session_creations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gc08_session_creations FROM PUBLIC,anon,authenticated;
CREATE TRIGGER gc08_creation_immutable BEFORE UPDATE OR DELETE ON public.gc08_session_creations
    FOR EACH ROW EXECUTE FUNCTION public.green_storage_immutable();

-- Empty foundation fixtures cannot be used to activate an exercise through setup.
CREATE FUNCTION public.gc08_usable_roster(snapshot JSONB) RETURNS BOOLEAN
LANGUAGE SQL IMMUTABLE SET search_path=public AS $$
    SELECT COALESCE(jsonb_typeof(snapshot->'asian_pacific')='array'
        AND snapshot->'asian_pacific'<>'[]'::JSONB
        AND jsonb_typeof(snapshot->'europe')='array' AND snapshot->'europe'<>'[]'::JSONB
        AND jsonb_typeof(snapshot->'source_references')='array' AND snapshot->'source_references'<>'[]'::JSONB
        AND jsonb_typeof(snapshot->'aliases')='object',false)
$$;

CREATE FUNCTION public.list_approved_green_rosters() RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
    IF auth.uid() IS NULL OR NOT public.live_demo_has_operator_grant('gamemaster') THEN
        RAISE EXCEPTION 'GC08_GM_REQUIRED' USING ERRCODE='42501';
    END IF;
    RETURN (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.approved_at DESC,r.version),'[]'::JSONB)
        FROM public.green_roster_approvals r WHERE public.gc08_usable_roster(r.snapshot));
END $$;

CREATE FUNCTION public.create_configured_live_session(requested_name TEXT, requested_session_code TEXT,
    requested_description TEXT, requested_green_configuration TEXT, requested_roster_version TEXT,
    requested_request_key UUID) RETURNS public.sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result public.sessions%ROWTYPE; receipt public.gc08_session_creations%ROWTYPE; request JSONB;
BEGIN
    IF auth.uid() IS NULL OR NOT public.live_demo_has_operator_grant('gamemaster') THEN
        RAISE EXCEPTION 'GC08_GM_REQUIRED' USING ERRCODE='42501';
    END IF;
    IF requested_request_key IS NULL OR NULLIF(btrim(requested_name),'') IS NULL
        OR COALESCE(upper(btrim(requested_session_code)) ~ '^[A-Z0-9]{3,50}$',false) IS NOT TRUE
        OR requested_green_configuration IS NULL
        OR requested_green_configuration NOT IN ('unified_v1','shared_facilitator_v1') THEN
        RAISE EXCEPTION 'GC08_INVALID_SETUP' USING ERRCODE='22023';
    END IF;
    request := jsonb_build_object('name',btrim(requested_name),'code',upper(btrim(requested_session_code)),
        'description',NULLIF(btrim(requested_description),''),'model',requested_green_configuration,'roster',requested_roster_version);
    PERFORM pg_advisory_xact_lock(hashtextextended('gc08:'||auth.uid()||':'||requested_request_key,0));
    SELECT * INTO receipt FROM public.gc08_session_creations
        WHERE operator_id=auth.uid() AND request_key=requested_request_key;
    IF FOUND THEN
        IF receipt.request IS DISTINCT FROM request THEN
            RAISE EXCEPTION 'GC08_RETRY_CONFLICT' USING ERRCODE='PT409';
        END IF;
        SELECT * INTO STRICT result FROM public.sessions WHERE id=receipt.session_id;
        RETURN result; -- Includes current archived/deleted status; never reactivates.
    END IF;
    IF requested_green_configuration='shared_facilitator_v1' THEN
        IF NOT EXISTS(SELECT 1 FROM public.green_roster_approvals r
            WHERE r.version=requested_roster_version AND public.gc08_usable_roster(r.snapshot)) THEN
            RAISE EXCEPTION 'GC08_APPROVED_ROSTER_REQUIRED' USING ERRCODE='23514';
        END IF;
    ELSIF requested_roster_version IS NOT NULL THEN
        RAISE EXCEPTION 'GC08_UNIFIED_ROSTER_CONFLICT' USING ERRCODE='22023';
    END IF;
    -- GC-04A runs before game-state initialization or receipt evidence. The new
    -- row is invisible to other transactions until the complete setup commits.
    INSERT INTO public.sessions(name,status,session_code,metadata)
        VALUES(request->>'name','active',request->>'code',jsonb_build_object(
            'session_code',request->>'code','description',request->>'description')) RETURNING * INTO result;
    IF requested_green_configuration='shared_facilitator_v1' THEN
        SELECT * INTO result FROM public.configure_session_green_shared_facilitator(result.id,requested_roster_version);
    END IF;
    INSERT INTO public.game_state(session_id,move,phase,timer_seconds,timer_running,timer_last_update)
        VALUES(result.id,1,1,5400,false,NULL);
    INSERT INTO public.gc08_session_creations(operator_id,request_key,request,session_id)
        VALUES(auth.uid(),requested_request_key,request,result.id);
    -- The receipt is retained setup evidence, so even an unused creation cannot
    -- later acquire a different model/roster behind a recovered response.
    SELECT * INTO result FROM public.sessions WHERE id=result.id;
    RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.gc08_usable_roster(JSONB),public.list_approved_green_rosters(),
    public.create_configured_live_session(TEXT,TEXT,TEXT,TEXT,TEXT,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_approved_green_rosters(),
    public.create_configured_live_session(TEXT,TEXT,TEXT,TEXT,TEXT,UUID) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
