
-- RecycleSG: Secure recycling photo storage

-- Recreate bucket configuration on fresh deployments.
INSERT INTO storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
VALUES (
    'recycling-photos',
    'recycling-photos',
    false,
    5242880,
    ARRAY[
        'image/jpeg',
        'image/png',
        'image/webp'
    ]
)
ON CONFLICT (id) DO NOTHING;

-- Users may upload photos only to their own folder.
CREATE POLICY "Users upload own recycling photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'recycling-photos'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
);

-- Users may view only their own photos.
CREATE POLICY "Users view own recycling photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'recycling-photos'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
);
