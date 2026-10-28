
-- RecycleSG: Explicit Data API permissions
-- Ensures public recycling data remains accessible
-- on fresh Supabase installations.

GRANT USAGE ON SCHEMA public
TO anon, authenticated;

-- Public recycling information
GRANT SELECT ON TABLE
    public.recycling_points,
    public.material_types,
    public.recycling_point_materials
TO anon, authenticated;

-- Private user data: authenticated access only.
-- Existing RLS policies restrict users to their own rows.
GRANT SELECT ON TABLE
    public.profiles,
    public.check_ins,
    public.recycling_actions,
    public.reward_transactions
TO authenticated;

-- Do not grant INSERT, UPDATE or DELETE permissions.
-- Protected writes remain controlled by existing policies
-- and trusted backend functions.
