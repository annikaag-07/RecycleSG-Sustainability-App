
-- RecycleSG: GPS-validated recycling check-ins
-- Checks authentication and reported distance.
-- Does not award rewards automatically.

CREATE OR REPLACE FUNCTION public.create_gps_checkin(
    p_recycling_point_id BIGINT,
    p_latitude DOUBLE PRECISION,
    p_longitude DOUBLE PRECISION
)
RETURNS BIGINT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID;
    v_point_lat DOUBLE PRECISION;
    v_point_lon DOUBLE PRECISION;
    v_distance DOUBLE PRECISION;
    v_checkin_id BIGINT;
BEGIN
    v_user_id := (SELECT auth.uid());

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    
    IF p_latitude IS NULL
        OR p_longitude IS NULL
        OR NOT (p_latitude BETWEEN -90 AND 90)
        OR NOT (p_longitude BETWEEN -180 AND 180)
        OR p_latitude = 'NaN'::DOUBLE PRECISION
        OR p_longitude = 'NaN'::DOUBLE PRECISION
    THEN

        RAISE EXCEPTION 'Invalid GPS coordinates';
    END IF;

    SELECT rp.latitude, rp.longitude
    INTO v_point_lat, v_point_lon
    FROM public.recycling_points AS rp
    WHERE rp.id = p_recycling_point_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Recycling point not found';
    END IF;

    -- Haversine distance in metres
    v_distance := 6371000.0 * 2 * ASIN(
        SQRT(
            LEAST(1.0,
                POWER(SIN(RADIANS(v_point_lat - p_latitude) / 2), 2)
                + COS(RADIANS(p_latitude))
                * COS(RADIANS(v_point_lat))
                * POWER(SIN(RADIANS(v_point_lon - p_longitude) / 2), 2)
            )
        )
    );

    IF v_distance > 100 THEN
        RAISE EXCEPTION 'Too far from recycling point';
    END IF;

    INSERT INTO public.check_ins (
        user_id,
        recycling_point_id,
        latitude,
        longitude,
        distance_meters
    )
    VALUES (
        v_user_id,
        p_recycling_point_id,
        p_latitude,
        p_longitude,
        v_distance
    )
    RETURNING id INTO v_checkin_id;

    RETURN v_checkin_id;
END;
$$;

-- Only authenticated users may call this function.
REVOKE ALL ON FUNCTION public.create_gps_checkin(
    BIGINT,
    DOUBLE PRECISION,
    DOUBLE PRECISION
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.create_gps_checkin(
    BIGINT,
    DOUBLE PRECISION,
    DOUBLE PRECISION
) FROM anon;

GRANT EXECUTE ON FUNCTION public.create_gps_checkin(
    BIGINT,
    DOUBLE PRECISION,
    DOUBLE PRECISION
) TO authenticated;
