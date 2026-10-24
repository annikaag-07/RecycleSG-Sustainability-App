
-- Record each reward awarded for verified recycling.
CREATE TABLE public.reward_transactions (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    user_id uuid NOT NULL
        REFERENCES public.profiles(id) ON DELETE CASCADE,

    recycling_action_id bigint NOT NULL UNIQUE
        REFERENCES public.recycling_actions(id) ON DELETE CASCADE,

    eco_points_earned integer NOT NULL
        CHECK (eco_points_earned > 0),

    xp_earned integer NOT NULL
        CHECK (xp_earned > 0),

    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reward_transactions_user_id_idx
ON public.reward_transactions(user_id);

-- Protect reward history from direct client writes.
ALTER TABLE public.reward_transactions
ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own rewards"
ON public.reward_transactions
FOR SELECT
TO authenticated
USING (user_id = (SELECT auth.uid()));

-- Explicitly limit access to reward history.
REVOKE ALL ON public.reward_transactions
FROM anon, authenticated;

GRANT SELECT ON public.reward_transactions
TO authenticated;

-- Prevent users from modifying their own reward balances.
REVOKE UPDATE ON public.profiles
FROM anon, authenticated;

-- Allow users to edit only their personal information.
GRANT UPDATE (
    username,
    display_name,
    avatar_url,
    bio
)
ON public.profiles
TO authenticated;

-- Reward transactions must not be writable by API users.
REVOKE ALL ON public.reward_transactions
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.reward_transactions
TO authenticated;

-- Only trusted backend processes should update verification results.
REVOKE INSERT, UPDATE, DELETE
ON public.recycling_actions
FROM PUBLIC, anon, authenticated;

-- Automatically award points when an activity becomes Verified.
CREATE OR REPLACE FUNCTION public.award_verified_recycling()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_points integer;
    v_awarded_id bigint;
BEGIN
    -- Only reward an activity transitioning into Verified.
    IF NEW.verification_status <> 'Verified'
       OR OLD.verification_status IS NOT DISTINCT FROM 'Verified'
    THEN
        RETURN NEW;
    END IF;

    -- 10 points and 10 XP per recycling unit.
    v_points := NEW.quantity * 10;

    -- UNIQUE recycling_action_id prevents duplicate rewards.
    INSERT INTO public.reward_transactions (
        user_id,
        recycling_action_id,
        eco_points_earned,
        xp_earned
    )
    VALUES (
        NEW.user_id,
        NEW.id,
        v_points,
        v_points
    )
    ON CONFLICT (recycling_action_id) DO NOTHING
    RETURNING id INTO v_awarded_id;

    -- Only update balances if a new reward was inserted.
    IF v_awarded_id IS NOT NULL THEN
        UPDATE public.profiles
        SET
            eco_points = eco_points + v_points,
            available_eco_points = available_eco_points + v_points,
            xp = xp + v_points,
            level = 1 + ((xp + v_points) / 100)
        WHERE id = NEW.user_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Reward recipient profile not found';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Do not expose this trigger function as a public API.
REVOKE ALL ON FUNCTION public.award_verified_recycling()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER award_verified_recycling_trigger
AFTER UPDATE OF verification_status
ON public.recycling_actions
FOR EACH ROW
EXECUTE FUNCTION public.award_verified_recycling();

-- Estimated environmental impact from verified recycling.
-- Assumptions are illustrative, not scientifically verified.
-- 1 recycling unit = 0.1 kg estimated CO2 saved.
-- 1 tree equivalent = 20 kg estimated CO2 saved.

CREATE OR REPLACE FUNCTION public.get_user_environmental_impact(
    p_user_id uuid
)
RETURNS TABLE (
    total_verified_actions bigint,
    total_recycled_units bigint,
    estimated_co2_saved_kg numeric,
    tree_equivalents numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT
        COUNT(*)::bigint,
        COALESCE(SUM(ra.quantity), 0)::bigint,
        ROUND(
            COALESCE(SUM(ra.quantity), 0)::numeric * 0.1,
            2
        ),
        ROUND(
            COALESCE(SUM(ra.quantity), 0)::numeric * 0.1 / 20,
            3
        )
    FROM public.recycling_actions ra
    WHERE ra.user_id = p_user_id
      AND ra.verification_status = 'Verified'
      AND ra.user_id = (SELECT auth.uid());
$$;

REVOKE ALL ON FUNCTION public.get_user_environmental_impact(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_user_environmental_impact(uuid)
TO authenticated;
