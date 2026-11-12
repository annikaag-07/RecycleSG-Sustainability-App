create function public.list_my_blocks()
returns table(user_id uuid, username text, display_name text)
language sql stable security definer set search_path = '' as $$
    select p.id, p.username, p.display_name
    from social.blocks b
    join public.profiles p on p.id = b.blocked
    where b.blocker = (select auth.uid())
    order by lower(p.display_name) nulls last, p.id
$$;

revoke all on function public.list_my_blocks() from public, anon, service_role;
grant execute on function public.list_my_blocks() to authenticated;
