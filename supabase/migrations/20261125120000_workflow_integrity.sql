begin;

alter function public.occurrence_upload_operation(text,uuid,text,text,jsonb) set schema private;
revoke all on function private.occurrence_upload_operation(text,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
create function public.occurrence_upload_operation(operation text, session_key uuid, condominium_slug text default null, upload_secret text default null, payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception using errcode='42501',message='Server required.'; end if;
 if operation not in ('cleanup','cleaned') and exists(select 1 from private.occurrence_upload_sessions where id=session_key and purpose<>'registration') then raise exception using errcode='P0002',message='Upload unavailable.'; end if;
 return private.occurrence_upload_operation(operation,session_key,condominium_slug,upload_secret,payload);
end;
$$;
revoke all on function public.occurrence_upload_operation(text,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.occurrence_upload_operation(text,uuid,text,text,jsonb) to service_role;
create or replace function public.manager_occurrence_upload_operation(operation text, session_key uuid, target_occurrence uuid, actor_profile uuid, upload_secret text, payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare slug text; s private.occurrence_upload_sessions%rowtype; result jsonb; state text;
begin
 if auth.role() is distinct from 'service_role' then raise exception using errcode='42501',message='Server required.'; end if;
 select c.slug,o.status into slug,state from public.occurrences o join public.condominiums c on c.id=o.condominium_id join public.profiles p on p.id=c.manager_id and p.is_sindico where o.id=target_occurrence and c.manager_id=actor_profile;
 if slug is null then raise exception using errcode='P0002',message='Occurrence unavailable.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('manager-upload:'||session_key::text,0));
 select * into s from private.occurrence_upload_sessions where id=session_key for update;
 if found and (s.purpose<>'completion' or s.target_occurrence_id is distinct from target_occurrence or s.manager_id is distinct from actor_profile) then raise exception using errcode='P0002',message='Upload unavailable.'; end if;
 if operation not in ('prepare','status','cancel','authorize','claim','validated','failed','retry') then raise exception using errcode='22023',message='Invalid operation.'; end if;
 if state not in ('in_progress','delegated') and operation not in ('status','cancel') then raise exception using errcode='P0003',message='Occurrence is locked.'; end if;
 result:=private.occurrence_upload_operation(operation,session_key,slug,upload_secret,payload);
 if operation='prepare' and s.id is null then
   update private.occurrence_upload_sessions set purpose='completion',target_occurrence_id=target_occurrence,manager_id=actor_profile where id=session_key;
 end if;
 return result;
end;
$$;
revoke all on function public.manager_occurrence_upload_operation(text,uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.manager_occurrence_upload_operation(text,uuid,uuid,uuid,text,jsonb) to service_role;

create or replace function public.occurrence_command(target_occurrence uuid, command_key uuid, expected_version bigint, command_type text, payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.occurrences%rowtype; employee public.funcionarios%rowtype; actor public.profiles%rowtype;
  prior private.occurrence_commands%rowtype; canonical jsonb; receipt jsonb; event_id bigint; next_name text; next_kind text; next_date date; stamp timestamptz := clock_timestamp();
begin
  if auth.role() is distinct from 'authenticated' or not public.has_active_session() then raise exception using errcode='42501',message='Active session required.'; end if;
  select * into actor from public.profiles where id=auth.uid() and is_sindico for share;
  if actor.id is null or command_key is null or jsonb_typeof(payload) is distinct from 'object' then raise exception using errcode='22023',message='Invalid command.'; end if;
  if command_type not in ('responsible','delegate','deadline','complete') or command_type is null or expected_version is null or expected_version<0 or exists(select 1 from jsonb_each(payload) where jsonb_typeof(value) not in ('string','null')) or exists(select 1 from jsonb_object_keys(payload) k where k not in (select unnest(case command_type when 'responsible' then array['kind','name'] when 'delegate' then array['employeeId','message'] when 'deadline' then array['date'] else array['comment','uploadKey','uploadSecret'] end))) then raise exception using errcode='22023',message='Invalid command payload.'; end if;
  if command_type='complete' and ((payload->>'uploadKey' is null) <> (payload->>'uploadSecret' is null)) then raise exception using errcode='22023',message='Incomplete upload credentials.'; end if;
  if command_type='delegate' then
    select * into employee from public.funcionarios where id=(payload->>'employeeId')::uuid for update;
  end if;
  select o.* into target from public.occurrences o join public.condominiums c on c.id=o.condominium_id where o.id=target_occurrence and c.manager_id=actor.id for update of o;
  if not found then raise exception using errcode='42501',message='Occurrence unavailable.'; end if;
  canonical := jsonb_build_object('type',command_type,'payload',(payload-'uploadSecret') || case when payload ? 'uploadSecret' then jsonb_build_object('uploadSecretHash',encode(extensions.digest(payload->>'uploadSecret','sha256'),'hex')) else '{}'::jsonb end,'version',expected_version);
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
      event_id:=private.append_occurrence_event(target.id,'responsible_changed','Responsável definido: '||next_name||case when target.responsible_name is null then '.' else '. Anterior: '||target.responsible_name||'.' end,jsonb_build_object('previousResponsibleName',target.responsible_name,'priorityMaintained',target.priority_decided_at is null and target.suggested_priority is not null));
    end if;
  elsif command_type='delegate' then
    if employee.id is null or not employee.ativo or employee.condominio_id<>target.condominium_id or employee.sindico_id<>actor.id or nullif(btrim(payload->>'message'),'') is null or length(payload->>'message')>10000 then raise exception using errcode='22023',message='Employee unavailable.'; end if;
    update public.occurrences set status='delegated',responsible_kind='employee',responsible_profile_id=null,responsible_employee_id=employee.id,responsible_name=employee.nome,responsible_phone=employee.celular,responsible_role=(select nome from public.funcoes where id=employee.funcao_id),first_responsible_at=coalesce(first_responsible_at,stamp),delegation_started_at=stamp,due_date=null,due_at=null where id=target.id;
    event_id:=private.append_occurrence_event(target.id,'responsible_changed','Delegação salva para '||employee.nome||'. Envio pelo WhatsApp não confirmado.'||case when target.responsible_name is null then '' else ' Anterior: '||target.responsible_name||'.' end,jsonb_build_object('previousResponsibleName',target.responsible_name,'message',payload->>'message','intent','whatsapp_delegation','priorityMaintained',target.priority_decided_at is null and target.suggested_priority is not null));
    if target.due_date is not null then perform private.append_occurrence_event(target.id,'deadline_changed','Previsão removida ao delegar.',jsonb_build_object('previousDueDate',target.due_date,'dueDate',null)); end if;
  elsif command_type='deadline' then
    if target.status<>'in_progress' then raise exception using errcode='P0003',message='Deadline requires in progress.'; end if;
    if payload->>'date' is not null and (payload->>'date' !~ '^\d{4}-\d{2}-\d{2}$') then raise exception using errcode='22023',message='Invalid date.'; end if;
    next_date:=(payload->>'date')::date;
    if next_date is distinct from target.due_date then
      update public.occurrences set due_date=next_date,due_at=null where id=target.id;
      event_id:=private.append_occurrence_event(target.id,'deadline_changed',case when next_date is null then 'Previsão removida.' else 'Previsão definida: '||to_char(next_date,'DD/MM/YYYY')||'.' end,jsonb_build_object('previousDueDate',target.due_date,'dueDate',next_date,'priorityMaintained',target.priority_decided_at is null and target.suggested_priority is not null));
    else receipt:=public.occurrence_detail(target.id); end if;
  elsif command_type='complete' then
    if target.status not in ('in_progress','delegated') then raise exception using errcode='P0003',message='Completion requires responsibility.'; end if;
    if length(coalesce(payload->>'comment',''))>10000 then raise exception using errcode='22023',message='Invalid comment.'; end if;
    if target.priority_decided_at is null and target.suggested_priority is not null then
      update public.occurrences set final_priority=suggested_priority,decided_priority=suggested_priority,decided_suggested_priority=suggested_priority,priority_decided_at=stamp where id=target.id;
    end if;
    update public.occurrences set status='completed',completed_at=stamp where id=target.id;
    event_id:=private.append_occurrence_event(target.id,'completed','Ocorrência concluída.'||case when nullif(btrim(payload->>'comment'),'') is null then '' else ' '||btrim(payload->>'comment') end,jsonb_build_object('comment',nullif(btrim(payload->>'comment'),''),'priorityMaintained',target.priority_decided_at is null and target.suggested_priority is not null));
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

create or replace function private.append_occurrence_event(target_occurrence uuid, event_kind text, note text, event_data jsonb)
returns bigint language plpgsql security invoker set search_path='' as $$
declare actor public.profiles%rowtype; target public.occurrences%rowtype; event_id bigint;
begin
  select * into actor from public.profiles where id=auth.uid() and is_sindico;
  select * into target from public.occurrences where id=target_occurrence;
  if actor.id is null or not exists(select 1 from public.condominiums where id=target.condominium_id and manager_id=actor.id) then
    raise exception using errcode='42501', message='Occurrence unavailable.';
  end if;
  insert into public.occurrence_events(occurrence_id,event_type,author_type,author_profile_id,author_name,author_phone,author_role,internal_description,is_human_action,priority_snapshot,previous_responsible_name,responsible_name,responsible_phone,responsible_role,delegation_started_at,data)
  values(target.id,event_kind,'manager',actor.id,actor.full_name,actor.phone,'manager',note || case when event_data->>'priorityMaintained'='true' then ' Prioridade sugerida mantida.' else '' end,true,coalesce(target.final_priority,target.suggested_priority),event_data->>'previousResponsibleName',target.responsible_name,target.responsible_phone,target.responsible_role,target.delegation_started_at,event_data)
  returning id into event_id;
  return event_id;
end;
$$;
revoke all on function private.append_occurrence_event(uuid,text,text,jsonb) from public,anon,authenticated,service_role;

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
      select o.id, o.number, o.status, o.registered_at, o.completed_at, o.responsible_name, o.due_date,
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
          'reporterName', o.reporter_name, 'registeredAt', o.registered_at, 'completedAt', o.completed_at, 'responsibleName', o.responsible_name, 'dueDate', o.due_date
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

notify pgrst, 'reload schema';
commit;
