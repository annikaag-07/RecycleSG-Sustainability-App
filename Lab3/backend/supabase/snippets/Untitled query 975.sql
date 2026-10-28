
SELECT
    has_table_privilege(
        'authenticated',
        'public.profiles',
        'SELECT'
    ) AS can_read_profiles,

    has_column_privilege(
        'authenticated',
        'public.profiles',
        'display_name',
        'UPDATE'
    ) AS can_edit_display_name,

    has_column_privilege(
        'authenticated',
        'public.profiles',
        'eco_points',
        'UPDATE'
    ) AS can_edit_eco_points,

    has_table_privilege(
        'authenticated',
        'public.recycling_actions',
        'UPDATE'
    ) AS can_modify_recycling_actions;
