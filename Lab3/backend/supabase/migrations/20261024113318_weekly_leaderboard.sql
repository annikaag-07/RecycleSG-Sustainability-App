
CREATE OR REPLACE FUNCTION public.get_weekly_leaderboard(
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
    WITH weekly_scores AS (
        SELECT
            rt.user_id,
            SUM(rt.eco_points_earned)::integer AS weekly_points
        FROM public.reward_transactions rt
        WHERE rt.recycling_action_id IS NOT NULL
          AND rt.created_at >= (
              date_trunc(
                  'week',
                  now() AT TIME ZONE 'Asia/Singapore'
              ) AT TIME ZONE 'Asia/Singapore'
          )
        GROUP BY rt.user_id
    )
    SELECT
        RANK() OVER (
            ORDER BY ws.weekly_points DESC
        ) AS rank,
        p.username,
        p.display_name,
        p.level,
        ws.weekly_points AS eco_points
    FROM weekly_scores ws
    JOIN public.profiles p ON p.id = ws.user_id
    WHERE ws.weekly_points > 0
    ORDER BY ws.weekly_points DESC, p.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.get_weekly_leaderboard(integer)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_weekly_leaderboard(integer)
TO anon, authenticated;
