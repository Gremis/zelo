begin;

create function public.occurrence_tracking(p_code text)
returns jsonb language sql stable security definer set search_path = '' as $$
  with target as (
    select o.id, o.number, o.status, o.registered_at, o.description,
      o.reporter_unit_or_role, o.location, c.name as condominium_name
    from public.occurrences o
    join public.condominiums c on c.id = o.condominium_id
    where p_code is not null
      and p_code ~ '^[0-9a-f]{64}$'
      and o.tracking_code = p_code
  ),
  allowed_events as (
    select e.id, e.occurrence_id, e.event_type, e.occurred_at, e.due_at,
      row_number() over (
        partition by e.occurrence_id, e.event_type
        order by e.occurred_at, e.id
      ) as position
    from public.occurrence_events e
    join target t on t.id = e.occurrence_id
    where e.event_type in (
      'registered', 'responsible_changed', 'deadline_changed', 'completed', 'reopened'
    )
  ),
  updates as (
    select a.id, a.occurred_at,
      case
        when a.event_type = 'registered' then 'Ocorrência registrada. O síndico já recebeu.'
        when a.event_type = 'responsible_changed' then 'O síndico está cuidando da ocorrência.'
        when a.event_type = 'deadline_changed' and a.due_at is not null
          then 'Atendimento previsto para ' || to_char(a.due_at at time zone 'America/Sao_Paulo', 'DD/MM') || '.'
        when a.event_type = 'deadline_changed' then 'A previsão de atendimento foi retirada.'
        when a.event_type = 'completed' then 'Ocorrência concluída.'
        else 'A ocorrência foi reaberta.'
      end as text
    from allowed_events a
    where a.event_type <> 'responsible_changed' or a.position = 1
  )
  select jsonb_build_object(
    'condominiumName', t.condominium_name,
    'number', t.number,
    'registeredAt', t.registered_at,
    'description', t.description,
    'unit', t.reporter_unit_or_role,
    'location', t.location,
    'situation', jsonb_build_object(
      'step', case t.status
        when 'new' then 'received'
        when 'completed' then 'completed'
        else 'in_progress'
      end,
      'label', case t.status
        when 'new' then 'Recebida pelo síndico'
        when 'completed' then 'Concluída'
        else 'Em andamento'
      end
    ),
    'updates', coalesce((
      select jsonb_agg(
        jsonb_build_object('occurredAt', u.occurred_at, 'text', u.text)
        order by u.occurred_at desc, u.id desc
      )
      from updates u
    ), '[]'::jsonb)
  )
  from target t;
$$;
revoke all on function public.occurrence_tracking(text) from public, anon, authenticated, service_role;
grant execute on function public.occurrence_tracking(text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
