begin;
create function public.occurrence_employee_state(target_occurrence uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'taskStarted',o.status='delegated' and exists(select 1 from private.employee_tasks t where t.occurrence_id=o.id and t.delegated_at=o.delegation_started_at and t.started_at is not null and t.completed_at is null and private.task_can_act(t)),
 'completedByEmployee',case when o.status='completed' then (select 'Concluída por '||e.author_name||' ('||e.author_role||')' from public.occurrence_events e where e.occurrence_id=o.id and e.event_type='completed' and e.author_type='employee' and e.id=(select max(x.id) from public.occurrence_events x where x.occurrence_id=o.id and x.event_type='completed')) end)
 from public.occurrences o join public.condominiums c on c.id=o.condominium_id
 where o.id=target_occurrence and c.manager_id=auth.uid() and public.has_active_session();
$$;
revoke all on function public.occurrence_employee_state(uuid) from public,anon,authenticated,service_role;
grant execute on function public.occurrence_employee_state(uuid) to authenticated;
CREATE OR REPLACE FUNCTION public.portfolio_occurrence_queue()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
        ) || public.occurrence_employee_state(o.id) as card
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
$function$;


notify pgrst,'reload schema';
commit;
