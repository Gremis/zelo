begin;

alter table private.occurrence_upload_sessions drop constraint occurrence_upload_sessions_purpose_check;
alter table private.occurrence_upload_sessions add constraint occurrence_upload_sessions_purpose_check check(purpose in ('registration','completion','task_completion','task_message'));

create or replace function private.append_occurrence_event(target_occurrence uuid, event_kind text, note text, event_data jsonb)
returns bigint language plpgsql security invoker set search_path='' as $$
declare actor public.profiles%rowtype; target public.occurrences%rowtype; event_id bigint; task private.employee_tasks%rowtype; snapshot public.occurrence_events%rowtype;
begin
  select * into target from public.occurrences where id=target_occurrence;
  if event_data ? 'employeeTaskCode' then
    if auth.role() is distinct from 'service_role' or event_kind not in ('employee_started','employee_message','completed') then raise exception using errcode='42501',message='Task unavailable.'; end if;
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


create or replace function public.employee_task_command(p_code text,command_key uuid,command_type text,payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare task private.employee_tasks%rowtype; prior private.employee_task_commands%rowtype; canonical jsonb; receipt jsonb; event_id bigint; stamp timestamptz; snapshot public.occurrence_events%rowtype; session private.occurrence_upload_sessions%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception using errcode='42501',message='Server required.'; end if;
 if command_key is null or command_type is null or command_type not in ('start','complete','message') or payload is null or jsonb_typeof(payload)<>'object' or exists(select 1 from jsonb_object_keys(payload) k where k not in ('comment','uploadKey','uploadSecret')) or exists(select 1 from jsonb_each(payload) where jsonb_typeof(value) not in ('string','null')) or (command_type='start' and payload<>'{}'::jsonb) or length(coalesce(payload->>'comment',''))>10000 or ((payload->>'uploadKey' is null)<>(payload->>'uploadSecret' is null)) then raise exception using errcode='22023',message='Invalid command.'; end if;
 task:=private.lock_employee_task(p_code);
 canonical:=jsonb_build_object('type',command_type,'payload',(payload-'uploadSecret')||case when payload ? 'uploadSecret' then jsonb_build_object('uploadSecretHash',encode(extensions.digest(payload->>'uploadSecret','sha256'),'hex')) else '{}'::jsonb end);
 select * into prior from private.employee_task_commands c where c.task_code=p_code and c.command_key=employee_task_command.command_key;
 if found then
 if prior.payload<>canonical then raise exception using errcode='P0003',message='Command conflict.'; end if;
 return prior.receipt;
 end if;
 if not private.task_can_act(task) then raise exception using errcode='P0003',message='Task is read only.'; end if;
 if command_type='message' and nullif(regexp_replace(coalesce(payload->>'comment',''),'[[:space:]]','','g'),'') is null and payload->>'uploadKey' is null then raise exception using errcode='22023',message='Message required.'; end if;
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
 if session.id is null or session.purpose<>(case when command_type='message' then 'task_message' else 'task_completion' end) or session.employee_task_code is distinct from task.code or session.target_occurrence_id is distinct from task.occurrence_id or session.secret_hash is distinct from extensions.digest(payload->>'uploadSecret','sha256') then raise exception using errcode='42501',message='Upload unavailable.'; end if;
 end if;
 if command_type='message' then
 event_id:=private.append_occurrence_event(task.occurrence_id,'employee_message','Recado de '||snapshot.responsible_name||case when nullif(btrim(payload->>'comment'),'') is null then ': Anexos enviados.' else ': '||btrim(payload->>'comment') end,jsonb_build_object('employeeTaskCode',task.code,'comment',nullif(btrim(payload->>'comment'),'')));
 else
 event_id:=private.complete_occurrence_state(task.occurrence_id,stamp,'Concluída por '||snapshot.responsible_name||' ('||snapshot.responsible_role||') pela página da tarefa'||case when nullif(btrim(payload->>'comment'),'') is null then '' else '. '||btrim(payload->>'comment') end,jsonb_build_object('employeeTaskCode',task.code,'comment',nullif(btrim(payload->>'comment'),'')));
 end if;
 if session.id is not null then perform private.link_verified_completion(session.id,task.occurrence_id,event_id); end if;
 end if;
 receipt:=public.employee_task(task.code);
 insert into private.employee_task_commands values(task.code,command_key,canonical,receipt);
 return receipt;
end;
$$;
revoke all on function public.employee_task_command(text,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.employee_task_command(text,uuid,text,jsonb) to service_role;

create or replace function public.employee_task_upload_operation(p_code text,operation text,session_key uuid,upload_secret text,payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare task private.employee_tasks%rowtype; session private.occurrence_upload_sessions%rowtype; slug text; result jsonb; upload_purpose text:=coalesce(payload->>'taskPurpose','task_completion');
begin
 if auth.role() is distinct from 'service_role' then raise exception using errcode='42501',message='Server required.'; end if;
 if upload_purpose not in ('task_completion','task_message') then raise exception using errcode='22023',message='Invalid purpose.'; end if;
 if payload ? 'taskPurpose' then payload:=payload->'input'; end if;
 task:=private.lock_employee_task(p_code);
 if not private.task_can_act(task) then raise exception using errcode='P0003',message='Task is read only.'; end if;
 if operation is null or operation not in ('prepare','status','cancel','authorize','claim','validated','failed','retry') then raise exception using errcode='22023',message='Invalid upload operation.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('manager-upload:'||session_key::text,0));
 select * into session from private.occurrence_upload_sessions where id=session_key for update;
 if found and (session.purpose<>upload_purpose or session.employee_task_code is distinct from task.code or session.target_occurrence_id is distinct from task.occurrence_id) then raise exception using errcode='P0002',message='Upload unavailable.'; end if;
 select c.slug into slug from public.condominiums c join public.occurrences o on o.condominium_id=c.id where o.id=task.occurrence_id;
 result:=private.occurrence_upload_operation(operation,session_key,slug,upload_secret,payload);
 if operation='prepare' and session.id is null then update private.occurrence_upload_sessions set purpose=upload_purpose,employee_task_code=task.code,target_occurrence_id=task.occurrence_id where id=session_key; end if;
 return result;
end;
$$;
revoke all on function public.employee_task_upload_operation(text,text,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.employee_task_upload_operation(text,text,uuid,text,jsonb) to service_role;

notify pgrst,'reload schema';
commit;
