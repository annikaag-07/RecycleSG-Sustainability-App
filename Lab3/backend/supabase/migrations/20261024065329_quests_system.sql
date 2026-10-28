
-- RecycleSG Quest System
-- Quests are completed through verified recycling activities.

CREATE TABLE public.quests (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title text NOT NULL,
    description text,
    quest_type text NOT NULL
        CHECK (quest_type IN ('daily', 'weekly', 'one_time')),
    target_actions integer NOT NULL CHECK (target_actions > 0),
    reward_eco_points integer NOT NULL DEFAULT 0
        CHECK (reward_eco_points >= 0),
    reward_xp integer NOT NULL DEFAULT 0
        CHECK (reward_xp >= 0),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_quest_progress (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.profiles(id)
        ON DELETE CASCADE,
    quest_id bigint NOT NULL REFERENCES public.quests(id)
        ON DELETE CASCADE,
    period_start date NOT NULL,
    progress integer NOT NULL DEFAULT 0
        CHECK (progress >= 0),
    completed_at timestamptz,
    claimed_at timestamptz,
    UNIQUE (user_id, quest_id, period_start)
);

-- Enable row-level security.
ALTER TABLE public.quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_quest_progress ENABLE ROW LEVEL SECURITY;

-- Anyone can view active quests.
CREATE POLICY "View active quests"
ON public.quests
FOR SELECT
TO anon, authenticated
USING (is_active = true);

-- Users can view only their own progress.
CREATE POLICY "View own quest progress"
ON public.user_quest_progress
FOR SELECT
TO authenticated
USING (user_id = (SELECT auth.uid()));

-- No client INSERT, UPDATE or DELETE permissions.
-- Future trusted backend functions will handle progress and rewards.

GRANT SELECT ON public.quests TO anon, authenticated;
GRANT SELECT ON public.user_quest_progress TO authenticated;

REVOKE INSERT, UPDATE, DELETE
ON public.quests, public.user_quest_progress
FROM anon, authenticated;
