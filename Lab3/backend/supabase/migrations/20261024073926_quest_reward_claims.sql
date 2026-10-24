
CREATE OR REPLACE FUNCTION public.claim_quest_reward(
    p_quest_id bigint,
    p_period_start date
)
RETURNS TABLE (
    eco_points_awarded integer,
    xp_awarded integer,
    new_balance integer,
    new_level integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user uuid := auth.uid();
    v_progress public.user_quest_progress%ROWTYPE;
    v_quest public.quests%ROWTYPE;
    v_balance integer;
    v_level integer;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO v_progress
    FROM public.user_quest_progress
    WHERE user_id = v_user
      AND quest_id = p_quest_id
      AND period_start = p_period_start
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quest progress not found';
    END IF;

    IF v_progress.completed_at IS NULL THEN
        RAISE EXCEPTION 'Quest not completed';
    END IF;

    IF v_progress.claimed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Reward already claimed';
    END IF;

    SELECT * INTO v_quest
    FROM public.quests
    WHERE id = p_quest_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quest not found';
    END IF;

    UPDATE public.profiles
    SET eco_points =
            eco_points + v_quest.reward_eco_points,
        available_eco_points =
            available_eco_points + v_quest.reward_eco_points,
        xp = xp + v_quest.reward_xp,
        level = 1 + ((xp + v_quest.reward_xp) / 100)
    WHERE id = v_user
    RETURNING available_eco_points, level
    INTO v_balance, v_level;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile not found';
    END IF;

    UPDATE public.user_quest_progress
    SET claimed_at = now()
    WHERE id = v_progress.id;

    RETURN QUERY SELECT
        v_quest.reward_eco_points,
        v_quest.reward_xp,
        v_balance,
        v_level;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_quest_reward(bigint, date)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.claim_quest_reward(bigint, date)
TO authenticated;
