-- Private per-user rows must not inherit anonymous table grants on older projects.
REVOKE ALL ON TABLE public.user_badges, public.user_quest_progress FROM anon;
-- Trigger execution does not need browser roles to call the function directly.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
-- Explicit server reads keep the verifier working when default grants are disabled.
GRANT SELECT ON TABLE public.recycling_actions, public.material_types TO service_role;
