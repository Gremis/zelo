begin;

alter table public.occurrence_events drop constraint occurrence_events_event_type_check;
alter table public.occurrence_events add constraint occurrence_events_event_type_check check(event_type in ('registered','responsible_changed','deadline_changed','manager_update','employee_message','employee_started','completed','reopened'));
alter table private.occurrence_upload_sessions drop constraint occurrence_upload_sessions_purpose_check;
alter table private.occurrence_upload_sessions add constraint occurrence_upload_sessions_purpose_check check(purpose in ('registration','completion','task_completion'));
alter table private.occurrence_upload_sessions add column employee_task_code text references private.employee_tasks(code);

create function private.task_can_act(task private.employee_tasks)
returns boolean language sql stable security definer set search_path='' as $$
 select task.completed_at is null and exists(
 select 1 from public.occurrences o join public.funcionarios f on f.id=task.employee_id
 where o.id=task.occurrence_id and o.status='delegated' and o.responsible_kind='employee'
 and o.responsible_employee_id=task.employee_id and o.delegation_started_at=task.delegated_at
 and f.ativo and f.condominio_id=o.condominium_id
 and task.delegation_event_id=(select max(t.delegation_event_id) from private.employee_tasks t where t.occurrence_id=o.id));
$$;
revoke all on function private.task_can_act(private.employee_tasks) from public,anon,authenticated,service_role;

create function private.lock_employee_task(p_code text)
returns private.employee_tasks language plpgsql security definer set search_path='' as $$
declare task private.employee_tasks%rowtype;
begin
 select * into task from private.employee_tasks where code=p_code and p_code ~ '^[0-9a-f]{64}$';
 if not found then raise exception using errcode='P0002',message='Task unavailable.'; end if;
 perform 1 from public.funcionarios where id=task.employee_id for share;
 perform 1 from public.occurrences where id=task.occurrence_id for update;
 select * into task from private.employee_tasks where code=p_code for update;
 return task;
end;
$$;
revoke all on function private.lock_employee_task(text) from public,anon,authenticated,service_role;

create or replace function public.employee_task(p_code text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'canAct', private.task_can_act(t),
    'condominiumName', c.name,
    'number', o.number,
    'description', o.description,
    'location', o.location,
    'reporterName', o.reporter_name,
    'reporterUnitOrRole', o.reporter_unit_or_role,
    'registeredAt', o.registered_at,
    'startedAt', t.started_at,
    'completedAt', t.completed_at,
    'status', case when t.completed_at is not null then 'completed' when t.started_at is not null then 'started' else 'pending' end
  )
  from private.employee_tasks t
  join public.occurrences o on o.id=t.occurrence_id
  join public.condominiums c on c.id=o.condominium_id
  where p_code ~ '^[0-9a-f]{64}$' and t.code=p_code;
$$;
revoke all on function public.employee_task(text) from public, anon, authenticated, service_role;
grant execute on function public.employee_task(text) to anon, authenticated;

create or replace function private.append_occurrence_event(target_occurrence uuid, event_kind text, note text, event_data jsonb)
returns bigint language plpgsql security invoker set search_path='' as $$
declare actor public.profiles%rowtype; target public.occurrences%rowtype; event_id bigint; task private.employee_tasks%rowtype; snapshot public.occurrence_events%rowtype;
begin
  select * into target from public.occurrences where id=target_occurrence;
  if event_data ? 'employeeTaskCode' then
    if auth.role() is distinct from 'service_role' or event_kind not in ('employee_started','completed') then raise exception using errcode='42501',message='Task unavailable.'; end if;
    select * into task from private.employee_tasks where code=event_data->>'employeeTaskCode' and occurrence_id=target.id;
    if not found then raise exception using errcode='42501',message='Task unavailable.'; end if;
    select * into snapshot from public.occurrence_events where id=task.delegation_event_id;
    event_data:=(event_data-'employeeTaskCode')||jsonb_build_object('employeeId',task.employee_id);
  else
    select * into actor from public.profiles where id=auth.uid() and is_sindico;
    if actor.id is null or not exists(select 1 from public.condominiums where id=target.condominium_id and manager_id=actor.id) then raise exception using errcode='42501',message='Occurrence unavailable.'; end if;
  end if;
  insert into public.occurrence_events(occurrence_id,event_type,author_type,author_profile_id,author_name,author_phone,author_role,internal_description,is_human_action,priority_snapshot,previous_responsible_name,responsible_name,responsible_phone,responsible_role,delegation_started_at,data,visible_to_resident,public_text)
  values(target.id,event_kind,case when task.code is null then 'manager' else 'employee' end,actor.id,case when task.code is null then actor.full_name else snapshot.responsible_name end,case when task.code is null then actor.phone else snapshot.responsible_phone end,case when task.code is null then 'manager' else snapshot.responsible_role end,note || case when event_data->>'priorityMaintained'='true' then ' Prioridade sugerida mantida.' else '' end,true,coalesce(target.final_priority,target.suggested_priority),event_data->>'previousResponsibleName',target.responsible_name,target.responsible_phone,target.responsible_role,target.delegation_started_at,event_data,event_kind in ('reopened','completed'),case when event_kind='reopened' then 'A ocorrência foi reaberta.' when event_kind='completed' then 'Ocorrência concluída.' end)
  returning id into event_id;
  return event_id;
end;
$$;
revoke all on function private.append_occurrence_event(uuid,text,text,jsonb) from public,anon,authenticated,service_role;


create function private.complete_occurrence_state(target_occurrence uuid, stamp timestamptz, note text, event_data jsonb)
returns bigint language plpgsql security invoker set search_path='' as $$
declare target public.occurrences%rowtype;
begin
 select * into target from public.occurrences where id=target_occurrence for update;
 if target.status not in ('in_progress','delegated') then raise exception using errcode='P0003',message='Completion requires responsibility.'; end if;
 if target.priority_decided_at is null and target.suggested_priority is not null then
 update public.occurrences set final_priority=suggested_priority,decided_priority=suggested_priority,decided_suggested_priority=suggested_priority,priority_decided_at=stamp where id=target.id;
 end if;
 update public.occurrences set status='completed',completed_at=stamp where id=target.id;
 return private.append_occurrence_event(target.id,'completed',note,event_data||jsonb_build_object('priorityMaintained',target.priority_decided_at is null and target.suggested_priority is not null));
end;
$$;
revoke all on function private.complete_occurrence_state(uuid,timestamptz,text,jsonb) from public,anon,authenticated,service_role;

create function private.link_verified_completion(session_id uuid,target_occurrence uuid,completion_event bigint)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from private.occurrence_upload_sessions where id=session_id and (state<>'open' or expires_at<=clock_timestamp())) or not exists(select 1 from private.occurrence_upload_files where occurrence_upload_files.session_id=link_verified_completion.session_id) or exists(select 1 from private.occurrence_upload_files where occurrence_upload_files.session_id=link_verified_completion.session_id and state<>'valid') then raise exception using errcode='P0003',message='All files must be verified.'; end if;
 insert into public.occurrence_attachments(occurrence_id,event_id,storage_bucket,storage_path,file_name,content_type,size_bytes)
 select target_occurrence,completion_event,'occurrence-evidence',evidence_path,file_name,content_type,size_bytes from private.occurrence_upload_files where occurrence_upload_files.session_id=link_verified_completion.session_id;
 update private.occurrence_upload_sessions set state='linked',occurrence_id=target_occurrence,last_activity_at=clock_timestamp() where id=session_id;
end;
$$;
revoke all on function private.link_verified_completion(uuid,uuid,bigint) from public,anon,authenticated,service_role;
create or replace function private.link_completion_upload(target_occurrence uuid, completion_event bigint, payload jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare s private.occurrence_upload_sessions%rowtype;
begin
 if payload->>'uploadKey' is null and payload->>'uploadSecret' is null then return; end if;
 select * into s from private.occurrence_upload_sessions where id=(payload->>'uploadKey')::uuid for update;
 if s.id is null or s.purpose<>'completion' or s.target_occurrence_id<>target_occurrence or s.manager_id<>auth.uid() or s.secret_hash is distinct from extensions.digest(payload->>'uploadSecret','sha256') then raise exception using errcode='42501',message='Upload unavailable.'; end if;
 perform private.link_verified_completion(s.id,target_occurrence,completion_event);
end;
$$;
revoke all on function private.link_completion_upload(uuid,bigint,jsonb) from public,anon,authenticated,service_role;
create or replace function private.run_occurrence_command(target_occurrence uuid, command_key uuid, expected_version bigint, command_type text, payload jsonb, public_origin text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.occurrences%rowtype; employee public.funcionarios%rowtype; actor public.profiles%rowtype;
  prior private.occurrence_commands%rowtype; canonical jsonb; receipt jsonb; event_id bigint; next_name text; next_kind text; next_date date; stamp timestamptz := clock_timestamp(); task_code text; delegation_message text;
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
  select * into prior from private.occurrence_commands where occurrence_id=target.id and occurrence_commands.command_key=run_occurrence_command.command_key;
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
    if public_origin is null or public_origin !~ '^https?://[^/?#[:space:]]+$' then raise exception using errcode='P0004',message='Task origin unavailable.'; end if;
    if employee.id is null or not employee.ativo or employee.condominio_id<>target.condominium_id or employee.sindico_id<>actor.id or nullif(btrim(payload->>'message'),'') is null or length(payload->>'message')>10000 then raise exception using errcode='22023',message='Employee unavailable.'; end if;
    update public.occurrences set status='delegated',responsible_kind='employee',responsible_profile_id=null,responsible_employee_id=employee.id,responsible_name=employee.nome,responsible_phone=employee.celular,responsible_role=(select nome from public.funcoes where id=employee.funcao_id),first_responsible_at=coalesce(first_responsible_at,stamp),delegation_started_at=stamp,due_date=null,due_at=null where id=target.id;
    event_id:=private.append_occurrence_event(target.id,'responsible_changed','Delegação salva para '||employee.nome||'. Envio pelo WhatsApp não confirmado.'||case when target.responsible_name is null then '' else ' Anterior: '||target.responsible_name||'.' end,jsonb_build_object('previousResponsibleName',target.responsible_name,'message',payload->>'message','intent','whatsapp_delegation','priorityMaintained',target.priority_decided_at is null and target.suggested_priority is not null));
    insert into private.employee_tasks(occurrence_id,delegation_event_id,employee_id,delegated_at)
    values(target.id,event_id,employee.id,stamp) returning code into task_code;
    while exists(select 1 from public.occurrences where tracking_code=task_code) loop
      update private.employee_tasks set code=encode(extensions.gen_random_bytes(32),'hex') where code=task_code returning code into task_code;
    end loop;
    delegation_message:=btrim(payload->>'message')||E'\nAbra o link para mandar recado ou concluir com foto: '||public_origin||'/t/'||task_code;
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
    event_id:=private.complete_occurrence_state(target.id,stamp,'Ocorrência concluída.'||case when nullif(btrim(payload->>'comment'),'') is null then '' else ' '||btrim(payload->>'comment') end,jsonb_build_object('comment',nullif(btrim(payload->>'comment'),'')));
    perform private.link_completion_upload(target.id,event_id,payload);
  else raise exception using errcode='22023',message='Unsupported command.';
  end if;
  if receipt is null then
    if command_type<>'complete' and target.priority_decided_at is null and target.suggested_priority is not null then
      update public.occurrences set final_priority=suggested_priority,decided_priority=suggested_priority,decided_suggested_priority=suggested_priority,priority_decided_at=stamp where id=target.id;
    end if;
    receipt:=public.occurrence_detail(target.id);
  end if;
  if command_type='delegate' then receipt:=receipt||jsonb_build_object('delegation',jsonb_build_object('code',task_code,'url',public_origin||'/t/'||task_code,'message',delegation_message)); end if;
  insert into private.occurrence_commands values(target.id,command_key,actor.id,canonical,receipt);
  return receipt;
end;
$$;
revoke all on function private.run_occurrence_command(uuid,uuid,bigint,text,jsonb,text) from public,anon,authenticated,service_role;


create table private.employee_task_commands(
 task_code text not null references private.employee_tasks(code),
 command_key uuid not null,
 payload jsonb not null,
 receipt jsonb not null,
 primary key(task_code,command_key)
);
alter table private.employee_task_commands enable row level security;
revoke all on private.employee_task_commands from public,anon,authenticated,service_role;

create function public.employee_task_command(p_code text,command_key uuid,command_type text,payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare task private.employee_tasks%rowtype; prior private.employee_task_commands%rowtype; canonical jsonb; receipt jsonb; event_id bigint; stamp timestamptz; snapshot public.occurrence_events%rowtype; session private.occurrence_upload_sessions%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception using errcode='42501',message='Server required.'; end if;
 if command_key is null or command_type is null or command_type not in ('start','complete') or payload is null or jsonb_typeof(payload)<>'object' or exists(select 1 from jsonb_object_keys(payload) k where k not in ('comment','uploadKey','uploadSecret')) or exists(select 1 from jsonb_each(payload) where jsonb_typeof(value) not in ('string','null')) or (command_type='start' and payload<>'{}'::jsonb) or length(coalesce(payload->>'comment',''))>10000 or ((payload->>'uploadKey' is null)<>(payload->>'uploadSecret' is null)) then raise exception using errcode='22023',message='Invalid command.'; end if;
 task:=private.lock_employee_task(p_code);
 canonical:=jsonb_build_object('type',command_type,'payload',(payload-'uploadSecret')||case when payload ? 'uploadSecret' then jsonb_build_object('uploadSecretHash',encode(extensions.digest(payload->>'uploadSecret','sha256'),'hex')) else '{}'::jsonb end);
 select * into prior from private.employee_task_commands c where c.task_code=p_code and c.command_key=employee_task_command.command_key;
 if found then
 if prior.payload<>canonical then raise exception using errcode='P0003',message='Command conflict.'; end if;
 return prior.receipt;
 end if;
 if not private.task_can_act(task) then raise exception using errcode='P0003',message='Task is read only.'; end if;
 stamp:=clock_timestamp();
 select * into snapshot from public.occurrence_events where id=task.delegation_event_id;
 if command_type='start' then
 if task.started_at is null then
 update private.employee_tasks set started_at=stamp where code=task.code;
 perform private.append_occurrence_event(task.occurrence_id,'employee_started',snapshot.responsible_name||' começou a tarefa',jsonb_build_object('employeeTaskCode',task.code));
 end if;
 else
 if payload->>'uploadKey' is not null then
 select * into session from private.occurrence_upload_sessions where id=(payload->>'uploadKey')::uuid for update;
 if session.id is null or session.purpose<>'task_completion' or session.employee_task_code is distinct from task.code or session.target_occurrence_id is distinct from task.occurrence_id or session.secret_hash is distinct from extensions.digest(payload->>'uploadSecret','sha256') then raise exception using errcode='42501',message='Upload unavailable.'; end if;
 end if;
 event_id:=private.complete_occurrence_state(task.occurrence_id,stamp,'Concluída por '||snapshot.responsible_name||' ('||snapshot.responsible_role||') pela página da tarefa'||case when nullif(btrim(payload->>'comment'),'') is null then '' else '. '||btrim(payload->>'comment') end,jsonb_build_object('employeeTaskCode',task.code,'comment',nullif(btrim(payload->>'comment'),'')));
 if session.id is not null then perform private.link_verified_completion(session.id,task.occurrence_id,event_id); end if;
 end if;
 receipt:=public.employee_task(task.code);
 insert into private.employee_task_commands values(task.code,command_key,canonical,receipt);
 return receipt;
end;
$$;
revoke all on function public.employee_task_command(text,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.employee_task_command(text,uuid,text,jsonb) to service_role;

create function public.employee_task_upload_operation(p_code text,operation text,session_key uuid,upload_secret text,payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare task private.employee_tasks%rowtype; session private.occurrence_upload_sessions%rowtype; slug text; result jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception using errcode='42501',message='Server required.'; end if;
 task:=private.lock_employee_task(p_code);
 if not private.task_can_act(task) then raise exception using errcode='P0003',message='Task is read only.'; end if;
 if operation is null or operation not in ('prepare','status','cancel','authorize','claim','validated','failed','retry') then raise exception using errcode='22023',message='Invalid upload operation.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('manager-upload:'||session_key::text,0));
 select * into session from private.occurrence_upload_sessions where id=session_key for update;
 if found and (session.purpose<>'task_completion' or session.employee_task_code is distinct from task.code or session.target_occurrence_id is distinct from task.occurrence_id) then raise exception using errcode='P0002',message='Upload unavailable.'; end if;
 select c.slug into slug from public.condominiums c join public.occurrences o on o.condominium_id=c.id where o.id=task.occurrence_id;
 result:=private.occurrence_upload_operation(operation,session_key,slug,upload_secret,payload);
 if operation='prepare' and session.id is null then update private.occurrence_upload_sessions set purpose='task_completion',employee_task_code=task.code,target_occurrence_id=task.occurrence_id where id=session_key; end if;
 return result;
end;
$$;
revoke all on function public.employee_task_upload_operation(text,text,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.employee_task_upload_operation(text,text,uuid,text,jsonb) to service_role;

notify pgrst,'reload schema';
commit;
