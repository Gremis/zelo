begin;

alter table public.occurrence_events drop constraint occurrence_events_author_profile_id_fkey;
alter table public.occurrence_events add constraint occurrence_events_author_profile_id_fkey
  foreign key (author_profile_id) references public.profiles(id) on delete restrict on update restrict;

grant select on public.occurrences, public.occurrence_events, public.occurrence_attachments to authenticated;

create policy occurrences_read_portfolio on public.occurrences for select to authenticated
using (
  (select public.has_active_session()) and exists (
    select 1 from public.condominiums c where c.id = condominium_id
  )
);
create policy occurrence_events_read_portfolio on public.occurrence_events for select to authenticated
using (exists (select 1 from public.occurrences o where o.id = occurrence_id));
create policy occurrence_attachments_read_portfolio on public.occurrence_attachments for select to authenticated
using (exists (select 1 from public.occurrences o where o.id = occurrence_id));

create function public.protect_occurrence_evidence()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user not in ('postgres', 'supabase_admin') then
    raise exception using errcode = '42501', message = 'Occurrence evidence is append-only.';
  end if;
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;
revoke all on function public.protect_occurrence_evidence() from public, anon, authenticated, service_role;

create trigger occurrence_events_preserve before update or delete on public.occurrence_events
for each row execute function public.protect_occurrence_evidence();
create trigger occurrence_events_preserve_truncate before truncate on public.occurrence_events
for each statement execute function public.protect_occurrence_evidence();
create trigger occurrence_attachments_preserve before update or delete on public.occurrence_attachments
for each row execute function public.protect_occurrence_evidence();
create trigger occurrence_attachments_preserve_truncate before truncate on public.occurrence_attachments
for each statement execute function public.protect_occurrence_evidence();

create function public.append_occurrence_note(target_occurrence uuid, note text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  actor public.profiles%rowtype;
  target public.occurrences%rowtype;
  event_id bigint;
begin
  if auth.role() is distinct from 'authenticated' or not public.has_active_session() then
    raise exception using errcode = '42501', message = 'Active authenticated session required.';
  end if;
  select p.* into actor from public.profiles p where p.id = auth.uid() and p.is_sindico;
  if not found then
    raise exception using errcode = '42501', message = 'Occurrence unavailable.';
  end if;
  select o.* into target from public.occurrences o
  join public.condominiums c on c.id = o.condominium_id
  where o.id = target_occurrence and c.manager_id = actor.id
  for share of o, c;
  if not found then
    raise exception using errcode = '42501', message = 'Occurrence unavailable.';
  end if;
  if note is null or note !~ '[^[:space:]]' or length(note) > 10000 then
    raise exception using errcode = '22023', message = 'Invalid internal note.';
  end if;
  if actor.full_name is null or actor.full_name !~ '[^[:space:]]' then
    raise exception using errcode = '22023', message = 'Author profile requires a name.';
  end if;
  insert into public.occurrence_events (
    occurrence_id, event_type, occurred_at, author_type, author_profile_id,
    author_name, author_phone, author_role, internal_description,
    visible_to_resident, public_text, is_human_action, priority_snapshot, data
  ) values (
    target.id, 'manager_update', clock_timestamp(), 'manager', actor.id,
    actor.full_name, nullif(btrim(actor.phone), ''), 'manager', note,
    false, null, true, target.final_priority, '{}'::jsonb
  ) returning id into event_id;
  return event_id;
end;
$$;
revoke all on function public.append_occurrence_note(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.append_occurrence_note(uuid, text) to authenticated;

commit;
