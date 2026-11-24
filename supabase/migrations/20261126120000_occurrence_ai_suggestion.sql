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

notify pgrst, 'reload schema';

commit;
