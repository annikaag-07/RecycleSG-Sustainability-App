create function public.estimate_recycling_reward(
    p_material_type_id bigint,
    p_quantity integer,
    p_submitted_at timestamptz default now()
)
returns table(eco_points integer, xp integer)
language plpgsql stable security definer set search_path = '' as $$
begin
    if p_quantity is null or p_quantity not between 1 and 100 or p_submitted_at is null then
        raise exception 'Quantity must be 1 to 100 and submission time is required' using errcode='22023';
    end if;
    return query
        select coalesce(r.points_per_unit,10) * p_quantity * s.bonus,
               coalesce(r.xp_per_unit,10) * p_quantity * s.bonus
        from public.material_types m
        left join public.material_rewards r on r.material_id=m.id
        cross join (
            select coalesce(max(multiplier),1) as bonus from public.seasonal_events
            where p_submitted_at >= starts_at and p_submitted_at < ends_at
        ) s
        where m.id=p_material_type_id;
    if not found then
        raise exception 'Unknown material' using errcode='P0002';
    end if;
end $$;

create function public.get_my_level_progress()
returns table(level integer, xp integer, xp_step integer, next_level_xp bigint, remaining_xp bigint)
language sql stable security definer set search_path = '' as $$
    select p.level, p.xp, r.xp_step, p.level::bigint * r.xp_step,
           greatest(0::bigint, p.level::bigint * r.xp_step - p.xp)
    from public.profiles p cross join public.level_rule r
    where p.id = auth.uid()
$$;

revoke all on function public.estimate_recycling_reward(bigint,integer,timestamptz),
    public.get_my_level_progress() from public, anon, authenticated;
grant execute on function public.estimate_recycling_reward(bigint,integer,timestamptz),
    public.get_my_level_progress() to authenticated;

create or replace function public.award_verified_recycling()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
    award record;
begin
    if new.verification_status is distinct from 'Verified' or old.verification_status='Verified' then
        return new;
    end if;
    select * into strict award from public.estimate_recycling_reward(new.material_type_id,new.quantity,new.created_at);
    insert into public.reward_transactions(user_id,recycling_action_id,eco_points_earned,xp_earned)
    values (new.user_id,new.id,award.eco_points,award.xp) on conflict (recycling_action_id) do nothing;
    if found then
        update public.profiles set eco_points=eco_points+award.eco_points,
            available_eco_points=available_eco_points+award.eco_points, xp=xp+award.xp
        where id=new.user_id;
    end if;
    return new;
end $$;
