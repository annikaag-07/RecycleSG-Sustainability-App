create table public.material_rewards (
    material_id bigint primary key references public.material_types on delete cascade,
    points_per_unit integer not null check (points_per_unit between 1 and 1000),
    xp_per_unit integer not null check (xp_per_unit between 1 and 1000)
);
create table public.level_rule (
    singleton boolean primary key check(singleton),
    xp_step integer not null check(xp_step between 1 and 1000000)
);
insert into public.level_rule values(true,100);
create table public.seasonal_events (
    id bigint generated always as identity primary key,
    name text not null check(btrim(name) <> ''),
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    multiplier integer not null check(multiplier between 1 and 10),
    check(ends_at>starts_at)
);
alter table public.level_rule enable row level security;
alter table public.seasonal_events enable row level security;
alter table public.material_rewards enable row level security;
revoke all on public.material_rewards,public.level_rule,public.seasonal_events from public,anon,authenticated;

create function public.require_game_admin() returns void language plpgsql stable set search_path='' as $$
begin
    if not public.is_app_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
end $$;

create function public.admin_set_material_reward(p_material_id bigint,p_points_per_unit integer,p_xp_per_unit integer)
returns void language plpgsql security definer set search_path='' as $$
begin
    perform public.require_game_admin();
    insert into public.material_rewards values(p_material_id,p_points_per_unit,p_xp_per_unit)
    on conflict(material_id) do update set points_per_unit=excluded.points_per_unit,xp_per_unit=excluded.xp_per_unit;
end $$;
create function public.admin_set_level_step(p_xp_step integer)
returns void language plpgsql security definer set search_path='' as $$
begin
    perform public.require_game_admin();
    update public.level_rule set xp_step=p_xp_step;
end $$;

create function public.admin_save_season(p_id bigint,p_name text,p_starts_at timestamptz,p_ends_at timestamptz,p_multiplier integer)
returns bigint language plpgsql security definer set search_path='' as $$
begin
    perform public.require_game_admin();
    if p_id is null then
        insert into public.seasonal_events(name,starts_at,ends_at,multiplier)
        values(p_name,p_starts_at,p_ends_at,p_multiplier) returning id into p_id;
    else
        update public.seasonal_events set name=p_name,starts_at=p_starts_at,ends_at=p_ends_at,multiplier=p_multiplier
        where id=p_id;
        if not found then raise exception 'Season unavailable' using errcode='P0002'; end if;
    end if;
    return p_id;
end $$;

create function public.admin_save_quest(p_id bigint,p_title text,p_description text,p_quest_type text,p_target_actions integer,
    p_reward_eco_points integer,p_reward_xp integer,p_is_active boolean)
returns bigint language plpgsql security definer set search_path='' as $$
begin
    perform public.require_game_admin();
    if nullif(btrim(p_title),'') is null then raise exception 'Quest title required' using errcode='22023'; end if;
    if p_id is null then
        insert into public.quests(title,description,quest_type,target_actions,reward_eco_points,reward_xp,is_active)
        values(p_title,p_description,p_quest_type,p_target_actions,p_reward_eco_points,p_reward_xp,p_is_active)
        returning id into p_id;
    else
        update public.quests set title=p_title,description=p_description,quest_type=p_quest_type,target_actions=p_target_actions,
            reward_eco_points=p_reward_eco_points,reward_xp=p_reward_xp,is_active=p_is_active where id=p_id;
        if not found then raise exception 'Quest unavailable' using errcode='P0002'; end if;
    end if;
    return p_id;
end $$;
alter table public.reward_transactions
    drop constraint reward_transactions_eco_points_earned_check,
    drop constraint reward_transactions_xp_earned_check,
    add check (eco_points_earned >= 0 and xp_earned >= 0);

create or replace function public.award_verified_recycling()
returns trigger language plpgsql security definer set search_path='' as $$
declare
    points integer;
    experience integer;
    bonus integer;
begin
    if new.verification_status is distinct from 'Verified' or old.verification_status='Verified' then return new; end if;
    select coalesce(max(multiplier),1) into bonus from public.seasonal_events
    where new.created_at >= starts_at and new.created_at < ends_at;
    select coalesce(r.points_per_unit,10)*new.quantity*bonus,coalesce(r.xp_per_unit,10)*new.quantity*bonus
    into points,experience from public.material_types m left join public.material_rewards r on r.material_id=m.id
    where m.id=new.material_type_id;
    insert into public.reward_transactions(user_id,recycling_action_id,eco_points_earned,xp_earned)
    values(new.user_id,new.id,points,experience) on conflict(recycling_action_id) do nothing;
    if found then
        update public.profiles set eco_points=eco_points+points,available_eco_points=available_eco_points+points,
            xp=xp+experience where id=new.user_id;
    end if;
    return new;
end $$;

-- Quest claims and recycling awards both change XP. Keep already earned levels after a rule edit.
create function public.set_reward_level() returns trigger language plpgsql security definer set search_path='' as $$
begin
    new.level := greatest(old.level,1+(new.xp/(select xp_step from public.level_rule)));
    return new;
end $$;
create trigger set_reward_level before update of xp on public.profiles
for each row when(old.xp is distinct from new.xp or old.level is distinct from new.level) execute function public.set_reward_level();

alter table public.badges add column criterion text not null default 'verified_actions'
    check(criterion in ('verified_actions','streak','regions'));
insert into public.badges(name,description,required_verified_actions,criterion) values
    ('One Green Week','Recycle on seven consecutive Singapore calendar days',7,'streak'),
    ('Regional Recycler','Recycle at points in two named regions',2,'regions');

create index recycling_actions_verified_progress on public.recycling_actions(user_id,created_at)
    where verification_status='Verified';

create function public.progress_stats(p_user_id uuid,p_as_of date)
returns table(verified_actions integer,current_streak integer,best_streak integer,regions integer)
language sql stable security definer set search_path='' as $$
    with actions as (
        select (a.created_at at time zone 'Asia/Singapore')::date as day,lower(nullif(btrim(p.region),'')) as region
        from public.recycling_actions a join public.check_ins c on c.id=a.check_in_id
        join public.recycling_points p on p.id=c.recycling_point_id
        where a.user_id=p_user_id and a.verification_status='Verified'
          and a.created_at < ((p_as_of+1)::timestamp at time zone 'Asia/Singapore')
    ), days as (select distinct day from actions), runs as (
        select day,day-row_number() over(order by day)::integer as island from days
    ), lengths as (select max(day) as last_day,count(*)::integer as len from runs group by island)
    select (select count(*)::integer from actions),
        coalesce(max(len) filter(where last_day >= p_as_of-1),0),
        coalesce(max(len),0),(select count(distinct region)::integer from actions) from lengths
$$;

create function public.get_my_streak() returns integer language sql stable security definer set search_path='' as $$
    select s.current_streak from public.progress_stats(auth.uid(),(now() at time zone 'Asia/Singapore')::date) s
$$;

create function public.badge_progress(p_user_id uuid)
returns table(id bigint,name text,description text,criterion text,target integer,progress integer,earned_at timestamptz)
language sql stable security definer set search_path='' as $$
    select b.id,b.name,b.description,b.criterion,b.required_verified_actions,
        case b.criterion when 'regions' then s.regions when 'streak' then s.best_streak else s.verified_actions end,
        ub.earned_at
    from public.badges b cross join public.progress_stats(p_user_id,(now() at time zone 'Asia/Singapore')::date) s
    left join public.user_badges ub on ub.badge_id=b.id and ub.user_id=p_user_id order by b.id
$$;
create function public.list_my_badge_progress()
returns table(id bigint,name text,description text,criterion text,target integer,progress integer,earned_at timestamptz)
language sql stable security definer set search_path='' as $$
    select * from public.badge_progress(auth.uid())
$$;

create function public.admin_save_badge(p_id bigint,p_name text,p_description text,p_criterion text,p_target integer)
returns bigint language plpgsql security definer set search_path='' as $$
begin
    perform public.require_game_admin();
    if nullif(btrim(p_name),'') is null then raise exception 'Badge name required' using errcode='22023'; end if;
    if p_id is null then
        insert into public.badges(name,description,required_verified_actions,criterion)
        values(p_name,p_description,p_target,p_criterion) returning id into p_id;
    else
        update public.badges set name=p_name,description=p_description,criterion=p_criterion,required_verified_actions=p_target
        where id=p_id;
        if not found then raise exception 'Badge unavailable' using errcode='P0002'; end if;
    end if;
    insert into public.user_badges(user_id,badge_id)
    select u.id,p_id from public.profiles u cross join lateral public.badge_progress(u.id) b
    where b.id=p_id and b.progress>=b.target and b.earned_at is null on conflict do nothing;
    return p_id;
end $$;
create function public.admin_get_game_rules()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
    perform public.require_game_admin();
    return jsonb_build_object('xp_step',(select xp_step from public.level_rule),
        'materials',(select coalesce(jsonb_agg(to_jsonb(rule) order by material_id),'[]') from (
            select m.id as material_id,m.name,coalesce(r.points_per_unit,10) as points_per_unit,
              coalesce(r.xp_per_unit,10) as xp_per_unit from public.material_types m
              left join public.material_rewards r on m.id=r.material_id) rule),
        'seasons',(select coalesce(jsonb_agg(to_jsonb(s) order by id),'[]') from public.seasonal_events s),
        'quests',(select coalesce(jsonb_agg(to_jsonb(q) order by id),'[]') from public.quests q),
        'badges',(select coalesce(jsonb_agg(to_jsonb(b) order by id),'[]') from public.badges b));
end $$;

create or replace function public.award_recycling_badges()
returns trigger language plpgsql security definer set search_path='' as $$
begin
    if new.verification_status is distinct from 'Verified' or old.verification_status='Verified' then return new; end if;
    perform 1 from public.profiles where id=new.user_id for update;
    insert into public.user_badges(user_id,badge_id)
    select new.user_id,b.id from public.badge_progress(new.user_id) b where b.progress>=b.target and b.earned_at is null
    on conflict do nothing;
    return new;
end $$;

insert into public.user_badges(user_id,badge_id)
select p.id,b.id from public.profiles p cross join lateral public.badge_progress(p.id) b
where b.progress>=b.target and b.earned_at is null on conflict do nothing;

create function public.notify_progress_award()
returns trigger language plpgsql security definer set search_path='' as $$
begin
    case tg_table_name
        when 'profiles' then
            perform public.enqueue_notification(new.id,'progress','level_up',new.level::text,jsonb_build_object('level',new.level));
        when 'user_badges' then
            perform public.enqueue_notification(new.user_id,'progress','badge_earned',new.badge_id::text,jsonb_build_object('badge_id',new.badge_id));
        when 'user_quest_progress' then
            perform public.enqueue_notification(new.user_id,'progress','quest_completed',new.id::text,
                jsonb_build_object('quest_id',new.quest_id,'period_start',new.period_start));
    end case;
    return new;
end $$;
create trigger notify_level_up after update on public.profiles for each row when(new.level>old.level)
execute function public.notify_progress_award();
create trigger notify_badge after insert on public.user_badges for each row execute function public.notify_progress_award();
create trigger notify_completed_quest_insert after insert on public.user_quest_progress for each row
when(new.completed_at is not null) execute function public.notify_progress_award();
create trigger notify_completed_quest_update after update on public.user_quest_progress for each row
when(new.completed_at is not null and old.completed_at is null) execute function public.notify_progress_award();

create function public.send_streak_reminders(p_now timestamptz default now()) returns void
language plpgsql security definer set search_path='' as $$
declare
    evening timestamp := p_now at time zone 'Asia/Singapore';
    recipient uuid;
begin
    if evening::time < time '20:00' then return; end if;
    for recipient in select n.user_id from public.notification_preferences n
        where n.streak_reminder and exists (select 1 from public.recycling_actions a where a.user_id=n.user_id
            and a.verification_status='Verified' and a.created_at >= ((evening::date-1)::timestamp at time zone 'Asia/Singapore')
            and a.created_at < (evening::date::timestamp at time zone 'Asia/Singapore'))
        and not exists (select 1 from public.recycling_actions a where a.user_id=n.user_id and a.verification_status='Verified'
            and a.created_at >= (evening::date::timestamp at time zone 'Asia/Singapore') and a.created_at <= p_now)
    loop
        perform public.enqueue_notification(recipient,'streak_reminder','streak_at_risk',evening::date::text,
            jsonb_build_object('local_date',evening::date));
    end loop;
end $$;

revoke all on function public.require_game_admin(),public.progress_stats(uuid,date),public.badge_progress(uuid),
    public.set_reward_level(),public.notify_progress_award(),public.send_streak_reminders(timestamptz)
    from public,anon,authenticated;
grant execute on function public.send_streak_reminders(timestamptz) to service_role;

revoke all on function public.admin_set_material_reward(bigint,integer,integer),public.admin_set_level_step(integer),
    public.admin_save_season(bigint,text,timestamptz,timestamptz,integer),public.admin_get_game_rules(),
    public.admin_save_quest(bigint,text,text,text,integer,integer,integer,boolean),
    public.admin_save_badge(bigint,text,text,text,integer),public.get_my_streak(),public.list_my_badge_progress()
    from public,anon,authenticated;
grant execute on function public.admin_set_material_reward(bigint,integer,integer),public.admin_set_level_step(integer),
    public.admin_save_season(bigint,text,timestamptz,timestamptz,integer),public.admin_get_game_rules(),
    public.admin_save_quest(bigint,text,text,text,integer,integer,integer,boolean),
    public.admin_save_badge(bigint,text,text,text,integer),public.get_my_streak(),public.list_my_badge_progress()
    to authenticated;

do $$
begin
    if exists(select 1 from pg_available_extensions where name='pg_cron') then
        create extension if not exists pg_cron;
        perform cron.schedule('recyclesg-streak-reminder','0 12 * * *','select public.send_streak_reminders()');
    end if;
end $$;
