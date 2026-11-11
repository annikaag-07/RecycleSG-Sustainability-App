create table public.notification_preferences (
    user_id uuid primary key references public.profiles on delete cascade,
    social boolean not null default true,
    progress boolean not null default true,
    streak_reminder boolean not null default false
);
create table public.notifications (
    id bigint generated always as identity primary key,
    user_id uuid not null references public.profiles on delete cascade,
    actor_id uuid references public.profiles on delete cascade,
    category text not null check (category in ('social','progress','streak_reminder')),
    kind text not null,
    event_key text not null,
    payload jsonb not null,
    created_at timestamptz not null default now(),
    read_at timestamptz,
    unique(user_id,kind,event_key)
);
create index notifications_recipient_page on public.notifications(user_id,id desc);
alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;
revoke all on public.notification_preferences,public.notifications from public,anon,authenticated;

create function public.enqueue_notification(p_user_id uuid,p_category text,p_kind text,p_event_key text,p_payload jsonb)
returns void language sql security definer set search_path='' as $$
    insert into public.notifications(user_id,actor_id,category,kind,event_key,payload)
    select p_user_id,case when p_category='social' then (p_payload->>'actor_id')::uuid end,p_category,p_kind,p_event_key,p_payload
    from public.profiles recipient
    left join public.notification_preferences n on n.user_id=recipient.id
    where recipient.id=p_user_id and case p_category
        when 'social' then coalesce(n.social,true)
        when 'progress' then coalesce(n.progress,true)
        when 'streak_reminder' then coalesce(n.streak_reminder,false)
    end
    on conflict(user_id,kind,event_key) do nothing
$$;
revoke all on function public.enqueue_notification(uuid,text,text,text,jsonb) from public,anon,authenticated;

create function public.get_my_notification_preferences()
returns table(social boolean,progress boolean,streak_reminder boolean)
language sql stable security definer set search_path='' as $$
    select coalesce(n.social,true),coalesce(n.progress,true),coalesce(n.streak_reminder,false)
    from public.profiles p left join public.notification_preferences n on n.user_id=p.id
    where p.id=auth.uid()
$$;
create function public.set_notification_preferences(p_social boolean,p_progress boolean,p_streak_reminder boolean)
returns void language sql security definer set search_path='' as $$
    insert into public.notification_preferences values(auth.uid(),p_social,p_progress,p_streak_reminder)
    on conflict(user_id) do update set social=excluded.social,progress=excluded.progress,streak_reminder=excluded.streak_reminder
$$;
create function public.list_my_notifications(p_before_id bigint default null,p_limit integer default 20)
returns table(id bigint,category text,kind text,payload jsonb,created_at timestamptz,read_at timestamptz)
language sql stable security definer set search_path='' as $$
    select n.id,n.category,n.kind,n.payload,n.created_at,n.read_at
    from public.notifications n where n.user_id=auth.uid() and (p_before_id is null or n.id<p_before_id)
      and (n.category<>'social' or (
        not social.blocked(n.user_id,n.actor_id)
        and (n.kind not in ('like','comment') or exists (
            select 1 from social.posts p where p.id=(n.payload->>'post_id')::bigint and social.post_visible(p)))
        and (n.kind<>'comment' or exists (
            select 1 from social.comments c where c.id=(n.payload->>'comment_id')::bigint and not c.hidden))))
    order by n.id desc limit least(100,greatest(1,coalesce(p_limit,20)))
$$;
create function public.mark_notification_read(p_id bigint) returns void
language plpgsql security definer set search_path='' as $$
begin
    update public.notifications set read_at=coalesce(read_at,now()) where id=p_id and user_id=auth.uid();
    if not found then raise exception 'Notification unavailable' using errcode='P0002'; end if;
end $$;

create table public.milestone_decisions (
    id bigint generated always as identity primary key,
    milestone_id bigint not null references public.milestones,
    admin_id uuid references public.profiles on delete set null,
    decision text not null check(decision in ('verify','reject','request_evidence')),
    reason text,
    evidence_url text,
    evidence_notes text,
    decided_at timestamptz not null default now()
);
alter table public.milestone_decisions enable row level security;
revoke all on public.milestone_decisions from public,anon,authenticated;

create function public.admin_decide_milestone(p_milestone_id bigint,p_decision text,p_reason text,p_expected_status text)
returns text language plpgsql security definer set search_path='' as $$
declare
    milestone public.milestones;
    next_status text;
    reason text := nullif(btrim(p_reason),'');
    recipient uuid;
begin
    if not public.is_app_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
    if p_decision is null or p_decision not in ('verify','reject','request_evidence')
        or (p_decision <> 'verify' and reason is null) then
        raise exception 'Invalid decision or missing reason' using errcode='22023';
    end if;
    select * into strict milestone from public.milestones where id=p_milestone_id for update;
    if p_expected_status is distinct from 'AwaitingVerification' or milestone.status <> 'AwaitingVerification' then
        raise exception 'Milestone changed. Refresh the list.' using errcode='40001';
    end if;
    next_status := case p_decision when 'verify' then 'Verified' when 'reject' then 'Rejected' else milestone.status end;
    insert into public.milestone_decisions(milestone_id,admin_id,decision,reason,evidence_url,evidence_notes)
    values(milestone.id,auth.uid(),p_decision,reason,milestone.evidence_url,milestone.evidence_notes);
    if p_decision='request_evidence' then
        update public.milestones set evidence_requested_note=reason where id=milestone.id;
    else
        update public.milestones set status=next_status,decided_at=now(),decision_reason=reason where id=milestone.id;
    end if;
    if p_decision='verify' then
        for recipient in select distinct user_id from public.milestone_contributions
            where milestone_id=milestone.id and user_id is not null loop
            perform public.enqueue_notification(recipient,'progress','milestone_verified',milestone.id::text,
                jsonb_build_object('milestone_id',milestone.id));
        end loop;
    end if;
    return next_status;
end $$;
revoke all on function public.get_my_notification_preferences(),public.set_notification_preferences(boolean,boolean,boolean),
    public.list_my_notifications(bigint,integer),public.mark_notification_read(bigint),
    public.admin_decide_milestone(bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.get_my_notification_preferences(),public.set_notification_preferences(boolean,boolean,boolean),
    public.list_my_notifications(bigint,integer),public.mark_notification_read(bigint),
    public.admin_decide_milestone(bigint,text,text,text) to authenticated;
