
-- Find recycling points near a GPS location
-- Distances are calculated in kilometres using
-- the Haversine formula.

CREATE OR REPLACE FUNCTION public.search_nearby_recycling_points(
    p_latitude DOUBLE PRECISION,
    p_longitude DOUBLE PRECISION,
    p_radius_km DOUBLE PRECISION DEFAULT 5,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    id BIGINT,
    name TEXT,
    address TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    status TEXT,
    distance_km DOUBLE PRECISION
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT
        rp.id,
        rp.name,
        rp.address,
        rp.latitude::DOUBLE PRECISION,
        rp.longitude::DOUBLE PRECISION,
        rp.status,
        (
            6371.0 * 2 * ASIN(
                SQRT(
                    POWER(SIN(RADIANS(
                        rp.latitude::DOUBLE PRECISION - p_latitude
                    ) / 2), 2)
                    + COS(RADIANS(p_latitude))
                    * COS(RADIANS(rp.latitude::DOUBLE PRECISION))
                    * POWER(SIN(RADIANS(
                        rp.longitude::DOUBLE PRECISION - p_longitude
                    ) / 2), 2)
                )
            )
        ) AS distance_km
    FROM public.recycling_points AS rp
    WHERE p_latitude BETWEEN -90 AND 90
      AND p_longitude BETWEEN -180 AND 180
      AND p_radius_km > 0
      AND p_limit BETWEEN 1 AND 100
      AND rp.latitude IS NOT NULL
      AND rp.longitude IS NOT NULL
      AND (
          6371.0 * 2 * ASIN(
              SQRT(
                  LEAST(1.0,
                      POWER(SIN(RADIANS(
                          rp.latitude::DOUBLE PRECISION - p_latitude
                      ) / 2), 2)
                      + COS(RADIANS(p_latitude))
                      * COS(RADIANS(rp.latitude::DOUBLE PRECISION))
                      * POWER(SIN(RADIANS(
                          rp.longitude::DOUBLE PRECISION - p_longitude
                      ) / 2), 2)
                  )
              )
          )
      ) <= p_radius_km
    ORDER BY distance_km, rp.id
    LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION
public.search_nearby_recycling_points(
    DOUBLE PRECISION,
    DOUBLE PRECISION,
    DOUBLE PRECISION,
    INTEGER
)
TO anon, authenticated;
