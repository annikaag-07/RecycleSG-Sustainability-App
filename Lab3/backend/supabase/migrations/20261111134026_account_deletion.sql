alter table public.milestone_contributions
  alter column user_id drop not null,
  drop constraint milestone_contributions_user_id_fkey,
  add foreign key (user_id) references public.profiles(id) on delete set null;

alter table public.profiles add column deletion_requested_at timestamptz;

create function public.begin_account_deletion() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set deletion_requested_at = coalesce(deletion_requested_at, now())
    where id = auth.uid();
  if not found then raise exception 'Account unavailable' using errcode='42501'; end if;
end $$;

-- A shared row lock orders in-flight uploads before the deletion request commits.
create function public.can_upload_account_media() returns boolean
language sql volatile security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
    where id = auth.uid() and deletion_requested_at is null for share)
$$;
create policy "Freeze uploads during account removal" on storage.objects
  as restrictive for insert to authenticated
  with check (bucket_id not in ('recycling-photos','post-photos') or public.can_upload_account_media());
create policy "Freeze media updates during account removal" on storage.objects
  as restrictive for update to authenticated
  using (bucket_id not in ('recycling-photos','post-photos') or public.can_upload_account_media())
  with check (bucket_id not in ('recycling-photos','post-photos') or public.can_upload_account_media());

create function public.deletion_media_batch(p_user_id uuid)
returns table(bucket_id text, name text)
language sql stable security definer set search_path = '' as $$
  select o.bucket_id, o.name from storage.objects o
  join public.profiles p on p.id = p_user_id and p.deletion_requested_at is not null
  where o.bucket_id in ('recycling-photos','post-photos')
    and o.name like p_user_id::text || '/%'
  order by o.bucket_id, o.name limit 100
$$;

revoke all on function public.begin_account_deletion(),public.can_upload_account_media(),
  public.deletion_media_batch(uuid) from public,anon,authenticated;
grant execute on function public.begin_account_deletion(),public.can_upload_account_media() to authenticated;
grant execute on function public.deletion_media_batch(uuid) to service_role;
