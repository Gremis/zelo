-- ORI-89 (scaffold): registro de ocorrência pelo síndico (painel).
-- Reaproveita o modelo de ocorrência/histórico das ORIs 40/59. A ocorrência
-- entra com origin 'manager_panel', o canal de "como chegou" (WhatsApp,
-- telefone, pessoalmente, e-mail ou vistoria) e o síndico como autor do evento
-- 'registered'. Quem relatou é opcional.
--
-- TODO(ORI-89):
--   * cobrir com pgTAP e regenerar src/lib/supabase/database.types.ts
--     (supabase gen types) depois de aplicar; a entrada de register_manager_occurrence
--     foi adicionada à mão como placeholder.
--   * a sugestão aqui é só por regras; a IA (ORI-71) substitui calculated_* ao integrar.
--   * anexar o print depende da ORI-66 (upload), fora deste scaffold.
begin;

-- "Como chegou" pelo painel: além dos canais existentes, aceita e-mail e vistoria.
alter table public.occurrences drop constraint occurrences_channel_check;
alter table public.occurrences add constraint occurrences_channel_check
  check (channel in ('web', 'whatsapp', 'phone', 'in_person', 'email', 'inspection', 'other'));

-- O evento 'registered' agora também cobre o registro pelo painel (autor = síndico).
create or replace function private.append_occurrence_event(target_occurrence uuid, event_kind text, note text default null)
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
    if not found or note is not null then
      raise exception using errcode = '22023', message = 'Invalid registration event.';
    end if;
    if target.origin = 'public_form' then
      if target.created_by_profile_id is not null
        or target.reporter_name is null or target.reporter_phone is null
        or target.reporter_unit_or_role is null then
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
    elsif target.origin = 'manager_panel' then
      if target.created_by_profile_id is null then
        raise exception using errcode = '22023', message = 'Invalid manager registration.';
      end if;
      select p.* into actor from public.profiles p where p.id = target.created_by_profile_id;
      if not found or actor.full_name is null or actor.full_name !~ '[^[:space:]]' then
        raise exception using errcode = '22023', message = 'Author profile requires a name.';
      end if;
      registration_text := 'Registrou a ocorrência pelo painel (canal: ' || target.channel || ').';
      insert into public.occurrence_events (
        occurrence_id, event_type, occurred_at, author_type, author_profile_id,
        author_name, author_phone, author_role, internal_description,
        visible_to_resident, public_text, is_human_action, priority_snapshot, data
      ) values (
        target.id, 'registered', target.registered_at, 'manager', actor.id,
        actor.full_name, nullif(btrim(actor.phone), ''), 'manager', registration_text,
        false, null, false, target.final_priority, jsonb_build_object('channel', target.channel)
      ) returning id into event_id;
    else
      raise exception using errcode = '22023', message = 'Unsupported occurrence origin.';
    end if;
  else
    raise exception using errcode = '22023', message = 'Unsupported occurrence event.';
  end if;
  return event_id;
end;
$$;
revoke all on function private.append_occurrence_event(uuid, text, text) from public, anon, authenticated, service_role;

-- RPC autenticada: roda como o síndico (auth.uid()) e valida que ele é dono do condomínio.
create function public.register_manager_occurrence(
  condominium_id uuid, channel text, description text, location text,
  reporter_name text default null, reporter_phone text default null,
  reporter_unit_or_role text default null,
  calculated_priority text default null, calculated_reason text default null,
  calculated_source text default null
)
returns table (occurrence_id uuid, number bigint, tracking_code text)
language plpgsql security definer set search_path = '' as $$
declare
  actor public.profiles%rowtype;
  target_condominium uuid;
  created public.occurrences%rowtype;
begin
  if auth.role() is distinct from 'authenticated' or not public.has_active_session() then
    raise exception using errcode = '42501', message = 'Active authenticated session required.';
  end if;
  select p.* into actor from public.profiles p where p.id = auth.uid() and p.is_sindico for share;
  if not found or actor.full_name is null or actor.full_name !~ '[^[:space:]]' then
    raise exception using errcode = '42501', message = 'Manager profile unavailable.';
  end if;
  select c.id into target_condominium from public.condominiums c
  where c.id = condominium_id and c.manager_id = actor.id for share of c;
  if not found then
    raise exception using errcode = '42501', message = 'Condominium unavailable.';
  end if;
  if channel is null or channel not in ('whatsapp', 'phone', 'in_person', 'email', 'inspection')
    or location is null or location !~ '[^[:space:]]' or length(location) > 200
    or description is null or description !~ '[^[:space:]]' or length(description) > 10000
    or (reporter_name is not null and (reporter_name !~ '[^[:space:]]' or length(reporter_name) > 200))
    or (reporter_phone is not null and reporter_phone !~ '^[1-9][0-9]{9,10}$')
    or (reporter_unit_or_role is not null and (reporter_unit_or_role !~ '[^[:space:]]' or length(reporter_unit_or_role) > 200)) then
    raise exception using errcode = '22023', message = 'Invalid manager registration.';
  end if;
  if calculated_source is distinct from 'rules'
    or calculated_priority is null or calculated_priority not in ('urgent', 'normal')
    or calculated_reason is null or length(calculated_reason) > 300
    or (calculated_priority = 'normal' and calculated_reason <> 'Sem sinal de risco no relato.')
    or (calculated_priority = 'urgent' and calculated_reason !~ '^Menciona [^[:cntrl:]]+: risco à segurança\.$') then
    raise exception using errcode = '22023', message = 'Invalid rule suggestion.';
  end if;
  insert into public.occurrences (
    condominium_id, origin, channel, location, description,
    reporter_name, reporter_phone, reporter_unit_or_role, created_by_profile_id,
    suggested_priority, suggestion_reason, suggestion_source, suggestion_at
  ) values (
    target_condominium, 'manager_panel', channel, btrim(location), btrim(description),
    nullif(btrim(coalesce(reporter_name, '')), ''), reporter_phone,
    nullif(btrim(coalesce(reporter_unit_or_role, '')), ''), actor.id,
    calculated_priority, calculated_reason, calculated_source, clock_timestamp()
  ) returning * into created;
  perform private.append_occurrence_event(created.id, 'registered');
  return query select created.id, created.number, created.tracking_code;
end;
$$;
revoke all on function public.register_manager_occurrence(uuid, text, text, text, text, text, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.register_manager_occurrence(uuid, text, text, text, text, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
