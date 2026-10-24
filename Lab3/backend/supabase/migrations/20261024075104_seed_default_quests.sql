
-- Default RecycleSG quests
-- Safe to rerun without creating duplicate quests.

INSERT INTO public.quests (
    title,
    description,
    quest_type,
    target_actions,
    reward_eco_points,
    reward_xp
)
SELECT
    q.title,
    q.description,
    q.quest_type,
    q.target_actions,
    q.reward_eco_points,
    q.reward_xp
FROM (
    VALUES
        (
            'Daily Recycler',
            'Verify 2 recycling activities today',
            'daily', 2, 20, 20
        ),
        (
            'Weekly Eco Champion',
            'Verify 5 recycling activities this week',
            'weekly', 5, 50, 50
        ),
        (
            'First Recycling Mission',
            'Verify your first recycling activity',
            'one_time', 1, 10, 10
        )
) AS q(
    title,
    description,
    quest_type,
    target_actions,
    reward_eco_points,
    reward_xp
)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.quests existing
    WHERE existing.title = q.title
);
