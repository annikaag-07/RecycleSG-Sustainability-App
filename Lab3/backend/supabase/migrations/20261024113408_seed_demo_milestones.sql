
-- Seed three demo milestones without duplicates.

INSERT INTO public.milestones (
    name,
    description,
    organisation,
    target_points,
    expected_outcome
)
SELECT
    m.name,
    m.description,
    m.organisation,
    m.target_points,
    m.expected_outcome
FROM (
    VALUES
        (
            'Clean & Green Singapore',
            'Support community recycling and cleaner neighbourhoods.',
            'RecycleSG Community',
            1000,
            'Encourage responsible recycling across Singapore.'
        ),
        (
            'Plastic-Free Future',
            'Work together to reduce plastic waste.',
            'RecycleSG Community',
            2500,
            'Promote better plastic recycling habits.'
        ),
        (
            'Towards Zero Waste',
            'Help build a more sustainable Singapore.',
            'RecycleSG Community',
            5000,
            'Support long-term waste reduction efforts.'
        )
) AS m(
    name,
    description,
    organisation,
    target_points,
    expected_outcome
)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.milestones existing
    WHERE existing.name = m.name
);
