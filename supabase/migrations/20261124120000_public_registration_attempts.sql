begin;

create table private.public_registration_attempts (
  condominium_id uuid not null references public.condominiums(id) on delete cascade,
  attempt_key uuid not null,
  content_hash bytea not null,
  occurrence_id uuid not null references public.occurrences(id),
  primary key (condominium_id, attempt_key)
);
alter table private.public_registration_attempts enable row level security;
revoke all on private.public_registration_attempts from public, anon, authenticated, service_role;

create or replace function public.resolve_condominium_link(p_slug text)
returns table (name text, address text)
language sql stable security definer set search_path = '' as $$
  select c.name, c.address from public.condominiums c
  join public.profiles p on p.id = c.manager_id and p.is_sindico
  where c.slug = p_slug limit 1;
$$;

create function public.register_public_occurrence_attempt(
  condominium_slug text, attempt_key uuid, reporter_name text, reporter_phone text,
  reporter_unit_or_role text, description text, location text,
  calculated_priority text, calculated_reason text, calculated_source text
)
returns table (occurrence_id uuid, number bigint, tracking_code text)
language plpgsql security definer set search_path = '' as $$
declare
  target uuid;
  fingerprint bytea;
  previous private.public_registration_attempts%rowtype;
  receipt record;
begin
  if attempt_key is null then
    raise exception using errcode = '22023', message = 'Invalid attempt key.';
  end if;
  select c.id into target from public.condominiums c
  join public.profiles p on p.id = c.manager_id and p.is_sindico
  where c.slug = condominium_slug for share of c, p;
  if not found then
    raise exception using errcode = 'P0002', message = 'Public link unavailable.';
  end if;
  fingerprint := extensions.digest(convert_to(jsonb_build_array(
    reporter_name, reporter_phone, reporter_unit_or_role, location, description
  )::text, 'UTF8'), 'sha256');
  perform pg_advisory_xact_lock(hashtextextended(target::text || ':' || attempt_key::text, 0));
  select a.* into previous from private.public_registration_attempts a
  where a.condominium_id = target and a.attempt_key = register_public_occurrence_attempt.attempt_key;
  if found then
    if previous.content_hash <> fingerprint then
      raise exception using errcode = 'P0003', message = 'Attempt content conflict.';
    end if;
    return query select o.id, o.number, o.tracking_code from public.occurrences o
    where o.id = previous.occurrence_id;
    return;
  end if;
  select * into receipt from public.register_public_occurrence_with_suggestion(
    condominium_slug, reporter_name, reporter_phone, reporter_unit_or_role,
    description, location, calculated_priority, calculated_reason, calculated_source
  );
  insert into private.public_registration_attempts values (target, attempt_key, fingerprint, receipt.occurrence_id);
  return query select receipt.occurrence_id::uuid, receipt.number::bigint, receipt.tracking_code::text;
end;
$$;
revoke all on function public.register_public_occurrence_attempt(text, uuid, text, text, text, text, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.register_public_occurrence_attempt(text, uuid, text, text, text, text, text, text, text, text) to service_role;
notify pgrst, 'reload schema';
commit;
