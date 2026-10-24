
-- RecycleSG badges and achievements

CREATE TABLE public.badges (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL UNIQUE,
    description text,
    required_verified_actions integer NOT NULL
        CHECK (required_verified_actions > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_badges (
    user_id uuid NOT NULL REFERENCES public.profiles(id)
        ON DELETE CASCADE,
    badge_id bigint NOT NULL REFERENCES public.badges(id)
        ON DELETE CASCADE,
    earned_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, badge_id)
);

ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View badges"
ON public.badges FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "View own earned badges"
ON public.user_badges FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

GRANT SELECT ON public.badges TO anon, authenticated;
GRANT SELECT ON public.user_badges TO authenticated;

REVOKE INSERT, UPDATE, DELETE
ON public.badges, public.user_badges
FROM anon, authenticated;

INSERT INTO public.badges
    (name, description, required_verified_actions)
VALUES
    ('First Step', 'Complete your first verified recycling activity', 1),
    ('Eco Starter', 'Complete 10 verified recycling activities', 10),
    ('Green Champion', 'Complete 50 verified recycling activities', 50),
    ('Recycling Legend', 'Complete 100 verified recycling activities', 100);

-- Award badges automatically when an activity is verified.
CREATE OR REPLACE FUNCTION public.award_recycling_badges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_verified_count integer;
BEGIN
    IF NEW.verification_status IS DISTINCT FROM 'Verified'
       OR OLD.verification_status IS NOT DISTINCT FROM 'Verified'
    THEN
        RETURN NEW;
    END IF;

    SELECT count(*) INTO v_verified_count
    FROM public.recycling_actions
    WHERE user_id = NEW.user_id
      AND verification_status = 'Verified';

    INSERT INTO public.user_badges (user_id, badge_id)
    SELECT NEW.user_id, b.id
    FROM public.badges b
    WHERE b.required_verified_actions <= v_verified_count
    ON CONFLICT (user_id, badge_id) DO NOTHING;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.award_recycling_badges()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER award_recycling_badges_trigger
AFTER UPDATE OF verification_status
ON public.recycling_actions
FOR EACH ROW
EXECUTE FUNCTION public.award_recycling_badges();
