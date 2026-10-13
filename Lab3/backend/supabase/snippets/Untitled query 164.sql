
-- Test profile privacy using simulated users

BEGIN;

-- Create two temporary test profiles
-- The auth.users records must exist first.

INSERT INTO auth.users (
    id, instance_id, aud, role,
    email, encrypted_password,
    created_at, updated_at
)
VALUES
(
    '11111111-1111-4111-8111-111111111111',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'testa@example.com', '',
    NOW(), NOW()
),
(
    '22222222-2222-4222-8222-222222222222',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'testb@example.com', '',
    NOW(), NOW()
);

INSERT INTO public.profiles (id, username)
VALUES
('11111111-1111-4111-8111-111111111111', 'test_user_a'),
('22222222-2222-4222-8222-222222222222', 'test_user_b');

-- Simulate User A
SET LOCAL ROLE authenticated;

SELECT set_config(
    'request.jwt.claim.sub',
    '11111111-1111-4111-8111-111111111111',
    true
);

-- User A should only see their own profile
SELECT id, username
FROM public.profiles;

ROLLBACK;
