
-- Check permissions for authenticated users

SELECT
    has_table_privilege(
        'authenticated',
        'public.check_ins',
        'INSERT'
    ) AS can_create_checkin,

    has_table_privilege(
        'authenticated',
        'public.recycling_actions',
        'INSERT'
    ) AS can_create_recycling_action,

    has_column_privilege(
        'authenticated',
        'public.recycling_actions',
        'verification_status',
        'UPDATE'
    ) AS can_change_verification,

    has_column_privilege(
        'authenticated',
        'public.profiles',
        'available_eco_points',
        'UPDATE'
    ) AS can_change_points;
