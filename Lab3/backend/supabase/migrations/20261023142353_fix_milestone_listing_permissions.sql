-- Allow the milestone listing function to read the
-- underlying table without exposing restricted columns.

ALTER FUNCTION public.list_milestones()
SECURITY DEFINER
SET search_path = '';

REVOKE ALL ON FUNCTION public.list_milestones()
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.list_milestones()
TO anon, authenticated;