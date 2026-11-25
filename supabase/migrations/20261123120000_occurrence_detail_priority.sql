begin;

create function public.occurrence_detail(target_occurrence uuid)
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
revoke all on function public.occurrence_detail(uuid) from public, anon, authenticated, service_role;
grant execute on function public.occurrence_detail(uuid) to authenticated;

create function public.decide_occurrence_priority(
  target_occurrence uuid, decided_priority text, change_reason text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor public.profiles%rowtype;
  target public.occurrences%rowtype;
  reason text := nullif(btrim(change_reason), '');
  decision_time timestamptz := clock_timestamp();
  stored_priority text := decided_priority;
  stored_reason text;
begin
  if auth.role() is distinct from 'authenticated' or not public.has_active_session() then
    raise exception using errcode = '28000', message = 'Active confirmed session required.';
  end if;
  select p.* into actor from public.profiles p where p.id = auth.uid() and p.is_sindico for share;
  if not found then
    raise exception using errcode = '42501', message = 'Occurrence unavailable.';
  end if;
  select o.* into target from public.occurrences o
  join public.condominiums c on c.id = o.condominium_id
  where o.id = target_occurrence and c.manager_id = actor.id
  for update of o;
  if not found then
    raise exception using errcode = '42501', message = 'Occurrence unavailable.';
  end if;
  if target.status = 'completed' then
    raise exception using errcode = '55000', message = 'Completed occurrence priority is locked.';
  end if;
  if decided_priority is null or decided_priority not in ('low', 'normal', 'urgent') then
    raise exception using errcode = '22023', message = 'Invalid final priority.';
  end if;
  if reason is not null and reason not in ('greater_risk', 'lower_risk', 'already_handled', 'recurring', 'other') then
    raise exception using errcode = '22023', message = 'Invalid priority change reason.';
  end if;
  if target.priority_decided_at is null and target.suggested_priority is not distinct from decided_priority then
    return jsonb_build_object(
      'finalPriority', target.final_priority,
      'suggestionPending', true,
      'priorityChangeReason', target.priority_change_reason
    );
  end if;
  stored_reason := case when decided_priority is distinct from target.suggested_priority then reason end;
  update public.occurrences set
    final_priority = stored_priority,
    priority_decided_at = decision_time,
    decided_suggested_priority = coalesce(decided_suggested_priority, suggested_priority),
    decided_priority = stored_priority,
    priority_change_reason = stored_reason
  where id = target.id;
  return jsonb_build_object(
    'finalPriority', decided_priority,
    'suggestionPending', false,
    'priorityChangeReason', stored_reason
  );
end;
$$;
revoke all on function public.decide_occurrence_priority(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.decide_occurrence_priority(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
