
CREATE OR REPLACE FUNCTION public.get_community_feed(
    p_limit integer DEFAULT 20
)
RETURNS TABLE (
    activity_id bigint,
    username text,
    display_name text,
    material text,
    quantity integer,
    recycled_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        a.id,
        'Anonymous Recycler'::text AS username,
        COALESCE(
            NULLIF(BTRIM(p.display_name), ''),
            'Anonymous Recycler'
        )::text AS display_name,
        m.name AS material,
        a.quantity,
        a.verified_at
    FROM public.recycling_actions a
    JOIN public.profiles p ON p.id = a.user_id
    JOIN public.material_types m
        ON m.id = a.material_type_id
    WHERE a.verification_status = 'Verified'
      AND a.verified_at IS NOT NULL
    ORDER BY a.verified_at DESC, a.id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.get_community_feed(integer)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_community_feed(integer)
TO anon, authenticated;
