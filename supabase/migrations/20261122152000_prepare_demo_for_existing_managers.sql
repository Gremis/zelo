begin;

drop trigger profiles_enroll_demo on public.profiles;
drop function private.enroll_account_demo();

create or replace function private.lock_account_demo(target_manager uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.profiles p join auth.users u on u.id = p.id
  where p.id = target_manager and p.is_sindico and u.email_confirmed_at is not null
  for share of p, u;
  if not found then
    raise exception using errcode = '42501', message = 'Confirmed manager required.';
  end if;
  insert into private.account_demo(manager_id) values (target_manager)
  on conflict (manager_id) do nothing;
  perform 1 from private.account_demo where manager_id = target_manager for update;
  return true;
end;
$$;

notify pgrst, 'reload schema';
commit;
