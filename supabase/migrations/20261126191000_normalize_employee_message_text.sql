begin;

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
 payload:=jsonb_set(payload,'{comment}',to_jsonb(regexp_replace(coalesce(payload->>'comment',''),'^[[:space:]]+|[[:space:]]+$','','g')));
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

notify pgrst,'reload schema';
commit;
