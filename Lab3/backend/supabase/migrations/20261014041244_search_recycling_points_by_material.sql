
-- Search recycling points by material name
CREATE OR REPLACE FUNCTION public.search_recycling_points_by_material(
    p_material TEXT
)
RETURNS TABLE (
    id BIGINT,
    name TEXT,
    address TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    status TEXT
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
        rp.status
    FROM public.recycling_points AS rp
    JOIN public.recycling_point_materials AS rpm
        ON rpm.recycling_point_id = rp.id
    JOIN public.material_types AS mt
        ON mt.id = rpm.material_type_id
    WHERE LOWER(mt.name) = LOWER(p_material)
    ORDER BY rp.address;
$$;

-- Allow authenticated and anonymous users to search
GRANT EXECUTE ON FUNCTION
public.search_recycling_points_by_material(TEXT)
TO anon, authenticated;
