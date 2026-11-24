begin;

alter table public.condominiums add column demo_dataset text check (demo_dataset is null or demo_dataset = 'ori76-v1');

create table private.account_demo (
  manager_id uuid primary key references public.profiles(id) on delete restrict,
  dataset text not null default 'ori76-v1' check (dataset = 'ori76-v1'),
  created_at timestamptz not null default clock_timestamp()
);
create table private.account_demo_condominiums (
  manager_id uuid not null references private.account_demo(manager_id) on delete restrict,
  fixture_key text not null check (fixture_key in ('a', 'b')),
  condominium_id uuid not null unique references public.condominiums(id) on delete restrict,
  primary key (manager_id, fixture_key)
);
create table private.account_demo_occurrences (
  manager_id uuid not null references private.account_demo(manager_id) on delete restrict,
  fixture_key text not null check (fixture_key in ('normal-old', 'urgent-old', 'normal-new', 'urgent-new')),
  occurrence_id uuid not null unique references public.occurrences(id) on delete restrict,
  registration jsonb not null,
  primary key (manager_id, fixture_key)
);
revoke all on private.account_demo, private.account_demo_condominiums, private.account_demo_occurrences from public, anon, authenticated, service_role;

create function private.enroll_account_demo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_sindico then
    insert into private.account_demo(manager_id) values (new.id);
  end if;
  return new;
end;
$$;
revoke all on function private.enroll_account_demo() from public, anon, authenticated, service_role;
create trigger profiles_enroll_demo after insert on public.profiles
for each row execute function private.enroll_account_demo();

create function private.lock_account_demo(target_manager uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = target_manager and p.is_sindico and u.email_confirmed_at is not null
  ) then
    raise exception using errcode = '42501', message = 'Confirmed manager required.';
  end if;
  perform 1 from private.account_demo where manager_id = target_manager for update;
  return found;
end;
$$;
revoke all on function private.lock_account_demo(uuid) from public, anon, authenticated, service_role;

create function public.prepare_account_demo(target_manager uuid, fixtures jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  fixture jsonb;
  condo uuid;
  attempt integer;
begin
  if not private.lock_account_demo(target_manager) then return jsonb_build_object('eligible', false); end if;
  if jsonb_typeof(fixtures) is distinct from 'array' or jsonb_array_length(fixtures) <> 2 then
    raise exception using errcode = '22023', message = 'Invalid demo dataset.';
  end if;
  for fixture in select value from jsonb_array_elements(fixtures) loop
    if not exists (select 1 from private.account_demo_condominiums where manager_id = target_manager and fixture_key = fixture->>'key') then
      for attempt in 1..8 loop
        begin
          insert into public.condominiums(manager_id, name, address, demo_dataset)
          values (target_manager, fixture->>'name', fixture->>'address', 'ori76-v1') returning id into condo;
          exit;
        exception when unique_violation then
          if attempt = 8 then raise; end if;
        end;
      end loop;
      insert into private.account_demo_condominiums values (target_manager, fixture->>'key', condo);
    end if;
  end loop;
  return jsonb_build_object('eligible', true, 'condominiums', (
    select jsonb_agg(jsonb_build_object('key', m.fixture_key, 'slug', c.slug))
    from private.account_demo_condominiums m join public.condominiums c on c.id = m.condominium_id
    where m.manager_id = target_manager
  ));
end;
$$;
revoke all on function public.prepare_account_demo(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.prepare_account_demo(uuid, jsonb) to service_role;

create function public.register_account_demo(target_manager uuid, fixture_key text, registration jsonb)
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
    if existing.registration is distinct from registration then
      raise exception using errcode = '22023', message = 'Demo version mismatch.';
    end if;
    return query select o.id, o.number, o.tracking_code from public.occurrences o where o.id = existing.occurrence_id;
    return;
  end if;
  select * into created from public.register_public_occurrence_with_suggestion(
    registration->>'condominiumSlug', registration->>'reporterName', registration->>'reporterPhone',
    registration->>'reporterUnitOrRole', registration->>'description', registration->>'location',
    registration->>'suggestedPriority', registration->>'suggestionReason', registration->>'suggestionSource'
  );
  insert into private.account_demo_occurrences values (target_manager, fixture_key, created.occurrence_id, registration);
  return query select created.occurrence_id::uuid, created.number::bigint, created.tracking_code::text;
end;
$$;
revoke all on function public.register_account_demo(uuid, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.register_account_demo(uuid, text, jsonb) to service_role;

create or replace function public.portfolio_occurrence_queue()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.role() is distinct from 'authenticated' or not public.has_active_session() then
    raise exception using errcode = '28000', message = 'Active confirmed session required.';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and is_sindico) then
    raise exception using errcode = '42501', message = 'Manager profile required.';
  end if;
  return (
    with visible as materialized (
      select o.id, o.number, o.status, o.registered_at, o.completed_at,
        coalesce(o.final_priority, o.suggested_priority) as effective_priority,
        jsonb_build_object(
          'id', o.id, 'number', o.number, 'status', o.status,
          'condominium', jsonb_build_object('id', c.id, 'name', c.name),
          'isDemo', c.demo_dataset is not null,
          'reporterUnitOrRole', o.reporter_unit_or_role,
          'description', o.description, 'location', o.location,
          'suggestedPriority', o.suggested_priority, 'finalPriority', o.final_priority,
          'effectivePriority', coalesce(o.final_priority, o.suggested_priority),
          'suggestionReason', o.suggestion_reason, 'suggestionSource', o.suggestion_source,
          'suggestionPending', o.suggested_priority is not null and o.final_priority is null and o.priority_decided_at is null,
          'reporterName', o.reporter_name, 'registeredAt', o.registered_at, 'completedAt', o.completed_at
        ) as card
      from public.occurrences o
      join public.condominiums c on c.id = o.condominium_id
      where c.manager_id = auth.uid()
    ), grouped as (
      select status, count(*) as total,
        jsonb_agg(card order by
          case when status <> 'completed' then
            case effective_priority when 'urgent' then 0 when 'normal' then 1 when 'low' then 2 else 3 end
          end asc nulls last,
          case when status <> 'completed' then registered_at end asc,
          case when status = 'completed' then completed_at end desc nulls last,
          number asc, id asc
        ) as items
      from visible group by status
    )
    select jsonb_build_object(
      'columns', (
        select jsonb_object_agg(s.status, jsonb_build_object('count', coalesce(g.total, 0), 'items', coalesce(g.items, '[]'::jsonb)))
        from (values ('new'), ('in_progress'), ('delegated'), ('completed')) s(status)
        left join grouped g on g.status = s.status
      ),
      'openByPriority', jsonb_build_object(
        'urgent', count(*) filter (where status <> 'completed' and effective_priority = 'urgent'),
        'normal', count(*) filter (where status <> 'completed' and effective_priority = 'normal'),
        'low', count(*) filter (where status <> 'completed' and effective_priority = 'low'),
        'unclassified', count(*) filter (where status <> 'completed' and effective_priority is null)
      )
    ) from visible
  );
end;
$$;

notify pgrst, 'reload schema';
commit;
