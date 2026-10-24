
-- Support both recycling and quest reward transactions.

ALTER TABLE public.reward_transactions
ADD COLUMN quest_progress_id bigint
REFERENCES public.user_quest_progress(id);

ALTER TABLE public.reward_transactions
ALTER COLUMN recycling_action_id DROP NOT NULL;

ALTER TABLE public.reward_transactions
ADD CONSTRAINT reward_transaction_one_source
CHECK (
    (recycling_action_id IS NOT NULL AND quest_progress_id IS NULL)
    OR
    (recycling_action_id IS NULL AND quest_progress_id IS NOT NULL)
);

CREATE UNIQUE INDEX reward_transaction_quest_unique
ON public.reward_transactions (quest_progress_id)
WHERE quest_progress_id IS NOT NULL;

-- Replace claim function to record quest rewards.
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

    UPDATE public.profiles
    SET eco_points = eco_points + v_quest.reward_eco_points,
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

    -- Add the quest reward to the transaction history.
    INSERT INTO public.reward_transactions (
        user_id,
        quest_progress_id,
        eco_points_earned,
        xp_earned
    )
    VALUES (
        v_user,
        v_progress.id,
        v_quest.reward_eco_points,
        v_quest.reward_xp
    );

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

REVOKE ALL ON FUNCTION public.claim_quest_reward(bigint,date)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.claim_quest_reward(bigint,date)
TO authenticated;
