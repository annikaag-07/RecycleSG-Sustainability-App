
-- RecycleSG: Public Recycling Information
-- Allow users to read recycling locations and materials.
-- No client-side write permissions are granted.

REVOKE ALL ON TABLE
    public.recycling_points,
    public.material_types,
    public.recycling_point_materials
FROM anon, authenticated;

GRANT SELECT ON TABLE
    public.recycling_points,
    public.material_types,
    public.recycling_point_materials
TO anon, authenticated;

CREATE POLICY "Anyone can view recycling points"
ON public.recycling_points
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Anyone can view material types"
ON public.material_types
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Anyone can view accepted materials"
ON public.recycling_point_materials
FOR SELECT
TO anon, authenticated
USING (true);

-- ============================================
-- RecycleSG: User Profile Security
-- ============================================

-- Remove broad client permissions
REVOKE ALL ON TABLE public.profiles
FROM anon, authenticated;

-- Users can read their own profile
GRANT SELECT ON TABLE public.profiles
TO authenticated;

-- Allow updates only to editable profile fields
GRANT UPDATE (
    username,
    display_name,
    avatar_url,
    bio
)
ON public.profiles
TO authenticated;

-- Restrict updates to the user's own profile
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = id)
WITH CHECK ((SELECT auth.uid()) = id);

-- ============================================
-- RecycleSG: Check-in and Activity Security
-- ============================================

-- Remove direct client write permissions
REVOKE ALL ON TABLE
    public.check_ins,
    public.recycling_actions
FROM anon, authenticated;

-- Authenticated users may read records
GRANT SELECT ON TABLE
    public.check_ins,
    public.recycling_actions
TO authenticated;

-- Users can view their own check-ins
CREATE POLICY "Users can view own check-ins"
ON public.check_ins
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

-- Users can view their own recycling actions
CREATE POLICY "Users can view own recycling actions"
ON public.recycling_actions
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);
