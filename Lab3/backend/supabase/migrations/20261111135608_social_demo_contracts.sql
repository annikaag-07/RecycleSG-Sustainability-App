alter table social.posts
    add column check_in_id bigint references public.check_ins(id) on delete cascade,
    add column check_in_points integer,
    add column edited_at timestamptz,
    add check ((check_in_id is null) = (check_in_points is null));

create or replace function social.can_write(caller uuid) returns boolean
language sql stable set search_path='' as $$
    select exists(select 1 from auth.users where id=caller and email_confirmed_at is not null) and
        not exists(select 1 from social.restrictions where user_id=caller and restricted_until>now())
$$;
drop function public.create_post(uuid,text[],text,text[],bigint,text);
create function public.create_post(p_request_id uuid,p_photo_paths text[],p_caption text default '',
    p_tags text[] default '{}',p_recycling_point_id bigint default null,p_visibility text default 'public',
    p_check_in_id bigint default null) returns bigint
language plpgsql security definer set search_path='' as $$
declare caller uuid := social.require_writer(); post_id bigint; tags text[] := social.tags(p_tags); payload jsonb; linked_point bigint; earned integer;
begin
    if p_request_id is null or coalesce(cardinality(p_photo_paths),0) not between 1 and 8
        or exists(select 1 from unnest(p_photo_paths) path where path is null or (storage.foldername(path))[1] is distinct from caller::text
            or not exists(select 1 from storage.objects o where o.bucket_id='post-photos' and o.name=path)) then
        raise exception 'Upload one to eight owned photos before posting' using errcode='22023';
    end if;
    if p_check_in_id is not null then
        select c.recycling_point_id, sum(r.eco_points_earned)::integer into linked_point,earned
        from public.check_ins c
        join public.recycling_actions a on a.check_in_id=c.id and a.verification_status='Verified'
        join public.reward_transactions r on r.recycling_action_id=a.id
        where c.id=p_check_in_id and c.user_id=caller
        group by c.recycling_point_id;
        if not found then raise exception 'Verified check-in unavailable' using errcode='P0002'; end if;
        if p_recycling_point_id is not null and p_recycling_point_id<>linked_point then
            raise exception 'Point differs from linked check-in' using errcode='22023';
        end if;
        p_recycling_point_id := linked_point;
    end if;
    payload := jsonb_build_array(p_photo_paths,coalesce(p_caption,''),tags,p_recycling_point_id,p_visibility);
    -- Keep the original payload shape for retries of posts created before check-in sharing.
    if p_check_in_id is not null then payload := payload || jsonb_build_array(p_check_in_id); end if;
    insert into social.posts as old(author,request_id,initial_payload,caption,tags,recycling_point_id,visibility,check_in_id,check_in_points)
        values(caller,p_request_id,payload,coalesce(p_caption,''),tags,p_recycling_point_id,p_visibility,p_check_in_id,earned)
        on conflict(author,request_id) do nothing returning id into post_id;
    if found then
        insert into social.photos(path,post_id,position) select path,post_id,n from unnest(p_photo_paths) with ordinality photos(path,n);
    else
        select id into post_id from social.posts where author=caller and request_id=p_request_id and initial_payload=payload;
        if not found then raise exception 'Request ID reused for a different post' using errcode='22023'; end if;
    end if;
    return post_id;
end $$;

create or replace function public.edit_post(p_post_id bigint,p_caption text,p_tags text[],p_recycling_point_id bigint,p_visibility text,
    p_photo_paths text[] default null) returns void language plpgsql security definer set search_path='' as $$
declare caller uuid := social.require_writer();
begin
    update social.posts set caption=coalesce(p_caption,''),tags=social.tags(p_tags),recycling_point_id=case when check_in_id is null then p_recycling_point_id else recycling_point_id end,
        visibility=p_visibility,edited_at=now()
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
drop function public.list_posts(text,bigint,uuid,text,bigint,bigint,integer);
create function public.list_posts(p_feed text default 'discover',p_before_id bigint default null,p_author_id uuid default null,
    p_hashtag text default null,p_recycling_point_id bigint default null,p_post_id bigint default null,p_limit integer default 20)
returns table(id bigint,author_id uuid,username text,display_name text,caption text,tags text[],photo_paths text[],
    recycling_point_id bigint,visibility text,created_at timestamptz,like_count bigint,comment_count bigint,liked boolean,
    check_in_id bigint,check_in_points integer,edited_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
    if p_feed is null or p_feed not in ('discover','following') then raise exception 'Invalid feed' using errcode='22023'; end if;
    return query select p.id,p.author,profile.username,profile.display_name,p.caption,p.tags,
        array(select f.path from social.photos f where f.post_id=p.id order by f.position),
        p.recycling_point_id,p.visibility,p.created_at,
        (select count(*) from social.likes l where l.post_id=p.id and not social.blocked(auth.uid(),l.user_id)),
        (select count(*) from social.comments c where c.post_id=p.id and not c.hidden and not social.blocked(auth.uid(),c.author)),
        exists(select 1 from social.likes l where l.post_id=p.id and l.user_id=auth.uid()),
        p.check_in_id,p.check_in_points,p.edited_at
    from social.posts p join public.profiles profile on profile.id=p.author
    where social.post_visible(p) and (case when p_feed='following' then social.follows_user(auth.uid(),p.author)
            when p_post_id is not null or p_author_id is not null then true
            else p.visibility='public' and profile.visibility='public' end)
        and (p_before_id is null or p.id<p_before_id) and (p_author_id is null or p.author=p_author_id)
        and (p_hashtag is null or p.tags @> array[lower(ltrim(btrim(p_hashtag),'#'))])
        and (p_recycling_point_id is null or p.recycling_point_id=p_recycling_point_id) and (p_post_id is null or p.id=p_post_id)
    order by p.id desc limit least(100,greatest(1,p_limit));
end $$;

revoke all on function public.create_post(uuid,text[],text,text[],bigint,text,bigint),
    public.list_posts(text,bigint,uuid,text,bigint,bigint,integer) from public,anon,authenticated;
grant execute on function public.create_post(uuid,text[],text,text[],bigint,text,bigint) to authenticated;
grant execute on function public.list_posts(text,bigint,uuid,text,bigint,bigint,integer),
    public.list_post_comments(bigint,bigint,integer),public.can_read_post_photo(text) to anon,authenticated;

-- A guest's null auth.uid() limits this policy to linked images on public posts and profiles.
grant select on storage.objects to anon;
alter policy "Read visible post images" on storage.objects to anon,authenticated;
