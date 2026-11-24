begin;

create unique index occurrence_events_one_registration_idx
on public.occurrence_events (occurrence_id) where event_type = 'registered';

create function private.append_occurrence_event(target_occurrence uuid, event_kind text, note text default null)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare
  actor public.profiles%rowtype;
  target public.occurrences%rowtype;
  event_id bigint;
  registration_text text;
begin
  if event_kind = 'manager_update' then
    if auth.role() is distinct from 'authenticated' or not public.has_active_session() then
      raise exception using errcode = '42501', message = 'Active authenticated session required.';
    end if;
    select p.* into actor from public.profiles p where p.id = auth.uid() and p.is_sindico for share;
    if not found then
      raise exception using errcode = '42501', message = 'Occurrence unavailable.';
    end if;
    select o.* into target from public.occurrences o
    join public.condominiums c on c.id = o.condominium_id
    where o.id = target_occurrence and c.manager_id = actor.id
    for share of o, c;
    if not found then
      raise exception using errcode = '42501', message = 'Occurrence unavailable.';
    end if;
    if note is null or note !~ '[^[:space:]]' or length(note) > 10000 then
      raise exception using errcode = '22023', message = 'Invalid internal note.';
    end if;
    if actor.full_name is null or actor.full_name !~ '[^[:space:]]' then
      raise exception using errcode = '22023', message = 'Author profile requires a name.';
    end if;
    insert into public.occurrence_events (
      occurrence_id, event_type, occurred_at, author_type, author_profile_id,
      author_name, author_phone, author_role, internal_description,
      visible_to_resident, public_text, is_human_action, priority_snapshot, data
    ) values (
      target.id, 'manager_update', clock_timestamp(), 'manager', actor.id,
      actor.full_name, nullif(btrim(actor.phone), ''), 'manager', note,
      false, null, true, target.final_priority, '{}'::jsonb
    ) returning id into event_id;
  elsif event_kind = 'registered' then
    select o.* into target from public.occurrences o where o.id = target_occurrence for update;
    if not found or target.origin <> 'public_form' or target.created_by_profile_id is not null
      or target.reporter_name is null or target.reporter_phone is null
      or target.reporter_unit_or_role is null or note is not null then
      raise exception using errcode = '22023', message = 'Invalid public registration.';
    end if;
    registration_text := 'Registrou a ocorrência pelo formulário. Unidade informada: ' || target.reporter_unit_or_role;
    insert into public.occurrence_events (
      occurrence_id, event_type, occurred_at, author_type, author_profile_id,
      author_name, author_phone, author_role, internal_description,
      visible_to_resident, public_text, is_human_action, priority_snapshot, data
    ) values (
      target.id, 'registered', target.registered_at, 'reporter', null,
      target.reporter_name, target.reporter_phone, target.reporter_unit_or_role, registration_text,
      true, registration_text, false, target.final_priority, '{"identity":"self_declared"}'::jsonb
    ) returning id into event_id;
  else
    raise exception using errcode = '22023', message = 'Unsupported occurrence event.';
  end if;
  return event_id;
end;
$$;
revoke all on function private.append_occurrence_event(uuid, text, text) from public, anon, authenticated, service_role;

create or replace function public.append_occurrence_note(target_occurrence uuid, note text)
returns bigint language plpgsql security definer set search_path = '' as $$
begin
  return private.append_occurrence_event(target_occurrence, 'manager_update', note);
end;
$$;
revoke all on function public.append_occurrence_note(uuid, text) from public, anon, service_role;
grant execute on function public.append_occurrence_note(uuid, text) to authenticated;

create function public.register_public_occurrence(
  condominium_slug text, reporter_name text, reporter_phone text,
  reporter_unit_or_role text, description text
)
returns table (occurrence_id uuid, number bigint, tracking_code text)
language plpgsql security definer set search_path = '' as $$
declare
  target_condominium uuid;
  created public.occurrences%rowtype;
begin
  if condominium_slug is null or length(condominium_slug) > 200
    or condominium_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*-([0-9a-f]{32}|[a-z0-9]{4})$'
    or reporter_name is null or reporter_name !~ '[^[:space:]]' or length(reporter_name) > 200
    or reporter_phone is null or reporter_phone !~ '^[1-9][0-9]{9,10}$'
    or reporter_unit_or_role is null or reporter_unit_or_role !~ '[^[:space:]]' or length(reporter_unit_or_role) > 200
    or description is null or description !~ '[^[:space:]]' or length(description) > 10000 then
    raise exception using errcode = '22023', message = 'Invalid public registration.';
  end if;
  select c.id into target_condominium from public.condominiums c
  join public.profiles p on p.id = c.manager_id
  where c.slug = condominium_slug and p.is_sindico
  for share of c, p;
  if not found then
    raise exception using errcode = '22023', message = 'Invalid public registration.';
  end if;
  insert into public.occurrences (
    condominium_id, origin, channel, description, reporter_name, reporter_phone, reporter_unit_or_role
  ) values (
    target_condominium, 'public_form', 'web', btrim(description),
    btrim(reporter_name), reporter_phone, btrim(reporter_unit_or_role)
  ) returning * into created;
  perform private.append_occurrence_event(created.id, 'registered');
  return query select created.id, created.number, created.tracking_code;
end;
$$;
revoke all on function public.register_public_occurrence(text, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.register_public_occurrence(text, text, text, text, text) to service_role;

commit;
