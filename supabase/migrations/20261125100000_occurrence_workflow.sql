begin;

alter table public.occurrences
  add column responsible_kind text check (responsible_kind in ('manager','provider','employee')),
  add column responsible_employee_id uuid references public.funcionarios(id) on delete restrict,
  add column first_responsible_at timestamptz,
  add column delegation_started_at timestamptz,
  add column due_date date,
  add column version bigint not null default 0;

update public.occurrences set
  due_date = (due_at at time zone 'America/Sao_Paulo')::date,
  responsible_kind = case when responsible_profile_id is not null then 'manager' when responsible_name is not null then 'provider' end,
  first_responsible_at = (select min(e.occurred_at) from public.occurrence_events e where e.occurrence_id=occurrences.id and e.event_type='responsible_changed');

create table private.occurrence_commands (
  occurrence_id uuid not null references public.occurrences(id),
  command_key uuid not null,
  actor_id uuid not null references public.profiles(id),
  payload jsonb not null,
  receipt jsonb not null,
  primary key (occurrence_id, command_key)
);
alter table private.occurrence_commands enable row level security;
revoke all on private.occurrence_commands from public, anon, authenticated, service_role;

create function private.append_occurrence_event(target_occurrence uuid, event_kind text, note text, event_data jsonb)
returns bigint language plpgsql security invoker set search_path='' as $$
declare actor public.profiles%rowtype; target public.occurrences%rowtype; event_id bigint;
begin
  select * into actor from public.profiles where id=auth.uid() and is_sindico;
  select * into target from public.occurrences where id=target_occurrence;
  if actor.id is null or not exists(select 1 from public.condominiums where id=target.condominium_id and manager_id=actor.id) then
    raise exception using errcode='42501', message='Occurrence unavailable.';
  end if;
  insert into public.occurrence_events(occurrence_id,event_type,author_type,author_profile_id,author_name,author_phone,author_role,internal_description,is_human_action,priority_snapshot,previous_responsible_name,responsible_name,responsible_phone,responsible_role,delegation_started_at,data)
  values(target.id,event_kind,'manager',actor.id,actor.full_name,actor.phone,'manager',note,true,coalesce(target.final_priority,target.suggested_priority),event_data->>'previousResponsibleName',target.responsible_name,target.responsible_phone,target.responsible_role,target.delegation_started_at,event_data)
  returning id into event_id;
  return event_id;
end;
$$;
revoke all on function private.append_occurrence_event(uuid,text,text,jsonb) from public,anon,authenticated,service_role;

create function public.protect_completed_occurrence()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.status='completed' then raise exception using errcode='P0003', message='Completed occurrence is locked.'; end if;
  new.version := old.version+1;
  if old.first_responsible_at is not null then new.first_responsible_at := old.first_responsible_at; end if;
  return new;
end;
$$;
create trigger occurrence_terminal before update on public.occurrences for each row execute function public.protect_completed_occurrence();

create function public.protect_completed_occurrence_event()
returns trigger language plpgsql set search_path='' as $$
begin
  perform 1 from public.occurrences where id=new.occurrence_id for update;
  if new.event_type <> 'completed' and exists(select 1 from public.occurrences where id=new.occurrence_id and status='completed') then
    raise exception using errcode='P0003', message='Completed occurrence is locked.';
  end if;
  return new;
end;
$$;
create trigger occurrence_event_terminal before insert on public.occurrence_events for each row execute function public.protect_completed_occurrence_event();
create or replace function public.occurrence_detail(target_occurrence uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  detail jsonb;
begin
  if auth.role() is distinct from 'authenticated' or not public.has_active_session() then
    raise exception using errcode = '28000', message = 'Active confirmed session required.';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and is_sindico) then
    raise exception using errcode = '42501', message = 'Manager profile required.';
  end if;
  select jsonb_build_object(
    'id', o.id,
    'number', o.number,
    'status', o.status,
    'condominium', jsonb_build_object('id', c.id, 'name', c.name),
    'description', o.description,
    'location', o.location,
    'reporterName', o.reporter_name,
    'reporterPhone', o.reporter_phone,
    'reporterUnitOrRole', o.reporter_unit_or_role,
    'registeredAt', o.registered_at,
    'completedAt', o.completed_at,
    'version', o.version,
    'responsibleKind', o.responsible_kind,
    'responsibleName', o.responsible_name,
    'responsibleEmployeeId', o.responsible_employee_id,
    'firstResponsibleAt', o.first_responsible_at,
    'dueDate', o.due_date,
    'suggestedPriority', o.suggested_priority,
    'finalPriority', o.final_priority,
    'effectivePriority', coalesce(o.final_priority, o.suggested_priority),
    'suggestionReason', o.suggestion_reason,
    'suggestionSource', o.suggestion_source,
    'priorityDecidedAt', o.priority_decided_at,
    'suggestionPending', o.priority_decided_at is null,
    'priorityChangeReason', o.priority_change_reason,
    'category', o.category,
    'canDecidePriority', o.status <> 'completed',
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'type', e.event_type,
        'occurredAt', e.occurred_at,
        'authorType', e.author_type,
        'authorName', e.author_name,
        'authorPhone', e.author_phone,
        'authorRole', e.author_role,
        'authorIsViewer', e.author_profile_id is not distinct from auth.uid(),
        'text', e.internal_description,
        'attachments', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.file_name, 'contentType', a.content_type, 'size', a.size_bytes)) from public.occurrence_attachments a where a.event_id=e.id and a.occurrence_id=o.id), '[]'::jsonb)
      ) order by e.occurred_at desc, e.id desc)
      from public.occurrence_events e
      where e.occurrence_id = o.id and e.author_type <> 'system'
    ), '[]'::jsonb)
  ) into detail
  from public.occurrences o
  join public.condominiums c on c.id = o.condominium_id
  where o.id = target_occurrence and c.manager_id = auth.uid();
  return detail;
end;
$$;
revoke all on function public.occurrence_detail(uuid) from public, anon, authenticated, service_role;
grant execute on function public.occurrence_detail(uuid) to authenticated;


create function public.occurrence_command(target_occurrence uuid, command_key uuid, expected_version bigint, command_type text, payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.occurrences%rowtype; employee public.funcionarios%rowtype; actor public.profiles%rowtype;
  prior private.occurrence_commands%rowtype; canonical jsonb; receipt jsonb; event_id bigint; next_name text; next_kind text; next_date date; stamp timestamptz := clock_timestamp();
begin
  if auth.role() is distinct from 'authenticated' or not public.has_active_session() then raise exception using errcode='42501',message='Active session required.'; end if;
  select * into actor from public.profiles where id=auth.uid() and is_sindico for share;
  if actor.id is null or command_key is null or jsonb_typeof(payload) is distinct from 'object' then raise exception using errcode='22023',message='Invalid command.'; end if;
  if command_type='delegate' then
    select * into employee from public.funcionarios where id=(payload->>'employeeId')::uuid for update;
  end if;
  select o.* into target from public.occurrences o join public.condominiums c on c.id=o.condominium_id where o.id=target_occurrence and c.manager_id=actor.id for update of o;
  if not found then raise exception using errcode='42501',message='Occurrence unavailable.'; end if;
  canonical := jsonb_build_object('type',command_type,'payload',payload,'version',expected_version);
  select * into prior from private.occurrence_commands where occurrence_id=target.id and occurrence_commands.command_key=occurrence_command.command_key;
  if found then
    if prior.actor_id<>actor.id or prior.payload<>canonical then raise exception using errcode='P0003',message='Command key conflict.'; end if;
    return prior.receipt;
  end if;
  if target.status='completed' or expected_version is distinct from target.version then raise exception using errcode='P0003',message='Occurrence changed.'; end if;
  if command_type='responsible' then
    next_kind := payload->>'kind';
    next_name := case when next_kind='manager' then actor.full_name else nullif(btrim(payload->>'name'),'') end;
    if next_kind not in ('manager','provider') or next_kind is null or next_name is null or length(next_name)>200 then raise exception using errcode='22023',message='Invalid responsible.'; end if;
    if target.responsible_kind is not distinct from next_kind and target.responsible_name is not distinct from next_name and target.status='in_progress' then receipt:=public.occurrence_detail(target.id);
    else
      update public.occurrences set status='in_progress',responsible_kind=next_kind,responsible_profile_id=case when next_kind='manager' then actor.id end,responsible_employee_id=null,responsible_name=next_name,responsible_phone=null,responsible_role=case when next_kind='manager' then 'Síndico' else 'Prestador ou administradora' end,first_responsible_at=coalesce(first_responsible_at,stamp),delegation_started_at=null where id=target.id;
      event_id:=private.append_occurrence_event(target.id,'responsible_changed','Responsável definido: '||next_name||case when target.responsible_name is null then '.' else '. Anterior: '||target.responsible_name||'.' end,jsonb_build_object('previousResponsibleName',target.responsible_name));
    end if;
  elsif command_type='delegate' then
    if employee.id is null or not employee.ativo or employee.condominio_id<>target.condominium_id or employee.sindico_id<>actor.id or nullif(btrim(payload->>'message'),'') is null or length(payload->>'message')>10000 then raise exception using errcode='22023',message='Employee unavailable.'; end if;
    update public.occurrences set status='delegated',responsible_kind='employee',responsible_profile_id=null,responsible_employee_id=employee.id,responsible_name=employee.nome,responsible_phone=employee.celular,responsible_role=(select nome from public.funcoes where id=employee.funcao_id),first_responsible_at=coalesce(first_responsible_at,stamp),delegation_started_at=stamp,due_date=null,due_at=null where id=target.id;
    event_id:=private.append_occurrence_event(target.id,'responsible_changed','Delegação salva para '||employee.nome||'. Envio pelo WhatsApp não confirmado.'||case when target.responsible_name is null then '' else ' Anterior: '||target.responsible_name||'.' end,jsonb_build_object('previousResponsibleName',target.responsible_name,'message',payload->>'message','intent','whatsapp_delegation'));
    if target.due_date is not null then perform private.append_occurrence_event(target.id,'deadline_changed','Previsão removida ao delegar.',jsonb_build_object('previousDueDate',target.due_date,'dueDate',null)); end if;
  elsif command_type='deadline' then
    if target.status<>'in_progress' then raise exception using errcode='P0003',message='Deadline requires in progress.'; end if;
    if payload->>'date' is not null and (payload->>'date' !~ '^\d{4}-\d{2}-\d{2}$') then raise exception using errcode='22023',message='Invalid date.'; end if;
    next_date:=(payload->>'date')::date;
    if next_date is distinct from target.due_date then
      update public.occurrences set due_date=next_date,due_at=null where id=target.id;
      event_id:=private.append_occurrence_event(target.id,'deadline_changed',case when next_date is null then 'Previsão removida.' else 'Previsão definida: '||to_char(next_date,'DD/MM/YYYY')||'.' end,jsonb_build_object('previousDueDate',target.due_date,'dueDate',next_date));
    else receipt:=public.occurrence_detail(target.id); end if;
  elsif command_type='complete' then
    if target.status not in ('in_progress','delegated') then raise exception using errcode='P0003',message='Completion requires responsibility.'; end if;
    if length(coalesce(payload->>'comment',''))>10000 then raise exception using errcode='22023',message='Invalid comment.'; end if;
    if target.priority_decided_at is null and target.suggested_priority is not null then
      update public.occurrences set final_priority=suggested_priority,decided_priority=suggested_priority,decided_suggested_priority=suggested_priority,priority_decided_at=stamp where id=target.id;
    end if;
    update public.occurrences set status='completed',completed_at=stamp where id=target.id;
    event_id:=private.append_occurrence_event(target.id,'completed','Ocorrência concluída.'||case when nullif(btrim(payload->>'comment'),'') is null then '' else ' '||btrim(payload->>'comment') end,jsonb_build_object('comment',nullif(btrim(payload->>'comment'),'')));
    perform private.link_completion_upload(target.id,event_id,payload);
  else raise exception using errcode='22023',message='Unsupported command.';
  end if;
  if receipt is null then
    if command_type<>'complete' and target.priority_decided_at is null and target.suggested_priority is not null then
      update public.occurrences set final_priority=suggested_priority,decided_priority=suggested_priority,decided_suggested_priority=suggested_priority,priority_decided_at=stamp where id=target.id;
    end if;
    receipt:=public.occurrence_detail(target.id);
  end if;
  insert into private.occurrence_commands values(target.id,command_key,actor.id,canonical,receipt);
  return receipt;
end;
$$;
revoke all on function public.occurrence_command(uuid,uuid,bigint,text,jsonb) from public,anon,service_role;
grant execute on function public.occurrence_command(uuid,uuid,bigint,text,jsonb) to authenticated;

create function public.release_deactivated_employee_occurrences()
returns trigger language plpgsql security definer set search_path='' as $$
declare target public.occurrences%rowtype;
begin
  if old.ativo and not new.ativo then
    if not public.has_active_session() or auth.uid() is distinct from new.sindico_id then raise exception using errcode='42501',message='Active manager required.'; end if;
    for target in select * from public.occurrences where responsible_employee_id=new.id and status<>'completed' order by id for update loop
      update public.occurrences set status='new',responsible_kind=null,responsible_employee_id=null,responsible_profile_id=null,responsible_name=null,responsible_phone=null,responsible_role=null,due_date=null,due_at=null,delegation_started_at=null where id=target.id;
      perform private.append_occurrence_event(target.id,'responsible_changed','Ocorrência devolvida para Novo pela desativação de '||old.nome||'.',jsonb_build_object('previousResponsibleName',target.responsible_name,'cause','employee_deactivated'));
      if target.due_date is not null then perform private.append_occurrence_event(target.id,'deadline_changed','Previsão removida pela desativação do funcionário.',jsonb_build_object('previousDueDate',target.due_date,'dueDate',null)); end if;
    end loop;
  end if;
  return new;
end;
$$;
create trigger employee_release_occurrences after update of ativo on public.funcionarios for each row execute function public.release_deactivated_employee_occurrences();

commit;
