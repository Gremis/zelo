begin;

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
    'trackingCode', o.tracking_code,
    'status', o.status,
    'condominium', jsonb_build_object('id', c.id, 'name', c.name),
    'description', o.description,
    'location', o.location,
    'reporterName', o.reporter_name,
    'reporterPhone', o.reporter_phone,
    'reporterUnitOrRole', o.reporter_unit_or_role,
    'registeredAt', o.registered_at,
    'completedAt', o.completed_at,
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
        'text', e.internal_description
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

notify pgrst, 'reload schema';

commit;
