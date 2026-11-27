begin;

create or replace function public.register_account_demo(target_manager uuid, fixture_key text, registration jsonb)
returns table (occurrence_id uuid, number bigint, tracking_code text)
language plpgsql security definer set search_path = '' as $$
declare
  existing private.account_demo_occurrences%rowtype;
  created record;
  expected_condominium text;
begin
  if not private.lock_account_demo(target_manager) then
    raise exception using errcode = '42501', message = 'Account not eligible.';
  end if;
  expected_condominium := case fixture_key when 'normal-old' then 'a' when 'urgent-new' then 'a' when 'normal-new' then 'b' when 'urgent-old' then 'b' end;
  if expected_condominium is null or not exists (
    select 1 from private.account_demo_condominiums m join public.condominiums c on c.id = m.condominium_id
    where m.manager_id = target_manager and m.fixture_key = expected_condominium
      and c.manager_id = target_manager and c.demo_dataset = 'ori76-v1' and c.slug = registration->>'condominiumSlug'
  ) then raise exception using errcode = '22023', message = 'Invalid demo condominium.'; end if;
  select * into existing from private.account_demo_occurrences m where m.manager_id = target_manager and m.fixture_key = register_account_demo.fixture_key;
  if found then
    if (existing.registration - array['suggestedPriority', 'suggestionReason', 'suggestionSource', 'category', 'aiFailureReason'])
      is distinct from (registration - array['suggestedPriority', 'suggestionReason', 'suggestionSource', 'category', 'aiFailureReason']) then
      raise exception using errcode = '22023', message = 'Demo version mismatch.';
    end if;
    return query select o.id, o.number, o.tracking_code from public.occurrences o where o.id = existing.occurrence_id;
    return;
  end if;
  select * into created from public.register_public_occurrence_with_suggestion(
    registration->>'condominiumSlug', registration->>'reporterName', registration->>'reporterPhone',
    registration->>'reporterUnitOrRole', registration->>'description', registration->>'location',
    registration->>'suggestedPriority', registration->>'suggestionReason', registration->>'suggestionSource',
    registration->>'category', registration->>'aiFailureReason'
  );
  insert into private.account_demo_occurrences values (target_manager, fixture_key, created.occurrence_id, registration);
  return query select created.occurrence_id::uuid, created.number::bigint, created.tracking_code::text;
end;
$$;
notify pgrst, 'reload schema';

commit;
