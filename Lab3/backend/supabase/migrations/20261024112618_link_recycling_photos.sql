
-- Extend activity submission with optional photo storage path.
-- Existing three-parameter calls remain supported.

CREATE OR REPLACE FUNCTION public.submit_recycling_activity(
    p_check_in_id bigint,
    p_material_type_id bigint,
    p_quantity integer DEFAULT 1,
    p_photo_url text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
    v_recycling_point_id bigint;
    v_checked_in_at timestamptz;
    v_action_id bigint;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_quantity IS NULL
       OR p_quantity < 1
       OR p_quantity > 100
    THEN
        RAISE EXCEPTION 'Quantity must be between 1 and 100';
    END IF;

    -- Validate the optional photo path.
    IF p_photo_url IS NOT NULL THEN
        IF length(p_photo_url) > 500
           OR p_photo_url NOT LIKE v_user_id::text || '/%'
           OR p_photo_url LIKE '%..%'
        THEN
            RAISE EXCEPTION 'Invalid photo storage path';
        END IF;

        -- Confirm the photo exists in the private bucket.
        IF NOT EXISTS (
            SELECT 1
            FROM storage.objects
            WHERE bucket_id = 'recycling-photos'
              AND name = p_photo_url
        ) THEN
            RAISE EXCEPTION 'Recycling photo not found';
        END IF;
    END IF;

    -- Verify check-in ownership.
    SELECT ci.recycling_point_id, ci.checked_in_at
    INTO v_recycling_point_id, v_checked_in_at
    FROM public.check_ins ci
    WHERE ci.id = p_check_in_id
      AND ci.user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Check-in not found or not owned by user';
    END IF;

    IF v_checked_in_at > CURRENT_TIMESTAMP
       OR v_checked_in_at < CURRENT_TIMESTAMP - INTERVAL '15 minutes'
    THEN
        RAISE EXCEPTION 'Check-in has expired';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.recycling_point_materials rpm
        WHERE rpm.recycling_point_id = v_recycling_point_id
          AND rpm.material_type_id = p_material_type_id
    ) THEN
        RAISE EXCEPTION 'Material not accepted at recycling point';
    END IF;

    INSERT INTO public.recycling_actions (
        user_id,
        check_in_id,
        material_type_id,
        quantity,
        photo_url,
        verification_status
    )
    VALUES (
        v_user_id,
        p_check_in_id,
        p_material_type_id,
        p_quantity,
        p_photo_url,
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

-- Remove execute permissions from the obsolete function signature.
REVOKE ALL ON FUNCTION
public.submit_recycling_activity(bigint,bigint,integer)
FROM PUBLIC, anon, authenticated;

-- Only signed-in users may submit.
REVOKE ALL ON FUNCTION
public.submit_recycling_activity(bigint,bigint,integer,text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
public.submit_recycling_activity(bigint,bigint,integer,text)
TO authenticated;
DROP FUNCTION public.submit_recycling_activity(
    bigint, bigint, integer
);