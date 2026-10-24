
-- RecycleSG leaderboard
-- Rankings use lifetime Eco Points, not spendable points.

CREATE OR REPLACE FUNCTION public.get_leaderboard(
    p_limit integer DEFAULT 10
)
RETURNS TABLE (
    rank bigint,
    username text,
    display_name text,
    level integer,
    eco_points integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        ROW_NUMBER() OVER (
            ORDER BY p.eco_points DESC, p.id ASC
        ) AS rank,
        p.username,
        p.display_name,
        p.level,
        p.eco_points
    FROM public.profiles AS p
    ORDER BY p.eco_points DESC, p.id ASC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.get_leaderboard(integer)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_leaderboard(integer)
TO anon, authenticated;
