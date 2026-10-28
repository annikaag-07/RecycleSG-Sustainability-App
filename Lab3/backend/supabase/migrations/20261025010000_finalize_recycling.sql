-- Only the trusted CV service may finalize. A row lock makes retries terminal
-- and idempotent; rewards/quests/badges still belong to the existing triggers.
CREATE FUNCTION public.finalize_recycling_activity(
    p_activity_id bigint, p_user_id uuid, p_status text,
    p_predicted_material text, p_confidence double precision
) RETURNS SETOF public.recycling_actions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE activity public.recycling_actions;
BEGIN
    SELECT * INTO activity FROM public.recycling_actions
    WHERE id = p_activity_id AND user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Activity not found'; END IF;
    IF activity.verification_status <> 'Pending' THEN
        RETURN NEXT activity;
        RETURN;
    END IF;
    IF p_status NOT IN ('Verified','Rejected') OR p_status IS NULL
       OR p_confidence IS NULL OR NOT (p_confidence BETWEEN 0 AND 1)
       OR p_predicted_material IS NULL THEN
        RAISE EXCEPTION 'Invalid verification result';
    END IF;
    IF p_status = 'Verified' AND NOT EXISTS (
        SELECT 1 FROM public.material_types m
        WHERE m.id = activity.material_type_id
          AND lower(m.name) = lower(p_predicted_material)
    ) THEN RAISE EXCEPTION 'Material mismatch'; END IF;
    UPDATE public.recycling_actions
    SET verification_status = p_status,
        verified_at = CASE WHEN p_status = 'Verified' THEN now() ELSE NULL END,
        cv_predicted_material = p_predicted_material,
        cv_confidence = p_confidence
    WHERE id = p_activity_id RETURNING * INTO activity;
    RETURN NEXT activity;
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_recycling_activity(bigint,uuid,text,text,double precision)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_recycling_activity(bigint,uuid,text,text,double precision)
TO service_role;
