
-- RecycleSG: Secure recycling activity submissions
-- Activities begin as Pending.
-- Rewards and CV verification are handled separately.

-- Prevent duplicate submissions for the same
-- check-in and material, including concurrent requests.
CREATE UNIQUE INDEX IF NOT EXISTS
    unique_recycling_action_per_checkin_material
ON public.recycling_actions (
    check_in_id,
    material_type_id
);

CREATE OR REPLACE FUNCTION public.submit_recycling_activity(
    p_check_in_id BIGINT,
    p_material_type_id BIGINT,
    p_quantity INTEGER DEFAULT 1
)
RETURNS BIGINT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_recycling_point_id BIGINT;
    v_checked_in_at TIMESTAMPTZ;
    v_action_id BIGINT;
BEGIN
    -- Identify the authenticated user.
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Validate the requested quantity.
    IF p_quantity IS NULL
       OR p_quantity < 1
       OR p_quantity > 100
    THEN
        RAISE EXCEPTION 'Quantity must be between 1 and 100';
    END IF;

    -- Verify check-in ownership.
    SELECT
        ci.recycling_point_id,
        ci.checked_in_at
    INTO
        v_recycling_point_id,
        v_checked_in_at
    FROM public.check_ins AS ci
    WHERE ci.id = p_check_in_id
      AND ci.user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Check-in not found or not owned by user';
    END IF;

    -- Only accept submissions within 15 minutes of check-in.
    IF v_checked_in_at > CURRENT_TIMESTAMP
       OR v_checked_in_at < CURRENT_TIMESTAMP - INTERVAL '15 minutes'
    THEN
        RAISE EXCEPTION 'Check-in has expired';
    END IF;

    -- Verify the recycling point accepts the selected material.
    IF NOT EXISTS (
        SELECT 1
        FROM public.recycling_point_materials AS rpm
        WHERE rpm.recycling_point_id = v_recycling_point_id
          AND rpm.material_type_id = p_material_type_id
    ) THEN
        RAISE EXCEPTION 'Material not accepted at recycling point';
    END IF;

    -- Create an activity without granting rewards.
    INSERT INTO public.recycling_actions (
        user_id,
        check_in_id,
        material_type_id,
        quantity,
        verification_status
    )
    VALUES (
        v_user_id,
        p_check_in_id,
        p_material_type_id,
        p_quantity,
        'Pending'
    )
    ON CONFLICT (check_in_id, material_type_id)
    DO NOTHING
    RETURNING id INTO v_action_id;

    IF v_action_id IS NULL THEN
        RAISE EXCEPTION 'Activity already submitted for this material';
    END IF;

    RETURN v_action_id;
END;
$$;

-- Restrict direct execution to authenticated users.
REVOKE ALL ON FUNCTION public.submit_recycling_activity(
    BIGINT, BIGINT, INTEGER
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.submit_recycling_activity(
    BIGINT, BIGINT, INTEGER
) TO authenticated;
