alter table public.recycling_points
    add column region text,
    add column weekly_hours jsonb,
    add column is_active boolean not null default true;

update public.recycling_points set is_active = false where status = 'Removed';
alter policy "Anyone can view recycling points" on public.recycling_points
    using (is_active and status <> 'Removed');
alter policy "Anyone can view accepted materials" on public.recycling_point_materials
    using (exists (select 1 from public.recycling_points p where p.id = recycling_point_id));

create function public.admin_save_point(p_point_id bigint, p_point jsonb)
returns bigint language plpgsql security definer set search_path='' as $$
declare
    details public.recycling_points;
    hours_slot record;
    saved_id bigint;
begin
    if not public.is_app_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
    select * into details from jsonb_populate_record(null::public.recycling_points,p_point);
    if coalesce(trim(details.name),'')='' or coalesce(trim(details.address),'')=''
       or details.latitude is null or details.longitude is null
       or jsonb_typeof(p_point->'material_ids') is distinct from 'array' then
        raise exception 'Point name, address, coordinates and material IDs required' using errcode='22023';
    end if;
    if details.status = 'Removed' then raise exception 'Use admin_remove_point' using errcode='22023'; end if;
    if details.weekly_hours is not null then
        if jsonb_typeof(details.weekly_hours) <> 'array' then raise exception 'Expected weekly intervals' using errcode='22023'; end if;
        for hours_slot in select * from jsonb_to_recordset(details.weekly_hours) as s("day" integer,"start" integer,"end" integer,week integer)
        loop
            if hours_slot.day is null or hours_slot.start is null or hours_slot."end" is null
               or hours_slot.week not between 1 and 5
               or hours_slot.day not between 1 and 7 or hours_slot.start not between 0 and 1439
               or hours_slot."end" not between 0 and 1440 or hours_slot.start = hours_slot."end" then
                raise exception 'Invalid weekly interval' using errcode='22023';
            end if;
        end loop;
    end if;
    if p_point_id is null then
        insert into public.recycling_points(name,address,latitude,longitude,status,source,region,weekly_hours,operating_hours,is_active)
        values(trim(details.name),trim(details.address),details.latitude,details.longitude,coalesce(details.status,'Available'),
               details.source,nullif(trim(details.region),''),details.weekly_hours,details.operating_hours,coalesce(details.is_active,true))
        returning id into saved_id;
    else
        update public.recycling_points set name=trim(details.name),address=trim(details.address),
            latitude=details.latitude,longitude=details.longitude,status=coalesce(details.status,'Available'),
            source=details.source,region=nullif(trim(details.region),''),weekly_hours=details.weekly_hours,
            operating_hours=details.operating_hours,is_active=coalesce(details.is_active,true),last_updated=now()
        where id=p_point_id returning id into saved_id;
        if not found then raise exception 'Unknown point' using errcode='P0002'; end if;
    end if;
    delete from public.recycling_point_materials where recycling_point_id=saved_id;
    insert into public.recycling_point_materials(recycling_point_id,material_type_id)
        select distinct saved_id, material_id::bigint from jsonb_array_elements_text(p_point->'material_ids') as material_id;
    return saved_id;
end $$;

create function public.admin_remove_point(p_point_id bigint)
returns text language plpgsql security definer set search_path='' as $$
begin
    if not public.is_app_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
    begin
        delete from public.recycling_points where id=p_point_id;
        if not found then raise exception 'Unknown point' using errcode='P0002'; end if;
        return 'deleted';
    exception when foreign_key_violation or restrict_violation then
        update public.recycling_points set is_active=false,status='Removed',last_updated=now() where id=p_point_id;
        return 'archived';
    end;
end $$;

create function public.reject_inactive_point_checkin() returns trigger
language plpgsql security definer set search_path='' as $$
begin
    -- Hold the point until the check-in commits so an administrator cannot retire it mid-request.
    perform 1 from public.recycling_points where id=new.recycling_point_id and is_active and status <> 'Removed' for share;
    if not found then raise exception 'Inactive or unknown point' using errcode='P0002'; end if;
    return new;
end $$;
create trigger active_point_check before insert on public.check_ins for each row execute function public.reject_inactive_point_checkin();
revoke all on function public.reject_inactive_point_checkin() from public,anon,authenticated;

create function public.recycling_point_open_now(p_point_id bigint,p_at timestamptz default now())
returns boolean language sql stable security invoker set search_path='' as $$
    with local_clock as (
        select sgt::date as local_date, extract(isodow from sgt)::int as day,
               (extract(hour from sgt)*60+extract(minute from sgt))::int as minute
        from (select p_at at time zone 'Asia/Singapore' sgt) t
    )
    select case when p.status in ('Temporarily Closed','Inaccessible','Removed') then false
        when p.weekly_hours is null or p_at is null then null
        else exists (
            select 1 from jsonb_to_recordset(p.weekly_hours) s("day" int,"start" int,"end" int,week int),local_clock t
            where ((s.day=t.day and t.minute>=s.start and (s.start>s."end" or t.minute<s."end"))
               or (s.start>s."end" and t.day=1+s.day%7 and t.minute<s."end"))
              and (s.week is null or s.week = 1 + (extract(day from
                case when s.day=t.day then t.local_date else t.local_date-1 end)::int - 1) / 7)
        ) end
    from public.recycling_points p where p.id=p_point_id;
$$;

create function public.find_recycling_points(p_latitude float8,p_longitude float8,p_radius_km float8 default 5,
    p_limit integer default 20,p_open_only boolean default false,p_at timestamptz default now())
returns table(id bigint,name text,address text,latitude float8,longitude float8,status text,distance_km float8,is_open boolean)
language sql stable security invoker set search_path='' as $$
    select p.id,p.name,p.address,p.latitude,p.longitude,p.status,d.distance_km,h.is_open
    from public.recycling_points p
    cross join lateral (select 12742 * asin(sqrt(least(1.0,
        sin(radians(p.latitude-p_latitude)/2)^2 + cos(radians(p_latitude))*cos(radians(p.latitude))*
        sin(radians(p.longitude-p_longitude)/2)^2))) distance_km) d
    cross join lateral (select public.recycling_point_open_now(p.id,p_at) is_open) h
    where p.is_active and p.status <> 'Removed'
      and p_latitude between -90 and 90 and p_longitude between -180 and 180
      and p_radius_km>0 and p_limit between 1 and 100 and d.distance_km<=p_radius_km
      and (not p_open_only or h.is_open)
    order by d.distance_km,p.id limit p_limit;
$$;

create function public.admin_usage_stats(p_from date,p_until date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
    period_start timestamptz := p_from::timestamp at time zone 'Asia/Singapore';
    period_end timestamptz := p_until::timestamp at time zone 'Asia/Singapore';
    result jsonb;
begin
    if not public.is_app_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
    if p_from is null or p_until is null or p_until<=p_from then raise exception 'Invalid date interval' using errcode='22023'; end if;
    with visits as (
        select user_id,recycling_point_id from public.check_ins
        where checked_in_at>=period_start and checked_in_at<period_end
    ), verified as (
        select material_type_id,quantity from public.recycling_actions
        where verification_status='Verified' and verified_at>=period_start and verified_at<period_end
    ), busy as (
        select p.id,p.name,count(*) check_ins from visits join public.recycling_points p on p.id=visits.recycling_point_id
        group by p.id,p.name order by check_ins desc,p.id limit 10
    ), quantities as (
        select m.id,m.name,sum(v.quantity) quantity from verified v join public.material_types m on v.material_type_id=m.id
        group by m.id,m.name
    )
    select jsonb_build_object(
        'active_users',(select count(distinct user_id) from visits),
        'verified_actions',(select count(*) from verified),
        'most_used_points',coalesce((select jsonb_agg(to_jsonb(b) order by b.check_ins desc,b.id) from busy b),'[]'),
        'items_by_material',coalesce((select jsonb_agg(to_jsonb(q) order by q.quantity desc,q.id) from quantities q),'[]')
    ) into result;
    return result;
end $$;

revoke all on function public.admin_save_point(bigint,jsonb),public.admin_remove_point(bigint),
  public.admin_usage_stats(date,date),public.recycling_point_open_now(bigint,timestamptz),
  public.find_recycling_points(float8,float8,float8,integer,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.admin_save_point(bigint,jsonb),public.admin_remove_point(bigint),
  public.admin_usage_stats(date,date) to authenticated;
grant execute on function public.recycling_point_open_now(bigint,timestamptz),
  public.find_recycling_points(float8,float8,float8,integer,boolean,timestamptz) to anon,authenticated;

-- Pin an offline item's account to the JWT actually used for this request.
create function public.submit_owned_point_report(p_owner_id uuid,p_recycling_point_id bigint,
    p_category text,p_description text,p_client_request_id uuid)
returns bigint language plpgsql security invoker set search_path='' as $$
begin
    if p_owner_id is null or auth.uid() is distinct from p_owner_id then
        raise exception 'Report belongs to another account' using errcode='42501';
    end if;
    return public.submit_point_report(p_recycling_point_id,p_category,p_description,p_client_request_id);
end $$;
revoke all on function public.submit_owned_point_report(uuid,bigint,text,text,uuid) from public,anon,authenticated;
grant execute on function public.submit_owned_point_report(uuid,bigint,text,text,uuid) to authenticated;

create function public.admin_list_points(p_after_id bigint default null,p_limit integer default 20,p_active boolean default null)
returns table(id bigint,name text,address text,latitude float8,longitude float8,status text,region text,
    source text,is_active boolean,weekly_hours jsonb,operating_hours text,material_ids bigint[])
language plpgsql stable security definer set search_path='' as $$
begin
    if not public.is_app_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
    return query
        select p.id,p.name,p.address,p.latitude,p.longitude,p.status,p.region,p.source,p.is_active,p.weekly_hours,p.operating_hours,
               array(select m.material_type_id from public.recycling_point_materials m where m.recycling_point_id=p.id order by m.material_type_id)
        from public.recycling_points p where (p_after_id is null or p.id>p_after_id) and (p_active is null or p.is_active=p_active)
        order by p.id limit least(100,greatest(1,coalesce(p_limit,20)));
end $$;
revoke all on function public.admin_list_points(bigint,integer,boolean) from public,anon,authenticated;
grant execute on function public.admin_list_points(bigint,integer,boolean) to authenticated;
