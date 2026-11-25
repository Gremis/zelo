begin;

alter table public.profiles add column first_steps_dismissed_at timestamptz;

create function public.dismiss_first_steps()
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  dismissed_at timestamptz;
begin
  if auth.role() is distinct from 'authenticated' or not public.has_active_session() then
    raise exception using errcode = '42501', message = 'Active authenticated session required.';
  end if;
  update public.profiles
  set first_steps_dismissed_at = coalesce(first_steps_dismissed_at, clock_timestamp())
  where id = auth.uid() and is_sindico
  returning first_steps_dismissed_at into dismissed_at;
  if not found then
    raise exception using errcode = '42501', message = 'Manager profile required.';
  end if;
  return dismissed_at;
end;
$$;
revoke all on function public.dismiss_first_steps() from public, anon, authenticated, service_role;
grant execute on function public.dismiss_first_steps() to authenticated;

notify pgrst, 'reload schema';
commit;
