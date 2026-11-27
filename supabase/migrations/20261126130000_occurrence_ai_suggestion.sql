-- ORI-71 (S2.3): permite que a sugestão gravada na ocorrência venha da IA.
--
-- Estende register_public_occurrence_with_suggestion (ORI-74) para aceitar:
--   - calculated_source = 'ai' (além de 'rules');
--   - calculated_priority = 'low' (a IA pode sugerir Baixa);
--   - calculated_category e calculated_ai_failure_reason.
--
-- Mantém a validação estrita do caminho 'rules' (formato do motivo), para o
-- fallback por regras continuar à prova de forja. É SECURITY DEFINER e só o
-- service_role executa (o serviço calcula a sugestão; o anônimo não a envia).

begin;

drop function if exists public.register_public_occurrence_with_suggestion(
  text, text, text, text, text, text, text, text, text
);

create function public.register_public_occurrence_with_suggestion(
  condominium_slug text, reporter_name text, reporter_phone text,
  reporter_unit_or_role text, description text, location text,
  calculated_priority text, calculated_reason text, calculated_source text,
  calculated_category text default null,
  calculated_ai_failure_reason text default null
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

  if calculated_source is null or calculated_source not in ('rules', 'ai')
    or calculated_priority is null or calculated_priority not in ('low', 'normal', 'urgent')
    or calculated_reason is null or calculated_reason !~ '[^[:space:]]' or length(calculated_reason) > 300
    or (calculated_category is not null
        and (calculated_category !~ '[^[:space:]]' or length(calculated_category) > 100))
    or (calculated_ai_failure_reason is not null
        and (calculated_ai_failure_reason !~ '[^[:space:]]' or length(calculated_ai_failure_reason) > 300))
    -- O caminho por regras mantém o formato exato do motivo (anti-forja).
    or (calculated_source = 'rules' and calculated_priority = 'low')
    or (calculated_source = 'rules' and calculated_priority = 'normal'
        and calculated_reason <> 'Sem sinal de risco no relato.')
    or (calculated_source = 'rules' and calculated_priority = 'urgent'
        and calculated_reason !~ '^Menciona [^[:cntrl:]]+: risco à segurança\.$') then
    raise exception using errcode = '22023', message = 'Invalid suggestion.';
  end if;

  select c.id into target_condominium from public.condominiums c
  join public.profiles p on p.id = c.manager_id
  where c.slug = condominium_slug and p.is_sindico
  for share of c, p;
  if not found then
    raise exception using errcode = '22023', message = 'Invalid public registration.';
  end if;

  insert into public.occurrences (
    condominium_id, origin, channel, location, description,
    reporter_name, reporter_phone, reporter_unit_or_role,
    suggested_priority, suggestion_reason, suggestion_source, suggestion_at,
    category, ai_failure_reason
  ) values (
    target_condominium, 'public_form', 'web', btrim(location), btrim(description),
    btrim(reporter_name), reporter_phone, btrim(reporter_unit_or_role),
    calculated_priority, calculated_reason, calculated_source, clock_timestamp(),
    calculated_category, calculated_ai_failure_reason
  ) returning * into created;

  perform private.append_occurrence_event(created.id, 'registered');
  return query select created.id, created.number, created.tracking_code;
end;
$$;

revoke all on function public.register_public_occurrence_with_suggestion(
  text, text, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.register_public_occurrence_with_suggestion(
  text, text, text, text, text, text, text, text, text, text, text
) to service_role;

-- O wrapper idempotente do formulário público também precisa conhecer os dois
-- campos novos: a camada de serviço já os envia para esta RPC quando há
-- attempt_key (caminho real do formulário), então, sem isso, a submissão do
-- morador falha com erro. A assinatura atual (completion-evidence, ORI-79) tem
-- upload_secret e trata sessões de upload de evidências; reproduzimos esse corpo
-- integralmente e só acrescentamos category/ai_failure_reason, encaminhando-os
-- para a RPC de 11 argumentos acima. O fingerprint de deduplicação continua
-- sobre os dados do morador (a sugestão é derivada no servidor).
drop function if exists public.register_public_occurrence_attempt(
  text, uuid, text, text, text, text, text, text, text, text, text
);

create function public.register_public_occurrence_attempt(
  condominium_slug text, attempt_key uuid, reporter_name text, reporter_phone text,
  reporter_unit_or_role text, description text, location text,
  calculated_priority text, calculated_reason text, calculated_source text,
  calculated_category text default null,
  calculated_ai_failure_reason text default null,
  upload_secret text default null
) returns table (occurrence_id uuid, number bigint, tracking_code text)
language plpgsql security definer set search_path = '' as $$
declare
  target uuid;
  fingerprint bytea;
  previous private.public_registration_attempts%rowtype;
  receipt record;
  s private.occurrence_upload_sessions%rowtype;
  manifest_hash jsonb;
  initial_event bigint;
begin
  if attempt_key is null then raise exception using errcode='22023', message='Invalid attempt key.'; end if;
  select c.id into target from public.condominiums c join public.profiles p on p.id=c.manager_id and p.is_sindico
  where c.slug=condominium_slug for share of c,p;
  if not found then raise exception using errcode='P0002', message='Public link unavailable.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target::text || ':' || attempt_key::text,0));
  select * into s from private.occurrence_upload_sessions where id=attempt_key for update;
  if found then
    if s.purpose<>'registration' or s.condominium_id<>target or upload_secret is null or s.secret_hash<>extensions.digest(upload_secret,'sha256') then
      raise exception using errcode='P0002', message='Upload unavailable.';
    end if;
    if s.state<>'linked' and (s.state<>'open' or s.expires_at<=clock_timestamp()) then
      raise exception using errcode='P0003', message='Upload is closed.';
    end if;
    if exists(select 1 from private.occurrence_upload_files where session_id=s.id and state<>'valid') then
      raise exception using errcode='P0003', message='All files must be validated.';
    end if;
    select jsonb_agg(jsonb_build_array(f.id,f.file_name,f.content_type,f.size_bytes,f.sha256) order by f.id)
    into manifest_hash from private.occurrence_upload_files f where f.session_id=s.id;
  elsif upload_secret is not null then raise exception using errcode='P0002', message='Upload unavailable.';
  end if;
  fingerprint := extensions.digest(convert_to((jsonb_build_array(reporter_name,reporter_phone,reporter_unit_or_role,location,description)
    || case when s.id is null then '[]'::jsonb else jsonb_build_array(manifest_hash) end)::text,'UTF8'),'sha256');
  select * into previous from private.public_registration_attempts a where a.condominium_id=target and a.attempt_key=register_public_occurrence_attempt.attempt_key;
  if found then
    if previous.content_hash<>fingerprint then raise exception using errcode='P0003', message='Attempt content conflict.'; end if;
    return query select o.id,o.number,o.tracking_code from public.occurrences o where o.id=previous.occurrence_id;
    return;
  end if;
  select * into receipt from public.register_public_occurrence_with_suggestion(condominium_slug,reporter_name,reporter_phone,reporter_unit_or_role,description,location,calculated_priority,calculated_reason,calculated_source,calculated_category,calculated_ai_failure_reason);
  if s.id is not null then
    select e.id into strict initial_event from public.occurrence_events e where e.occurrence_id=receipt.occurrence_id and e.event_type='registered';
    insert into public.occurrence_attachments(occurrence_id,event_id,storage_bucket,storage_path,file_name,content_type,size_bytes)
    select receipt.occurrence_id,initial_event,'occurrence-evidence',f.evidence_path,f.file_name,f.content_type,f.size_bytes
    from private.occurrence_upload_files f where f.session_id=s.id;
    update private.occurrence_upload_sessions set state='linked',occurrence_id=receipt.occurrence_id,last_activity_at=clock_timestamp() where id=s.id;
  end if;
  insert into private.public_registration_attempts values(target,attempt_key,fingerprint,receipt.occurrence_id);
  return query select receipt.occurrence_id::uuid,receipt.number::bigint,receipt.tracking_code::text;
end;
$$;
revoke all on function public.register_public_occurrence_attempt(text,uuid,text,text,text,text,text,text,text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.register_public_occurrence_attempt(text,uuid,text,text,text,text,text,text,text,text,text,text,text) to service_role;

notify pgrst, 'reload schema';

commit;
