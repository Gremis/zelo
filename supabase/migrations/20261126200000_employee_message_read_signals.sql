begin;

create table private.occurrence_employee_message_reads (
  occurrence_id uuid not null references public.occurrences(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  through_event_id bigint not null references public.occurrence_events(id) on delete cascade,
  primary key (occurrence_id, viewer_id)
);
alter table private.occurrence_employee_message_reads enable row level security;
revoke all on private.occurrence_employee_message_reads from public, anon, authenticated, service_role;

create index occurrence_employee_messages_order on public.occurrence_events(occurrence_id,id)
where event_type='employee_message' and author_type='employee';

create function public.read_occurrence_employee_messages(target_occurrence uuid, through_event bigint)
returns bigint language plpgsql security definer set search_path='' as $$
declare stored bigint;
begin
  if auth.role() is distinct from 'authenticated' or not public.has_active_session() then
    raise exception using errcode='28000',message='Active session required.';
  end if;
  perform 1 from public.occurrences o
  join public.condominiums c on c.id=o.condominium_id
  join public.profiles p on p.id=c.manager_id
  where o.id=target_occurrence and c.manager_id=auth.uid() and p.is_sindico
  for update of o;
  if not found then raise exception using errcode='42501',message='Occurrence unavailable.'; end if;
  if through_event is null or not exists(
    select 1 from public.occurrence_events e where e.id=through_event
    and e.occurrence_id=target_occurrence and e.event_type='employee_message' and e.author_type='employee'
  ) then raise exception using errcode='22023',message='Message unavailable.'; end if;
  insert into private.occurrence_employee_message_reads(occurrence_id,viewer_id,through_event_id)
  values(target_occurrence,auth.uid(),through_event)
  on conflict(occurrence_id,viewer_id) do update
  set through_event_id=greatest(occurrence_employee_message_reads.through_event_id,excluded.through_event_id)
  returning through_event_id into stored;
  return stored;
end;
$$;
revoke all on function public.read_occurrence_employee_messages(uuid,bigint) from public,anon,authenticated,service_role;
grant execute on function public.read_occurrence_employee_messages(uuid,bigint) to authenticated;

create or replace function public.occurrence_employee_state(target_occurrence uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'taskStarted',o.status='delegated' and exists(select 1 from private.employee_tasks t where t.occurrence_id=o.id and t.delegated_at=o.delegation_started_at and t.started_at is not null and t.completed_at is null and private.task_can_act(t)),
 'hasNewEmployeeMessage',exists(select 1 from public.occurrence_events e where e.occurrence_id=o.id and e.event_type='employee_message' and e.author_type='employee' and e.id>coalesce((select r.through_event_id from private.occurrence_employee_message_reads r where r.occurrence_id=o.id and r.viewer_id=auth.uid()),0)),
 'completedByEmployee',case when o.status='completed' then (select 'Concluída por '||e.author_name||' ('||e.author_role||')' from public.occurrence_events e where e.occurrence_id=o.id and e.event_type='completed' and e.author_type='employee' and e.id=(select max(x.id) from public.occurrence_events x where x.occurrence_id=o.id and x.event_type='completed')) end)
 from public.occurrences o join public.condominiums c on c.id=o.condominium_id
 where o.id=target_occurrence and c.manager_id=auth.uid() and public.has_active_session();
$$;
revoke all on function public.occurrence_employee_state(uuid) from public,anon,authenticated,service_role;
grant execute on function public.occurrence_employee_state(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
