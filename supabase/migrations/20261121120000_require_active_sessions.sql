begin;

create function public.has_active_session()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.sessions as session
    join auth.users as account on account.id = session.user_id
    where session.id::text = (select auth.jwt() ->> 'session_id')
      and session.user_id = (select auth.uid())
      and account.email_confirmed_at is not null
      and (session.not_after is null or session.not_after > now())
  );
$$;

revoke all on function public.has_active_session() from public, anon, service_role;
grant execute on function public.has_active_session() to authenticated;

create policy profiles_require_active_session on public.profiles
as restrictive for all to authenticated
using ((select public.has_active_session()))
with check ((select public.has_active_session()));

create policy condominiums_require_active_session on public.condominiums
as restrictive for all to authenticated
using ((select public.has_active_session()))
with check ((select public.has_active_session()));

commit;
