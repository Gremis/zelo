begin;

alter table public.occurrence_events drop constraint occurrence_events_event_type_check;
alter table public.occurrence_events add constraint occurrence_events_event_type_check
  check (event_type in ('registered','responsible_changed','deadline_changed','manager_update','employee_message','completed','reopened'));

create table public.occurrence_completions (
  id bigint generated always as identity primary key,
  occurrence_id uuid not null references public.occurrences(id) on delete restrict,
  event_id bigint,
  completed_at timestamptz not null,
  foreign key (occurrence_id,event_id) references public.occurrence_events(occurrence_id,id) on delete restrict,
  unique (occurrence_id,event_id),
  unique (occurrence_id,completed_at)
);
alter table public.occurrence_completions enable row level security;
revoke all on public.occurrence_completions from public,anon,authenticated,service_role;
grant select on public.occurrence_completions to authenticated;
create policy occurrence_completions_read_portfolio on public.occurrence_completions for select to authenticated
  using (exists(select 1 from public.occurrences o where o.id=occurrence_id));
create trigger occurrence_completions_preserve before update or delete on public.occurrence_completions
  for each row execute function public.protect_occurrence_evidence();
create trigger occurrence_completions_preserve_truncate before truncate on public.occurrence_completions
  for each statement execute function public.protect_occurrence_evidence();

insert into public.occurrence_completions(occurrence_id,event_id,completed_at)
select e.occurrence_id,e.id,case when o.status='completed' and e.id=(select e2.id from public.occurrence_events e2 where e2.occurrence_id=o.id and e2.event_type='completed' order by e2.occurred_at desc,e2.id desc limit 1) then o.completed_at else e.occurred_at end
from public.occurrence_events e join public.occurrences o on o.id=e.occurrence_id where e.event_type='completed'
on conflict do nothing;
insert into public.occurrence_completions(occurrence_id,completed_at)
select o.id,o.completed_at from public.occurrences o where o.status='completed'
  and not exists(select 1 from public.occurrence_completions c where c.occurrence_id=o.id and c.completed_at=o.completed_at);

create function private.capture_occurrence_completion()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.event_type='completed' then
   insert into public.occurrence_completions(occurrence_id,event_id,completed_at)
   select new.occurrence_id,new.id,coalesce(o.completed_at,new.occurred_at) from public.occurrences o where o.id=new.occurrence_id;
 end if;
 return new;
end;
$$;
revoke all on function private.capture_occurrence_completion() from public,anon,authenticated,service_role;
create trigger occurrence_capture_completion after insert on public.occurrence_events
 for each row execute function private.capture_occurrence_completion();

create or replace function public.protect_completed_occurrence()
returns trigger language plpgsql security definer set search_path='' as $$
declare mutable_fields text[]:=array['status','completed_at','responsible_kind','responsible_profile_id','responsible_employee_id','responsible_name','responsible_phone','responsible_role','due_at','due_date','delegation_started_at','version'];
begin
 if old.status='completed' then
  if new.status<>'new' or new.completed_at is not null or new.responsible_kind is not null or new.responsible_profile_id is not null or new.responsible_employee_id is not null or new.responsible_name is not null or new.responsible_phone is not null or new.responsible_role is not null or new.due_at is not null or new.due_date is not null or new.delegation_started_at is not null
    or (to_jsonb(new)-mutable_fields) is distinct from (to_jsonb(old)-mutable_fields)
    or not exists(select 1 from private.occurrence_commands c where c.occurrence_id=old.id and c.actor_id=auth.uid() and c.payload->>'type'='reopen' and c.payload->>'version'=old.version::text and c.receipt='{}'::jsonb)
  then raise exception using errcode='P0003',message='Completed occurrence is locked.'; end if;
 end if;
 new.version:=old.version+1;
 if old.first_responsible_at is not null then new.first_responsible_at:=old.first_responsible_at; end if;
 return new;
end;
$$;
revoke all on function public.protect_completed_occurrence() from public,anon,authenticated,service_role;
create or replace function private.append_occurrence_event(target_occurrence uuid, event_kind text, note text, event_data jsonb)
returns bigint language plpgsql security invoker set search_path='' as $$
declare actor public.profiles%rowtype; target public.occurrences%rowtype; event_id bigint;
begin
  select * into actor from public.profiles where id=auth.uid() and is_sindico;
  select * into target from public.occurrences where id=target_occurrence;
  if actor.id is null or not exists(select 1 from public.condominiums where id=target.condominium_id and manager_id=actor.id) then
    raise exception using errcode='42501', message='Occurrence unavailable.';
  end if;
  insert into public.occurrence_events(occurrence_id,event_type,author_type,author_profile_id,author_name,author_phone,author_role,internal_description,is_human_action,priority_snapshot,previous_responsible_name,responsible_name,responsible_phone,responsible_role,delegation_started_at,data,visible_to_resident,public_text)
  values(target.id,event_kind,'manager',actor.id,actor.full_name,actor.phone,'manager',note || case when event_data->>'priorityMaintained'='true' then ' Prioridade sugerida mantida.' else '' end,true,coalesce(target.final_priority,target.suggested_priority),event_data->>'previousResponsibleName',target.responsible_name,target.responsible_phone,target.responsible_role,target.delegation_started_at,event_data,event_kind='reopened',case when event_kind='reopened' then 'A ocorrência foi reaberta.' end)
  returning id into event_id;
  return event_id;
end;
$$;
revoke all on function private.append_occurrence_event(uuid,text,text,jsonb) from public,anon,authenticated,service_role;


create function public.reopen_occurrence(target_occurrence uuid,command_key uuid,expected_version bigint,reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.occurrences%rowtype; actor uuid; prior private.occurrence_commands%rowtype; canonical jsonb; receipt jsonb; normalized_reason text;
begin
 if auth.role() is distinct from 'authenticated' or not public.has_active_session() then raise exception using errcode='42501',message='Active session required.'; end if;
 select p.id into actor from public.profiles p where p.id=auth.uid() and p.is_sindico for share;
 if actor is null then raise exception using errcode='42501',message='Manager required.'; end if;
 if command_key is null or expected_version is null or expected_version<0 or length(coalesce(reason,''))>10000 then raise exception using errcode='22023',message='Invalid reopening command.'; end if;
 normalized_reason:=nullif(regexp_replace(reason,'^[[:space:]]+|[[:space:]]+$','','g'),'');
 select o.* into target from public.occurrences o join public.condominiums c on c.id=o.condominium_id where o.id=target_occurrence and c.manager_id=actor for update of o;
 if not found then raise exception using errcode='42501',message='Occurrence unavailable.'; end if;
 canonical:=jsonb_build_object('type','reopen','payload',jsonb_build_object('reason',normalized_reason),'version',expected_version);
 select * into prior from private.occurrence_commands c where c.occurrence_id=target.id and c.command_key=reopen_occurrence.command_key;
 if found then
  if prior.actor_id<>actor or prior.payload<>canonical then raise exception using errcode='P0003',message='Command key conflict.'; end if;
  return prior.receipt;
 end if;
 if target.status<>'completed' or target.version<>expected_version then raise exception using errcode='P0003',message='Occurrence changed.'; end if;
 insert into public.occurrence_completions(occurrence_id,completed_at) values(target.id,target.completed_at) on conflict(occurrence_id,completed_at) do nothing;
 insert into private.occurrence_commands values(target.id,command_key,actor,canonical,'{}'::jsonb);
 update public.occurrences set status='new',completed_at=null,responsible_kind=null,responsible_profile_id=null,responsible_employee_id=null,responsible_name=null,responsible_phone=null,responsible_role=null,due_at=null,due_date=null,delegation_started_at=null where id=target.id;
 perform private.append_occurrence_event(target.id,'reopened','Reabriu a ocorrência'||case when normalized_reason is null then '' else '. '||normalized_reason end,jsonb_build_object('reason',normalized_reason,'previousCompletedAt',target.completed_at,'previousResponsibleName',target.responsible_name,'previousDueDate',target.due_date,'previousDelegationStartedAt',target.delegation_started_at));
 receipt:=public.occurrence_detail(target.id);
 update private.occurrence_commands c set receipt=reopen_occurrence.receipt where c.occurrence_id=target.id and c.command_key=reopen_occurrence.command_key;
 return receipt;
end;
$$;
revoke all on function public.reopen_occurrence(uuid,uuid,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.reopen_occurrence(uuid,uuid,bigint,text) to authenticated;
notify pgrst,'reload schema';
commit;
