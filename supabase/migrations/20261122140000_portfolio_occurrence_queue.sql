begin;

create function public.portfolio_occurrence_queue()
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
      select o.id, o.number, o.status, o.registered_at, o.completed_at,
        coalesce(o.final_priority, o.suggested_priority) as effective_priority,
        jsonb_build_object(
          'id', o.id, 'number', o.number, 'status', o.status,
          'condominium', jsonb_build_object('id', c.id, 'name', c.name),
          'reporterUnitOrRole', o.reporter_unit_or_role,
          'description', o.description, 'location', o.location,
          'suggestedPriority', o.suggested_priority, 'finalPriority', o.final_priority,
          'effectivePriority', coalesce(o.final_priority, o.suggested_priority),
          'suggestionReason', o.suggestion_reason, 'suggestionSource', o.suggestion_source,
          'suggestionPending', o.suggested_priority is not null and o.final_priority is null and o.priority_decided_at is null,
          'reporterName', o.reporter_name, 'registeredAt', o.registered_at, 'completedAt', o.completed_at
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
revoke all on function public.portfolio_occurrence_queue() from public, anon, authenticated, service_role;
grant execute on function public.portfolio_occurrence_queue() to authenticated;

notify pgrst, 'reload schema';

commit;
