begin;

revoke all on function public.register_public_occurrence(text, text, text, text, text)
from public, anon, authenticated, service_role;

create function public.protect_occurrence_suggestion()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if row(new.suggested_priority, new.suggestion_reason, new.suggestion_source, new.suggestion_at)
    is distinct from row(old.suggested_priority, old.suggestion_reason, old.suggestion_source, old.suggestion_at) then
    raise exception using errcode = '42501', message = 'Original occurrence suggestion is immutable.';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_occurrence_suggestion() from public, anon, authenticated, service_role;

create trigger occurrences_preserve_suggestion before update on public.occurrences
for each row execute function public.protect_occurrence_suggestion();

create function public.register_public_occurrence_with_suggestion(
  condominium_slug text, reporter_name text, reporter_phone text,
  reporter_unit_or_role text, description text, location text,
  calculated_priority text, calculated_reason text, calculated_source text
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
    or location is null or location !~ '[^[:space:]]' or length(location) > 200
    or description is null or description !~ '[^[:space:]]' or length(description) > 10000 then
    raise exception using errcode = '22023', message = 'Invalid public registration.';
  end if;
  if calculated_source is distinct from 'rules'
    or calculated_priority is null or calculated_priority not in ('urgent', 'normal')
    or calculated_reason is null or length(calculated_reason) > 300
    or (calculated_priority = 'normal' and calculated_reason <> 'Sem sinal de risco no relato.')
    or (calculated_priority = 'urgent' and calculated_reason !~ '^Menciona [^[:cntrl:]]+: risco à segurança\.$') then
    raise exception using errcode = '22023', message = 'Invalid rule suggestion.';
  end if;
  select c.id into target_condominium from public.condominiums c
  join public.profiles p on p.id = c.manager_id
  where c.slug = condominium_slug and p.is_sindico
  for share of c, p;
  if not found then
    raise exception using errcode = '22023', message = 'Invalid public registration.';
  end if;
  insert into public.occurrences (
    condominium_id, origin, channel, location, description, reporter_name, reporter_phone, reporter_unit_or_role,
    suggested_priority, suggestion_reason, suggestion_source, suggestion_at
  ) values (
    target_condominium, 'public_form', 'web', btrim(location), btrim(description),
    btrim(reporter_name), reporter_phone, btrim(reporter_unit_or_role),
    calculated_priority, calculated_reason, calculated_source, clock_timestamp()
  ) returning * into created;
  perform private.append_occurrence_event(created.id, 'registered');
  return query select created.id, created.number, created.tracking_code;
end;
$$;
revoke all on function public.register_public_occurrence_with_suggestion(text, text, text, text, text, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.register_public_occurrence_with_suggestion(text, text, text, text, text, text, text, text, text) to service_role;


notify pgrst, 'reload schema';

commit;
