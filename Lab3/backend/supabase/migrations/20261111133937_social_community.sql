create schema social;
revoke all on schema social from public, anon, authenticated;

alter table public.profiles add column visibility text not null default 'public'
    check (visibility in ('public','followers'));

create table social.follows (
    follower uuid references public.profiles on delete cascade,
    followed uuid references public.profiles on delete cascade,
    accepted boolean not null,
    created_at timestamptz not null default now(),
    primary key (follower,followed),
    check (follower <> followed)
);
create index follows_incoming on social.follows(followed,accepted,follower);
create table social.blocks (
    blocker uuid references public.profiles on delete cascade,
    blocked uuid references public.profiles on delete cascade,
    primary key (blocker,blocked),
    check (blocker <> blocked)
);
create table social.posts (
    id bigint generated always as identity primary key,
    author uuid not null references public.profiles on delete cascade,
    request_id uuid not null,
    initial_payload jsonb not null,
    caption text not null check(length(caption)<=2000),
    tags text[] not null,
    recycling_point_id bigint references public.recycling_points on delete restrict,
    visibility text not null check(visibility in ('public','followers')),
    hidden boolean not null default false,
    created_at timestamptz not null default now(),
    unique(author,request_id)
);
create index posts_by_author on social.posts(author,id desc);
create index posts_by_tag on social.posts using gin(tags);
create index posts_by_point on social.posts(recycling_point_id,id desc);
create table social.photos (
    path text primary key,
    post_id bigint not null references social.posts on delete cascade,
    position integer not null,
    unique(post_id,position)
);
create table social.likes (
    user_id uuid references public.profiles on delete cascade,
    post_id bigint references social.posts on delete cascade,
    primary key(post_id,user_id)
);
create table social.comments (
    id bigint generated always as identity primary key,
    post_id bigint not null references social.posts on delete cascade,
    author uuid not null references public.profiles on delete cascade,
    request_id uuid not null,
    initial_body text not null,
    body text not null check(length(btrim(body)) between 1 and 2000),
    hidden boolean not null default false,
    created_at timestamptz not null default now(),
    unique(author,request_id)
);
create index comments_by_post on social.comments(post_id,id desc);
create table social.reports (
    id bigint generated always as identity primary key,
    reporter uuid references public.profiles on delete cascade,
    post_id bigint references social.posts on delete cascade,
    comment_id bigint references social.comments on delete cascade,
    reason text not null check (length(btrim(reason)) between 1 and 500),
    created_at timestamptz not null default now(),
    check (num_nonnulls(post_id,comment_id)=1),
    unique(reporter,post_id),
    unique(reporter,comment_id)
);
create table social.moderators (user_id uuid primary key references public.profiles on delete cascade);
create table social.moderation_actions (
    id bigint generated always as identity primary key,
    moderator uuid references public.profiles on delete set null,
    author uuid references public.profiles on delete set null,
    target_type text not null, target_id bigint not null,
    content_action text not null, user_action text not null,
    note text, created_at timestamptz not null default now()
);
create index moderation_actions_by_author on social.moderation_actions(author,id desc);
create table social.restrictions (
    user_id uuid primary key references public.profiles on delete cascade,
    restricted_until timestamptz not null
);

create function social.blocked(a uuid,b uuid) returns boolean
language sql stable set search_path='' as $$
    select exists(select 1 from social.blocks where (blocker=a and blocked=b) or (blocker=b and blocked=a))
$$;
create function social.follows_user(viewer uuid,owner_id uuid) returns boolean
language sql stable set search_path='' as $$
    select exists(select 1 from social.follows where follower=viewer and followed=owner_id and accepted)
$$;
create function social.can_view_author(owner_id uuid) returns boolean
language sql stable set search_path='' as $$
    select exists(select 1 from public.profiles p where p.id=owner_id and
        not social.blocked(auth.uid(),p.id) and
        (p.visibility='public' or auth.uid()=p.id or social.follows_user(auth.uid(),p.id)))
$$;
create function social.post_visible(p social.posts) returns boolean
language sql stable set search_path='' as $$
    select not p.hidden and social.can_view_author(p.author) and
        (p.visibility='public' or p.author=auth.uid() or social.follows_user(auth.uid(),p.author))
$$;
create function social.can_write(caller uuid) returns boolean
language sql stable set search_path='' as $$
    select exists(select 1 from public.profiles where id=caller) and
        not exists(select 1 from social.restrictions where user_id=caller and restricted_until>now())
$$;
create function social.require_writer() returns uuid
language plpgsql set search_path='' as $$
declare caller uuid := auth.uid();
begin
    perform 1 from public.profiles where id=caller for share;
    if not social.can_write(caller) then raise exception 'Social access restricted' using errcode='42501'; end if;
    return caller;
end $$;

create function public.set_profile_visibility(p_visibility text) returns void
language plpgsql security definer set search_path='' as $$
begin
    update public.profiles set visibility=p_visibility where id=auth.uid();
end $$;

create function public.set_follow(p_user_id uuid,p_follow boolean) returns text
language plpgsql security definer set search_path='' as $$
declare caller uuid := social.require_writer(); profile_visibility text; relation boolean;
begin
    if p_user_id=caller or p_user_id is null or p_follow is null then
        raise exception 'Invalid follow request' using errcode='22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(least(caller,p_user_id)::text || greatest(caller,p_user_id)::text,1));
    if not p_follow then
        delete from social.follows where follower=caller and followed=p_user_id;
        return 'none';
    end if;
    select visibility into profile_visibility from public.profiles where id=p_user_id for share;
    if not found or social.blocked(caller,p_user_id) then raise exception 'Profile unavailable' using errcode='P0002'; end if;
    insert into social.follows(follower,followed,accepted) values(caller,p_user_id,profile_visibility='public')
        on conflict do nothing returning accepted into relation;
    if found and relation then
        perform public.enqueue_notification(p_user_id,'social','follow','follow:'||caller::text,jsonb_build_object('actor_id',caller));
    end if;
    select accepted into relation from social.follows where follower=caller and followed=p_user_id;
    return case when relation then 'accepted' else 'pending' end;
end $$;

create function public.list_follow_requests() returns table(user_id uuid,username text,display_name text)
language sql stable security definer set search_path='' as $$
    select p.id,p.username,p.display_name from social.follows f join public.profiles p on p.id=f.follower
    where f.followed=auth.uid() and not f.accepted order by f.created_at,p.id
$$;

create function public.decide_follow_request(p_user_id uuid,p_accept boolean) returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid := social.require_writer();
begin
    if p_accept is null then raise exception 'Decision required' using errcode='22023'; end if;
    perform pg_advisory_xact_lock(hashtextextended(least(caller,p_user_id)::text || greatest(caller,p_user_id)::text,1));
    if p_accept then
        update social.follows set accepted=true where followed=caller and follower=p_user_id and not accepted;
        if found then
            perform public.enqueue_notification(caller,'social','follow','follow:'||p_user_id::text,jsonb_build_object('actor_id',p_user_id));
        end if;
    else
        delete from social.follows where followed=caller and follower=p_user_id and not accepted;
    end if;
end $$;

create function public.set_block(p_user_id uuid,p_block boolean) returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid := auth.uid();
begin
    if p_user_id is null or p_user_id=caller or p_block is null then
        raise exception 'Invalid block request' using errcode='22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(least(caller,p_user_id)::text || greatest(caller,p_user_id)::text,1));
    if p_block then
        insert into social.blocks values(caller,p_user_id) on conflict do nothing;
        delete from social.follows where (follower=caller and followed=p_user_id) or (follower=p_user_id and followed=caller);
    else
        delete from social.blocks where blocker=caller and blocked=p_user_id;
    end if;
end $$;

create function public.find_social_profiles(p_query text,p_limit integer default 20)
returns table(user_id uuid,username text,display_name text,visibility text)
language sql stable security definer set search_path='' as $$
    select p.id,p.username,p.display_name,p.visibility from public.profiles p
    where length(btrim(p_query))>0 and not social.blocked(auth.uid(),p.id)
        and (starts_with(lower(p.username),lower(btrim(p_query))) or starts_with(lower(p.display_name),lower(btrim(p_query))))
    order by lower(p.username),p.id limit least(100,greatest(1,p_limit))
$$;

create function public.get_social_profile(p_user_id uuid)
returns table(user_id uuid,username text,display_name text,visibility text,follow_state text,bio text,avatar_url text,
    follower_count bigint,following_count bigint)
language sql stable security definer set search_path='' as $$
    select p.id,p.username,p.display_name,p.visibility,
        case f.accepted when true then 'accepted' when false then 'pending' else 'none' end,
        case when social.can_view_author(p.id) then p.bio end,
        case when social.can_view_author(p.id) then p.avatar_url end,
        case when social.can_view_author(p.id) then (select count(*) from social.follows
            where followed=p.id and accepted and not social.blocked(auth.uid(),follower)) end,
        case when social.can_view_author(p.id) then (select count(*) from social.follows
            where follower=p.id and accepted and not social.blocked(auth.uid(),followed)) end
    from public.profiles p left join social.follows f on f.follower=auth.uid() and f.followed=p.id
    where p.id=p_user_id and not social.blocked(auth.uid(),p.id)
$$;
create function public.get_following_leaderboard(p_period text default 'all_time',p_limit integer default 20)
returns table(rank bigint,user_id uuid,username text,display_name text,level integer,eco_points integer)
language plpgsql stable security definer set search_path='' as $$
begin
    if p_period is null or p_period not in ('all_time','weekly') then raise exception 'Invalid leaderboard period' using errcode='22023'; end if;
    return query
        with scores as (
            select p.*, case when p_period='all_time' then p.eco_points else
                coalesce((select sum(r.eco_points_earned)::integer from public.reward_transactions r
                    where r.user_id=p.id and r.recycling_action_id is not null and
                    r.created_at>=date_trunc('week',now() at time zone 'Asia/Singapore') at time zone 'Asia/Singapore'),0) end as score
            from public.profiles p where (p.id=auth.uid() or social.follows_user(auth.uid(),p.id)) and social.can_view_author(p.id)
        ) select rank() over(order by s.score desc),s.id,s.username,s.display_name,s.level,s.score from scores s
          where s.score>0 order by s.score desc,s.id limit least(100,greatest(1,p_limit));
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
    values('post-photos','post-photos',false,5242880,array['image/jpeg','image/png','image/webp']);

create function public.can_upload_post_photo() returns boolean language sql stable security definer set search_path='' as $$
    select social.can_write(auth.uid())
$$;
create function public.can_read_post_photo(p_path text) returns boolean language sql stable security definer set search_path='' as $$
    select exists(select 1 from social.photos f join social.posts p on p.id=f.post_id where f.path=p_path and social.post_visible(p))
        or ((storage.foldername(p_path))[1]=auth.uid()::text and not exists(select 1 from social.photos f where f.path=p_path))
$$;
create policy "Upload personal post images" on storage.objects for insert to authenticated with check
    (bucket_id='post-photos' and (storage.foldername(name))[1]=(select auth.uid()::text) and (select public.can_upload_post_photo()));
create policy "Read visible post images" on storage.objects for select to authenticated using
    (bucket_id='post-photos' and public.can_read_post_photo(name));

create function social.tags(p_tags text[]) returns text[] language plpgsql immutable set search_path='' as $$
declare result text[];
begin
    if cardinality(p_tags)>20 or exists(select 1 from unnest(p_tags) t
        where t is null or ltrim(btrim(t),'#') !~ '^[[:alnum:]_]{1,50}$') then
        raise exception 'Invalid hashtags' using errcode='22023';
    end if;
    select coalesce(array_agg(distinct lower(ltrim(btrim(t),'#')) order by lower(ltrim(btrim(t),'#'))),'{}') into result from unnest(p_tags) t;
    return result;
end $$;
create function public.create_post(p_request_id uuid,p_photo_paths text[],p_caption text default '',
    p_tags text[] default '{}',p_recycling_point_id bigint default null,p_visibility text default 'public') returns bigint
language plpgsql security definer set search_path='' as $$
declare caller uuid := social.require_writer(); post_id bigint; tags text[] := social.tags(p_tags); payload jsonb;
begin
    if p_request_id is null or coalesce(cardinality(p_photo_paths),0) not between 1 and 8
        or exists(select 1 from unnest(p_photo_paths) path where path is null or (storage.foldername(path))[1] is distinct from caller::text
            or not exists(select 1 from storage.objects o where o.bucket_id='post-photos' and o.name=path)) then
        raise exception 'Upload one to eight owned photos before posting' using errcode='22023';
    end if;
    payload := jsonb_build_array(p_photo_paths,coalesce(p_caption,''),tags,p_recycling_point_id,p_visibility);
    insert into social.posts as old(author,request_id,initial_payload,caption,tags,recycling_point_id,visibility)
        values(caller,p_request_id,payload,coalesce(p_caption,''),tags,p_recycling_point_id,p_visibility)
        on conflict(author,request_id) do nothing returning id into post_id;
    if found then
        insert into social.photos(path,post_id,position) select path,post_id,n from unnest(p_photo_paths) with ordinality photos(path,n);
    else
        select id into post_id from social.posts where author=caller and request_id=p_request_id and initial_payload=payload;
        if not found then raise exception 'Request ID reused for a different post' using errcode='22023'; end if;
    end if;
    return post_id;
end $$;

create function public.edit_post(p_post_id bigint,p_caption text,p_tags text[],p_recycling_point_id bigint,p_visibility text,
    p_photo_paths text[] default null) returns void language plpgsql security definer set search_path='' as $$
declare caller uuid := social.require_writer();
begin
    update social.posts set caption=coalesce(p_caption,''),tags=social.tags(p_tags),recycling_point_id=p_recycling_point_id,visibility=p_visibility
        where id=p_post_id and author=caller and not hidden;
    if not found then raise exception 'Post unavailable' using errcode='P0002'; end if;
    if p_photo_paths is not null then
        if cardinality(p_photo_paths) not between 1 and 8 or exists(select 1 from unnest(p_photo_paths) path where path is null
            or (storage.foldername(path))[1] is distinct from caller::text
            or not exists(select 1 from storage.objects o where o.bucket_id='post-photos' and o.name=path)) then
            raise exception 'Invalid post photos' using errcode='22023';
        end if;
        delete from social.photos where post_id=p_post_id;
        insert into social.photos(path,post_id,position) select path,p_post_id,n from unnest(p_photo_paths) with ordinality photos(path,n);
    end if;
end $$;
create function public.delete_post(p_post_id bigint) returns void language sql security definer set search_path='' as $$
    delete from social.posts where id=p_post_id and author=auth.uid()
$$;

create function public.list_posts(p_feed text default 'discover',p_before_id bigint default null,p_author_id uuid default null,
    p_hashtag text default null,p_recycling_point_id bigint default null,p_post_id bigint default null,p_limit integer default 20)
returns table(id bigint,author_id uuid,username text,display_name text,caption text,tags text[],photo_paths text[],
    recycling_point_id bigint,visibility text,created_at timestamptz,like_count bigint,comment_count bigint,liked boolean)
language plpgsql stable security definer set search_path='' as $$
begin
    if p_feed is null or p_feed not in ('discover','following') then raise exception 'Invalid feed' using errcode='22023'; end if;
    return query select p.id,p.author,profile.username,profile.display_name,p.caption,p.tags,
        array(select f.path from social.photos f where f.post_id=p.id order by f.position),
        p.recycling_point_id,p.visibility,p.created_at,
        (select count(*) from social.likes l where l.post_id=p.id and not social.blocked(auth.uid(),l.user_id)),
        (select count(*) from social.comments c where c.post_id=p.id and not c.hidden and not social.blocked(auth.uid(),c.author)),
        exists(select 1 from social.likes l where l.post_id=p.id and l.user_id=auth.uid())
    from social.posts p join public.profiles profile on profile.id=p.author
    where social.post_visible(p) and (p_feed='discover' or social.follows_user(auth.uid(),p.author))
        and (p_before_id is null or p.id<p_before_id) and (p_author_id is null or p.author=p_author_id)
        and (p_hashtag is null or p.tags @> array[lower(ltrim(btrim(p_hashtag),'#'))])
        and (p_recycling_point_id is null or p.recycling_point_id=p_recycling_point_id) and (p_post_id is null or p.id=p_post_id)
    order by p.id desc limit least(100,greatest(1,p_limit));
end $$;

create function public.set_post_like(p_post_id bigint,p_liked boolean) returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid := social.require_writer(); owner_id uuid;
begin
    select p.author into owner_id from social.posts p where p.id=p_post_id and social.post_visible(p) for share;
    if not found then raise exception 'Post unavailable' using errcode='P0002'; end if;
    if p_liked is null then raise exception 'Like state required' using errcode='22023'; end if;
    if p_liked then
        insert into social.likes values(caller,p_post_id) on conflict do nothing;
        if found and caller<>owner_id then perform public.enqueue_notification(owner_id,'social','like',
            'like:'||p_post_id::text||':'||caller::text,jsonb_build_object('post_id',p_post_id,'actor_id',caller)); end if;
    else
        delete from social.likes where user_id=caller and post_id=p_post_id;
    end if;
end $$;
create function public.create_comment(p_post_id bigint,p_request_id uuid,p_body text) returns bigint
language plpgsql security definer set search_path='' as $$
declare caller uuid := social.require_writer(); owner_id uuid; comment_id bigint;
begin
    select p.author into owner_id from social.posts p where p.id=p_post_id and social.post_visible(p) for share;
    if not found then raise exception 'Post unavailable' using errcode='P0002'; end if;
    insert into social.comments(post_id,author,request_id,body,initial_body) values(p_post_id,caller,p_request_id,p_body,p_body)
        on conflict(author,request_id) do nothing returning id into comment_id;
    if found then
        if caller<>owner_id then perform public.enqueue_notification(owner_id,'social','comment','comment:'||comment_id::text,
            jsonb_build_object('post_id',p_post_id,'comment_id',comment_id,'actor_id',caller)); end if;
    else
        select id into comment_id from social.comments where author=caller and request_id=p_request_id and post_id=p_post_id and initial_body=p_body;
        if not found then raise exception 'Request ID reused for a different comment' using errcode='22023'; end if;
    end if;
    return comment_id;
end $$;
create function public.edit_comment(p_comment_id bigint,p_body text) returns void language plpgsql security definer set search_path='' as $$
declare caller uuid := social.require_writer();
begin
    update social.comments c set body=p_body from social.posts p
        where c.post_id=p.id and c.id=p_comment_id and c.author=caller and not c.hidden and social.post_visible(p);
    if not found then raise exception 'Comment unavailable' using errcode='P0002'; end if;
end $$;
create function public.delete_comment(p_comment_id bigint) returns void language sql security definer set search_path='' as $$
    delete from social.comments where id=p_comment_id and author=auth.uid()
$$;
create function public.list_post_comments(p_post_id bigint,p_before_id bigint default null,p_limit integer default 20)
returns table(id bigint,author_id uuid,username text,display_name text,body text,created_at timestamptz)
language sql stable security definer set search_path='' as $$
    select c.id,c.author,pr.username,pr.display_name,c.body,c.created_at from social.comments c
    join social.posts p on p.id=c.post_id join public.profiles pr on pr.id=c.author
    where p.id=p_post_id and social.post_visible(p) and not c.hidden and not social.blocked(auth.uid(),c.author)
        and (p_before_id is null or c.id<p_before_id) order by c.id desc limit least(100,greatest(1,p_limit))
$$;

create function public.report_social_content(p_target_type text,p_target_id bigint,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid := social.require_writer();
begin
    if p_target_type='post' then
        perform 1 from social.posts p where p.id=p_target_id and social.post_visible(p) for share;
        if not found then raise exception 'Post unavailable' using errcode='P0002'; end if;
        insert into social.reports(reporter,post_id,reason) values(caller,p_target_id,p_reason) on conflict do nothing;
    elsif p_target_type='comment' then
        perform 1 from social.comments c join social.posts p on p.id=c.post_id
            where c.id=p_target_id and not c.hidden and social.post_visible(p) and not social.blocked(caller,c.author) for share;
        if not found then raise exception 'Comment unavailable' using errcode='P0002'; end if;
        insert into social.reports(reporter,comment_id,reason) values(caller,p_target_id,p_reason) on conflict do nothing;
    else raise exception 'Invalid target type' using errcode='22023';
    end if;
end $$;

create function public.is_content_moderator() returns boolean language sql stable security definer set search_path='' as $$
    select public.is_app_admin() or exists(select 1 from social.moderators where user_id=auth.uid())
$$;
create function public.admin_moderation_queue()
returns table(target_type text,target_id bigint,author_id uuid,author_name text,excerpt text,
    report_count bigint,reasons text[],first_reported_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
    if not public.is_content_moderator() then raise exception 'Moderator required' using errcode='42501'; end if;
    return query select case when r.post_id is null then 'comment' else 'post' end,
        coalesce(r.post_id,r.comment_id),pr.id,coalesce(pr.display_name,pr.username),
        left(coalesce(p.caption,c.body),240),count(*),array_agg(distinct r.reason order by r.reason),min(r.created_at)
    from social.reports r left join social.posts p on p.id=r.post_id left join social.comments c on c.id=r.comment_id
    join public.profiles pr on pr.id=coalesce(p.author,c.author)
    group by r.post_id,r.comment_id,pr.id,p.caption,c.body
    order by count(*) desc,min(r.created_at),coalesce(r.post_id,r.comment_id);
end $$;

create function public.admin_moderate_content(p_target_type text,p_target_id bigint,p_content_action text,p_user_action text,p_note text)
returns void language plpgsql security definer set search_path='' as $$
declare owner_id uuid; expiry timestamptz;
begin
    if not public.is_content_moderator() then raise exception 'Moderator required' using errcode='42501'; end if;
    if p_target_type is null or p_target_type not in ('post','comment')
        or p_content_action is null or p_content_action not in ('dismiss','hide','delete')
        or p_user_action is null or p_user_action not in ('none','warn','suspend','ban') then
        raise exception 'Invalid moderation action' using errcode='22023';
    end if;
    if p_target_type='post' then
        select author into owner_id from social.posts where id=p_target_id for update;
        delete from social.reports where post_id=p_target_id;
    else
        select author into owner_id from social.comments where id=p_target_id for update;
        delete from social.reports where comment_id=p_target_id;
    end if;
    if not found or owner_id is null then raise exception 'No open reports for target' using errcode='P0002'; end if;
    insert into social.moderation_actions(moderator,author,target_type,target_id,content_action,user_action,note)
        values(auth.uid(),owner_id,p_target_type,p_target_id,p_content_action,p_user_action,p_note);
    if p_user_action in ('suspend','ban') then
        perform 1 from public.profiles where id=owner_id for update;
        expiry := case when p_user_action='ban' then 'infinity'::timestamptz else now()+interval '7 days' end;
        update auth.users set banned_until=greatest(banned_until,least(expiry,'9999-12-31 UTC'::timestamptz)) where id=owner_id;
        insert into social.restrictions(user_id,restricted_until) values(owner_id,expiry)
            on conflict(user_id) do update set restricted_until=greatest(social.restrictions.restricted_until,excluded.restricted_until);
    end if;
    if p_target_type='post' then
        if p_content_action='hide' then update social.posts set hidden=true where id=p_target_id;
        elsif p_content_action='delete' then delete from social.posts where id=p_target_id; end if;
    else
        if p_content_action='hide' then update social.comments set hidden=true where id=p_target_id;
        elsif p_content_action='delete' then delete from social.comments where id=p_target_id; end if;
    end if;
end $$;
create function public.list_my_moderation_notices()
returns table(id bigint,target_type text,target_id bigint,content_action text,user_action text,note text,created_at timestamptz)
language sql stable security definer set search_path='' as $$
    select a.id,a.target_type,a.target_id,a.content_action,a.user_action,a.note,a.created_at from social.moderation_actions a
    where a.author=auth.uid() and a.user_action<>'none' order by a.id desc
$$;

revoke all on function
    public.set_profile_visibility(text),
    public.set_follow(uuid,boolean),
    public.list_follow_requests(),
    public.decide_follow_request(uuid,boolean),
    public.set_block(uuid,boolean),
    public.find_social_profiles(text,integer),
    public.get_social_profile(uuid),
    public.get_following_leaderboard(text,integer),
    public.can_upload_post_photo(),
    public.can_read_post_photo(text),
    public.create_post(uuid,text[],text,text[],bigint,text),
    public.edit_post(bigint,text,text[],bigint,text,text[]),
    public.delete_post(bigint),
    public.list_posts(text,bigint,uuid,text,bigint,bigint,integer),
    public.set_post_like(bigint,boolean),
    public.create_comment(bigint,uuid,text),
    public.edit_comment(bigint,text),
    public.delete_comment(bigint),
    public.list_post_comments(bigint,bigint,integer),
    public.report_social_content(text,bigint,text),
    public.is_content_moderator(),
    public.admin_moderation_queue(),
    public.admin_moderate_content(text,bigint,text,text,text),
    public.list_my_moderation_notices()
from public,anon,authenticated;
grant execute on function
    public.set_profile_visibility(text),
    public.set_follow(uuid,boolean),
    public.list_follow_requests(),
    public.decide_follow_request(uuid,boolean),
    public.set_block(uuid,boolean),
    public.find_social_profiles(text,integer),
    public.get_social_profile(uuid),
    public.get_following_leaderboard(text,integer),
    public.can_upload_post_photo(),
    public.can_read_post_photo(text),
    public.create_post(uuid,text[],text,text[],bigint,text),
    public.edit_post(bigint,text,text[],bigint,text,text[]),
    public.delete_post(bigint),
    public.list_posts(text,bigint,uuid,text,bigint,bigint,integer),
    public.set_post_like(bigint,boolean),
    public.create_comment(bigint,uuid,text),
    public.edit_comment(bigint,text),
    public.delete_comment(bigint),
    public.list_post_comments(bigint,bigint,integer),
    public.report_social_content(text,bigint,text),
    public.is_content_moderator(),
    public.admin_moderation_queue(),
    public.admin_moderate_content(text,bigint,text,text,text),
    public.list_my_moderation_notices()
to authenticated;

CREATE OR REPLACE FUNCTION public.get_community_feed(
    p_limit integer DEFAULT 20
)
RETURNS TABLE (
    activity_id bigint,
    username text,
    display_name text,
    material text,
    quantity integer,
    recycled_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        a.id,
        'Anonymous Recycler'::text AS username,
        COALESCE(
            NULLIF(BTRIM(p.display_name), ''),
            'Anonymous Recycler'
        )::text AS display_name,
        m.name AS material,
        a.quantity,
        a.verified_at
    FROM public.recycling_actions a
    JOIN public.profiles p ON p.id = a.user_id
    JOIN public.material_types m
        ON m.id = a.material_type_id
    WHERE social.can_view_author(p.id) AND a.verification_status = 'Verified'
      AND a.verified_at IS NOT NULL
    ORDER BY a.verified_at DESC, a.id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
$$;


CREATE OR REPLACE FUNCTION public.get_leaderboard(
    p_limit integer DEFAULT 10
)
RETURNS TABLE (
    rank bigint,
    username text,
    display_name text,
    level integer,
    eco_points integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        RANK() OVER (
            ORDER BY p.eco_points DESC
        ) AS rank,
        p.username,
        p.display_name,
        p.level,
        p.eco_points
    FROM public.profiles AS p
    WHERE social.can_view_author(p.id) AND p.eco_points > 0
    ORDER BY p.eco_points DESC, p.id ASC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100);
$$;


CREATE OR REPLACE FUNCTION public.get_weekly_leaderboard(
    p_limit integer DEFAULT 10
)
RETURNS TABLE (
    rank bigint,
    username text,
    display_name text,
    level integer,
    eco_points integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH weekly_scores AS (
        SELECT
            rt.user_id,
            SUM(rt.eco_points_earned)::integer AS weekly_points
        FROM public.reward_transactions rt
        WHERE rt.recycling_action_id IS NOT NULL
          AND rt.created_at >= (
              date_trunc(
                  'week',
                  now() AT TIME ZONE 'Asia/Singapore'
              ) AT TIME ZONE 'Asia/Singapore'
          )
        GROUP BY rt.user_id
    )
    SELECT
        RANK() OVER (
            ORDER BY ws.weekly_points DESC
        ) AS rank,
        p.username,
        p.display_name,
        p.level,
        ws.weekly_points AS eco_points
    FROM weekly_scores ws
    JOIN public.profiles p ON p.id = ws.user_id
    WHERE social.can_view_author(p.id) AND ws.weekly_points > 0
    ORDER BY ws.weekly_points DESC, p.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100);
$$;
