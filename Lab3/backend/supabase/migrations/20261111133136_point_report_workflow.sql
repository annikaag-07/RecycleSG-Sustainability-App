create table public.point_reports (
    id bigint generated always as identity primary key,
    user_id uuid references public.profiles on delete set null,
    recycling_point_id bigint not null references public.recycling_points,
    client_request_id uuid not null,
    category text not null check (category in ('full','missing_or_damaged','wrong_info','contaminated')),
    description text,
    status text not null default 'Pending' check (status in ('Pending','Resolved','Dismissed')),
    created_at timestamptz not null default now(),
    reviewed_by uuid references public.profiles on delete set null,
    reviewed_at timestamptz,
    review_note text,
    unique (user_id, client_request_id)
);
alter table public.point_reports enable row level security;
revoke all on public.point_reports from public, anon, authenticated;
create index point_reports_pending_idx on public.point_reports(id) where status = 'Pending';

create function public.submit_point_report(p_recycling_point_id bigint, p_category text,
    p_description text, p_client_request_id uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
    caller uuid := auth.uid();
    report_id bigint;
begin
    if not exists (select 1 from auth.users where id = caller and email_confirmed_at is not null) then
        raise exception 'Verified account required' using errcode = '42501';
    end if;
    if p_client_request_id is null or p_recycling_point_id is null or p_category is null
       or p_category not in ('full','missing_or_damaged','wrong_info','contaminated') then
        raise exception 'Invalid report inputs' using errcode = '22023';
    end if;
    insert into public.point_reports as r (user_id,recycling_point_id,category,description,client_request_id)
    values (caller,p_recycling_point_id,p_category,p_description,p_client_request_id)
    on conflict (user_id,client_request_id) do update set client_request_id = excluded.client_request_id
        where r.recycling_point_id = excluded.recycling_point_id and r.category = excluded.category
          and r.description is not distinct from excluded.description
    returning id into report_id;
    if report_id is null then
        raise exception 'Request ID reused with a different report' using errcode = '22023';
    end if;
    return report_id;
end $$;

create function public.admin_list_point_reports(p_before_id bigint default null,p_limit integer default 20)
returns table(id bigint,recycling_point_id bigint,category text,description text,created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
    if not public.is_app_admin() then raise exception 'Administrator required' using errcode = '42501'; end if;
    return query select r.id,r.recycling_point_id,r.category,r.description,r.created_at
        from public.point_reports r where status = 'Pending' and (p_before_id is null or r.id < p_before_id)
        order by r.id desc limit least(100,greatest(1,coalesce(p_limit,20)));
end $$;

create function public.admin_review_point_report(p_report_id bigint,p_resolution text,p_note text)
returns text language plpgsql security definer set search_path = '' as $$
begin
    if not public.is_app_admin() then raise exception 'Administrator required' using errcode = '42501'; end if;
    if p_resolution is null or p_resolution not in ('Resolved','Dismissed') then
        raise exception 'Invalid report resolution' using errcode = '22023';
    end if;
    update public.point_reports set status=p_resolution, review_note=p_note, reviewed_at=now(), reviewed_by=auth.uid()
        where id=p_report_id and status='Pending';
    if not found then raise exception 'No pending report with this ID' using errcode = 'P0002'; end if;
    return p_resolution;
end $$;

revoke all on function public.submit_point_report(bigint,text,text,uuid),
    public.admin_list_point_reports(bigint,integer),public.admin_review_point_report(bigint,text,text)
    from public,anon,authenticated;
grant execute on function public.submit_point_report(bigint,text,text,uuid),
    public.admin_list_point_reports(bigint,integer),public.admin_review_point_report(bigint,text,text)
    to authenticated;
