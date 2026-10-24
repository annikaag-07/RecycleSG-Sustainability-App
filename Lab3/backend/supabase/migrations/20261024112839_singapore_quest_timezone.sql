CREATE OR REPLACE FUNCTION public.track_verified_quest_progress()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_quest record;
    v_period_start date;
BEGIN
    -- Count only the first transition into Verified.
    IF NEW.verification_status IS DISTINCT FROM 'Verified'
       OR OLD.verification_status IS NOT DISTINCT FROM 'Verified'
    THEN
        RETURN NEW;
    END IF;

    FOR v_quest IN
        SELECT id, quest_type, target_actions
        FROM public.quests
        WHERE is_active = true
    LOOP
        -- Use the verification date in UTC.
        IF v_quest.quest_type = 'daily' THEN
            v_period_start := (now() AT TIME ZONE 'Asia/Singapore')::date;

        ELSIF v_quest.quest_type = 'weekly' THEN
            v_period_start :=
                date_trunc('week', now() AT TIME ZONE 'Asia/Singapore')::date;

        ELSE
            v_period_start := DATE '1970-01-01';
        END IF;

        INSERT INTO public.user_quest_progress (
            user_id,
            quest_id,
            period_start,
            progress,
            completed_at
        )
        VALUES (
            NEW.user_id,
            v_quest.id,
            v_period_start,
            1,
            CASE
                WHEN v_quest.target_actions <= 1 THEN now()
                ELSE NULL
            END
        )
        ON CONFLICT (user_id, quest_id, period_start)
        DO UPDATE SET
            progress = LEAST(
                public.user_quest_progress.progress + 1,
                v_quest.target_actions
            ),
            completed_at = CASE
                WHEN public.user_quest_progress.progress + 1
                     >= v_quest.target_actions
                THEN COALESCE(
                    public.user_quest_progress.completed_at,
                    now()
                )
                ELSE public.user_quest_progress.completed_at
            END
        WHERE public.user_quest_progress.completed_at IS NULL;
    END LOOP;

    RETURN NEW;
END;
$function$
