
-- Restrict direct milestone reads to public fields.

REVOKE SELECT ON TABLE public.milestones
FROM anon, authenticated;

GRANT SELECT (
    id,
    name,
    description,
    organisation,
    target_points,
    current_points,
    expected_outcome,
    closing_date,
    status
)
ON TABLE public.milestones
TO anon, authenticated;
