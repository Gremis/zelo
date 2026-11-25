begin;

create table private.employee_tasks (
  code text primary key default encode(extensions.gen_random_bytes(32), 'hex') check (code ~ '^[0-9a-f]{64}$'),
  occurrence_id uuid not null references public.occurrences(id) on delete restrict,
  delegation_event_id bigint not null unique,
  employee_id uuid not null references public.funcionarios(id) on delete restrict,
  delegated_at timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  foreign key (occurrence_id, delegation_event_id) references public.occurrence_events(occurrence_id, id) on delete restrict,
  check (started_at is null or started_at >= delegated_at),
  check (completed_at is null or completed_at >= delegated_at)
);
alter table private.employee_tasks enable row level security;
revoke all on private.employee_tasks from public, anon, authenticated, service_role;
create index employee_tasks_occurrence on private.employee_tasks(occurrence_id) where completed_at is null;

create function private.complete_employee_tasks()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='completed' and old.status is distinct from 'completed' then
    update private.employee_tasks set completed_at=new.completed_at where occurrence_id=new.id and completed_at is null;
  end if;
  return new;
end;
$$;
revoke all on function private.complete_employee_tasks() from public, anon, authenticated, service_role;
create trigger employee_tasks_completion after update of status on public.occurrences
  for each row execute function private.complete_employee_tasks();

create function public.employee_task(p_code text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
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

create or replace function public.occurrence_command(target_occurrence uuid, command_key uuid, expected_version bigint, command_type text, payload jsonb)
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
    insert into private.employee_tasks(occurrence_id,delegation_event_id,employee_id,delegated_at)
    values(target.id,event_id,employee.id,stamp) returning code into task_code;
    while exists(select 1 from public.occurrences where tracking_code=task_code) loop
      update private.employee_tasks set code=encode(extensions.gen_random_bytes(32),'hex') where code=task_code returning code into task_code;
    end loop;
    delegation_message:=btrim(payload->>'message')||E'\nAbra o link para mandar recado ou concluir com foto: sindicondo.app/t/'||task_code;
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
  if command_type='delegate' then receipt:=receipt||jsonb_build_object('delegation',jsonb_build_object('code',task_code,'message',delegation_message)); end if;
  insert into private.occurrence_commands values(target.id,command_key,actor.id,canonical,receipt);
  return receipt;
end;
$$;
revoke all on function public.occurrence_command(uuid,uuid,bigint,text,jsonb) from public,anon,service_role;
grant execute on function public.occurrence_command(uuid,uuid,bigint,text,jsonb) to authenticated;


notify pgrst, 'reload schema';
commit;
