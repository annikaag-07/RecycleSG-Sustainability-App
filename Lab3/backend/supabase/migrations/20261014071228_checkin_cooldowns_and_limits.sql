
-- RecycleSG: Check-in cooldowns and daily limits
-- 30 minutes per recycling point
-- Maximum 10 check-ins per user per UTC day

CREATE OR REPLACE FUNCTION public.enforce_checkin_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_today_start TIMESTAMPTZ;
BEGIN
    -- Serialize check-in attempts from the same user.
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(NEW.user_id::TEXT, 0)
    );

    -- 30-minute cooldown for the same recycling point
    IF EXISTS (
        SELECT 1
        FROM public.check_ins
        WHERE user_id = NEW.user_id
          AND recycling_point_id = NEW.recycling_point_id
          AND checked_in_at > CURRENT_TIMESTAMP - INTERVAL '30 minutes'
    ) THEN
        RAISE EXCEPTION
            'Check-in cooldown active. Try again after 30 minutes.';
    END IF;

    -- Start of current UTC day
    v_today_start := DATE_TRUNC(
        'day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
    ) AT TIME ZONE 'UTC';

    -- Maximum 10 check-ins per UTC day
    IF (
        SELECT COUNT(*)
        FROM public.check_ins
        WHERE user_id = NEW.user_id
          AND checked_in_at >= v_today_start
    ) >= 10 THEN
        RAISE EXCEPTION
            'Daily check-in limit reached.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS checkin_limits_trigger
ON public.check_ins;

CREATE TRIGGER checkin_limits_trigger
BEFORE INSERT ON public.check_ins
FOR EACH ROW
EXECUTE FUNCTION public.enforce_checkin_limits();

-- Prevent API roles from invoking the trigger function directly
REVOKE ALL ON FUNCTION public.enforce_checkin_limits()
FROM PUBLIC, anon, authenticated;
