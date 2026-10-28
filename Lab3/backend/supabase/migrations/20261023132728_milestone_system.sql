
-- RecycleSG: Community Milestone System

CREATE TABLE public.milestones (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL,
    description text,
    organisation text NOT NULL,
    target_points integer NOT NULL CHECK (target_points > 0),
    current_points integer NOT NULL DEFAULT 0
        CHECK (current_points >= 0 AND current_points <= target_points),
    expected_outcome text,
    closing_date timestamptz,
    status text NOT NULL DEFAULT 'Active'
        CHECK (status IN (
            'Active',
            'AwaitingVerification',
            'Verified',
            'Rejected'
        )),
    evidence_url text,
    evidence_notes text,
    evidence_requested_note text,
    decided_at timestamptz,
    decision_reason text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.milestone_contributions (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    milestone_id bigint NOT NULL
        REFERENCES public.milestones(id) ON DELETE RESTRICT,
    user_id uuid NOT NULL
        REFERENCES public.profiles(id) ON DELETE RESTRICT,
    client_request_id uuid NOT NULL,
    requested_amount integer NOT NULL CHECK (requested_amount > 0),
    amount integer NOT NULL CHECK (amount > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, client_request_id)
);

CREATE INDEX milestone_contributions_user_idx
ON public.milestone_contributions(user_id);

CREATE INDEX milestone_contributions_milestone_idx
ON public.milestone_contributions(milestone_id);

-- Enable row-level security
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestone_contributions ENABLE ROW LEVEL SECURITY;

-- Everyone can view publicly available milestones.
CREATE POLICY "Public can view milestones"
ON public.milestones
FOR SELECT
TO anon, authenticated
USING (true);

-- Users can view only their own contributions.
CREATE POLICY "Users view own milestone contributions"
ON public.milestone_contributions
FOR SELECT
TO authenticated
USING (user_id = (SELECT auth.uid()));

-- Explicit API grants
REVOKE ALL ON public.milestones
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON public.milestone_contributions
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.milestones
TO anon, authenticated;

GRANT SELECT ON public.milestone_contributions
TO authenticated;


-- Public milestone listing API
CREATE OR REPLACE FUNCTION public.list_milestones()
RETURNS TABLE (
    id bigint,
    name text,
    description text,
    organisation text,
    target_points integer,
    current_points integer,
    expected_outcome text,
    closing_date timestamptz,
    status text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT
        m.id,
        m.name,
        m.description,
        m.organisation,
        m.target_points,
        m.current_points,
        m.expected_outcome,
        m.closing_date,
        m.status
    FROM public.milestones AS m
    ORDER BY m.created_at DESC, m.id DESC;
$$;

-- Explicit execution permissions
REVOKE ALL ON FUNCTION public.list_milestones()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.list_milestones()
TO anon, authenticated;


-- Secure community milestone contributions

CREATE OR REPLACE FUNCTION public.contribute_to_milestone(
    p_milestone_id bigint,
    p_amount integer,
    p_client_request_id uuid
)
RETURNS TABLE (
    accepted_amount integer,
    available_eco_points integer,
    current_points integer,
    status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
    v_available integer;
    v_milestone public.milestones%ROWTYPE;
    v_existing public.milestone_contributions%ROWTYPE;
    v_accepted integer;
    v_new_balance integer;
    v_new_points integer;
    v_new_status text;
BEGIN
    v_user_id := (SELECT auth.uid());

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Contribution amount must be positive';
    END IF;

    IF p_client_request_id IS NULL THEN
        RAISE EXCEPTION 'Request ID is required';
    END IF;

    -- Serialize contributions to the same milestone first.
-- All contribution requests take this lock before profile locks.
    PERFORM pg_advisory_xact_lock(
    hashtextextended('milestone:' || p_milestone_id::text, 0)
);

    -- Lock the user's balance to prevent concurrent overspending.
    SELECT p.available_eco_points
    INTO v_available
    FROM public.profiles p
    WHERE p.id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile not found';
    END IF;

    -- Idempotency: a repeated request must never deduct twice.
    SELECT *
    INTO v_existing
    FROM public.milestone_contributions mc
    WHERE mc.user_id = v_user_id
      AND mc.client_request_id = p_client_request_id;

    IF FOUND THEN
        IF v_existing.milestone_id <> p_milestone_id
           OR v_existing.requested_amount <> p_amount THEN
            RAISE EXCEPTION 'Request ID already used for a different contribution';
        END IF;

        RETURN QUERY
        SELECT
            v_existing.amount,
            v_available,
            m.current_points,
            m.status
        FROM public.milestones m
        WHERE m.id = v_existing.milestone_id;

        RETURN;
    END IF;

    -- Require a confirmed account.
    IF NOT EXISTS (
        SELECT 1
        FROM auth.users u
        WHERE u.id = v_user_id
          AND u.email_confirmed_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Verified account required';
    END IF;

    IF v_available < p_amount THEN
        RAISE EXCEPTION 'Insufficient Eco Points';
    END IF;

    -- Lock milestone progress to prevent overfunding.
    SELECT *
    INTO v_milestone
    FROM public.milestones m
    WHERE m.id = p_milestone_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Milestone not found';
    END IF;

    IF v_milestone.status <> 'Active'
       OR (
           v_milestone.closing_date IS NOT NULL
           AND v_milestone.closing_date <= now()
       ) THEN
        RAISE EXCEPTION 'Milestone unavailable';
    END IF;

    v_accepted := LEAST(
        p_amount,
        v_milestone.target_points - v_milestone.current_points
    );

    IF v_accepted <= 0 THEN
        RAISE EXCEPTION 'Milestone target reached';
    END IF;

    -- Deduct only the accepted amount, not lifetime points.
    UPDATE public.profiles p
    SET available_eco_points =
        p.available_eco_points - v_accepted
    WHERE p.id = v_user_id
    RETURNING p.available_eco_points INTO v_new_balance;

    -- Record the contribution.
    INSERT INTO public.milestone_contributions (
    milestone_id,
    user_id,
    client_request_id,
    requested_amount,
    amount
)
    VALUES (
    p_milestone_id,
    v_user_id,
    p_client_request_id,
    p_amount,
    v_accepted
);

    -- Update milestone progress.
    UPDATE public.milestones m
    SET
        current_points = m.current_points + v_accepted,
        status = CASE
            WHEN m.current_points + v_accepted >= m.target_points
            THEN 'AwaitingVerification'
            ELSE 'Active'
        END
    WHERE m.id = p_milestone_id
    RETURNING m.current_points, m.status
    INTO v_new_points, v_new_status;

    RETURN QUERY
    SELECT
        v_accepted,
        v_new_balance,
        v_new_points,
        v_new_status;
END;
$$;

-- Do not expose milestone contributions anonymously.
REVOKE ALL ON FUNCTION public.contribute_to_milestone(
    bigint, integer, uuid
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.contribute_to_milestone(
    bigint, integer, uuid
)
TO authenticated;


-- List contributions made by the signed-in user.

CREATE OR REPLACE FUNCTION public.list_my_milestone_contributions()
RETURNS TABLE (
    id bigint,
    milestone_id bigint,
    milestone_name text,
    amount integer,
    created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        mc.id,
        mc.milestone_id,
        m.name AS milestone_name,
        mc.amount,
        mc.created_at
    FROM public.milestone_contributions mc
    JOIN public.milestones m
        ON m.id = mc.milestone_id
    WHERE mc.user_id = (SELECT auth.uid())
    ORDER BY mc.created_at DESC, mc.id DESC;
$$;

REVOKE ALL ON FUNCTION
    public.list_my_milestone_contributions()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
    public.list_my_milestone_contributions()
TO authenticated;


-- RecycleSG: Secure administrator authorization

CREATE TABLE public.app_admins (
    user_id uuid PRIMARY KEY
        REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_admins
ENABLE ROW LEVEL SECURITY;

-- Only trusted server-side processes may manage administrators.
REVOKE ALL ON public.app_admins
FROM PUBLIC, anon, authenticated;

-- Reusable administrator check for backend RPC functions.
CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.app_admins a
        WHERE a.user_id = (SELECT auth.uid())
    );
$$;

REVOKE ALL ON FUNCTION public.is_app_admin()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_app_admin()
TO authenticated;


-- RecycleSG: Administrator milestone review API

CREATE OR REPLACE FUNCTION public.admin_list_milestones_for_review()
RETURNS TABLE (
    id bigint,
    name text,
    description text,
    organisation text,
    target_points integer,
    current_points integer,
    expected_outcome text,
    closing_date timestamptz,
    status text,
    evidence_url text,
    evidence_notes text,
    evidence_requested_note text,
    decided_at timestamptz,
    decision_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Never return administrative information to non-admins.
    IF NOT COALESCE(
        (SELECT public.is_app_admin()),
        false
    ) THEN
        RAISE EXCEPTION 'Administrator access required'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        m.id,
        m.name,
        m.description,
        m.organisation,
        m.target_points,
        m.current_points,
        m.expected_outcome,
        m.closing_date,
        m.status,
        m.evidence_url,
        m.evidence_notes,
        m.evidence_requested_note,
        m.decided_at,
        m.decision_reason
    FROM public.milestones m
    WHERE m.status IN (
        'AwaitingVerification',
        'Verified',
        'Rejected'
    )
    ORDER BY m.created_at DESC, m.id DESC;
END;
$$;

REVOKE ALL ON FUNCTION
    public.admin_list_milestones_for_review()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
    public.admin_list_milestones_for_review()
TO authenticated;
