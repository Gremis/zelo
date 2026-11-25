begin;
alter table private.occurrence_upload_sessions
 add column purpose text not null default 'registration' check (purpose in ('registration','completion')),
 add column target_occurrence_id uuid references public.occurrences(id),
 add column manager_id uuid references public.profiles(id);

create function public.manager_occurrence_upload_operation(operation text, session_key uuid, target_occurrence uuid, actor_profile uuid, upload_secret text, payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare slug text; s private.occurrence_upload_sessions%rowtype; result jsonb; state text;
begin
 if auth.role() is distinct from 'service_role' then raise exception using errcode='42501',message='Server required.'; end if;
 select c.slug,o.status into slug,state from public.occurrences o join public.condominiums c on c.id=o.condominium_id join public.profiles p on p.id=c.manager_id and p.is_sindico where o.id=target_occurrence and c.manager_id=actor_profile;
 if slug is null then raise exception using errcode='P0002',message='Occurrence unavailable.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('manager-upload:'||session_key::text,0));
 select * into s from private.occurrence_upload_sessions where id=session_key for update;
 if found and (s.purpose<>'completion' or s.target_occurrence_id is distinct from target_occurrence or s.manager_id is distinct from actor_profile) then raise exception using errcode='P0002',message='Upload unavailable.'; end if;
 if operation not in ('prepare','status','cancel','authorize','claim','validated','failed','retry') then raise exception using errcode='22023',message='Invalid operation.'; end if;
 if state not in ('in_progress','delegated') and operation not in ('status','cancel') then raise exception using errcode='P0003',message='Occurrence is locked.'; end if;
 result:=public.occurrence_upload_operation(operation,session_key,slug,upload_secret,payload);
 if operation='prepare' and s.id is null then
   update private.occurrence_upload_sessions set purpose='completion',target_occurrence_id=target_occurrence,manager_id=actor_profile where id=session_key;
 end if;
 return result;
end;
$$;
revoke all on function public.manager_occurrence_upload_operation(text,uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.manager_occurrence_upload_operation(text,uuid,uuid,uuid,text,jsonb) to service_role;

create function private.link_completion_upload(target_occurrence uuid, completion_event bigint, payload jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare s private.occurrence_upload_sessions%rowtype;
begin
 if payload->>'uploadKey' is null and payload->>'uploadSecret' is null then return; end if;
 select * into s from private.occurrence_upload_sessions where id=(payload->>'uploadKey')::uuid for update;
 if s.id is null or s.purpose<>'completion' or s.target_occurrence_id<>target_occurrence or s.manager_id<>auth.uid() or s.secret_hash is distinct from extensions.digest(payload->>'uploadSecret','sha256') then raise exception using errcode='42501',message='Upload unavailable.'; end if;
 if s.state<>'open' or s.expires_at<=clock_timestamp() or not exists(select 1 from private.occurrence_upload_files where session_id=s.id) or exists(select 1 from private.occurrence_upload_files where session_id=s.id and state<>'valid') then raise exception using errcode='P0003',message='All files must be verified.'; end if;
 insert into public.occurrence_attachments(occurrence_id,event_id,storage_bucket,storage_path,file_name,content_type,size_bytes)
 select target_occurrence,completion_event,'occurrence-evidence',evidence_path,file_name,content_type,size_bytes from private.occurrence_upload_files where session_id=s.id;
 update private.occurrence_upload_sessions set state='linked',occurrence_id=target_occurrence,last_activity_at=clock_timestamp() where id=s.id;
end;
$$;
revoke all on function private.link_completion_upload(uuid,bigint,jsonb) from public,anon,authenticated,service_role;
create or replace function public.register_public_occurrence_attempt(
  condominium_slug text, attempt_key uuid, reporter_name text, reporter_phone text,
  reporter_unit_or_role text, description text, location text,
  calculated_priority text, calculated_reason text, calculated_source text,
  upload_secret text default null
) returns table (occurrence_id uuid, number bigint, tracking_code text)
language plpgsql security definer set search_path = '' as $$
declare
  target uuid;
  fingerprint bytea;
  previous private.public_registration_attempts%rowtype;
  receipt record;
  s private.occurrence_upload_sessions%rowtype;
  manifest_hash jsonb;
  initial_event bigint;
begin
  if attempt_key is null then raise exception using errcode='22023', message='Invalid attempt key.'; end if;
  select c.id into target from public.condominiums c join public.profiles p on p.id=c.manager_id and p.is_sindico
  where c.slug=condominium_slug for share of c,p;
  if not found then raise exception using errcode='P0002', message='Public link unavailable.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target::text || ':' || attempt_key::text,0));
  select * into s from private.occurrence_upload_sessions where id=attempt_key for update;
  if found then
    if s.purpose<>'registration' or s.condominium_id<>target or upload_secret is null or s.secret_hash<>extensions.digest(upload_secret,'sha256') then
      raise exception using errcode='P0002', message='Upload unavailable.';
    end if;
    if s.state<>'linked' and (s.state<>'open' or s.expires_at<=clock_timestamp()) then
      raise exception using errcode='P0003', message='Upload is closed.';
    end if;
    if exists(select 1 from private.occurrence_upload_files where session_id=s.id and state<>'valid') then
      raise exception using errcode='P0003', message='All files must be validated.';
    end if;
    select jsonb_agg(jsonb_build_array(f.id,f.file_name,f.content_type,f.size_bytes,f.sha256) order by f.id)
    into manifest_hash from private.occurrence_upload_files f where f.session_id=s.id;
  elsif upload_secret is not null then raise exception using errcode='P0002', message='Upload unavailable.';
  end if;
  fingerprint := extensions.digest(convert_to((jsonb_build_array(reporter_name,reporter_phone,reporter_unit_or_role,location,description)
    || case when s.id is null then '[]'::jsonb else jsonb_build_array(manifest_hash) end)::text,'UTF8'),'sha256');
  select * into previous from private.public_registration_attempts a where a.condominium_id=target and a.attempt_key=register_public_occurrence_attempt.attempt_key;
  if found then
    if previous.content_hash<>fingerprint then raise exception using errcode='P0003', message='Attempt content conflict.'; end if;
    return query select o.id,o.number,o.tracking_code from public.occurrences o where o.id=previous.occurrence_id;
    return;
  end if;
  select * into receipt from public.register_public_occurrence_with_suggestion(condominium_slug,reporter_name,reporter_phone,reporter_unit_or_role,description,location,calculated_priority,calculated_reason,calculated_source);
  if s.id is not null then
    select e.id into strict initial_event from public.occurrence_events e where e.occurrence_id=receipt.occurrence_id and e.event_type='registered';
    insert into public.occurrence_attachments(occurrence_id,event_id,storage_bucket,storage_path,file_name,content_type,size_bytes)
    select receipt.occurrence_id,initial_event,'occurrence-evidence',f.evidence_path,f.file_name,f.content_type,f.size_bytes
    from private.occurrence_upload_files f where f.session_id=s.id;
    update private.occurrence_upload_sessions set state='linked',occurrence_id=receipt.occurrence_id,last_activity_at=clock_timestamp() where id=s.id;
  end if;
  insert into private.public_registration_attempts values(target,attempt_key,fingerprint,receipt.occurrence_id);
  return query select receipt.occurrence_id::uuid,receipt.number::bigint,receipt.tracking_code::text;
end;
$$;
revoke all on function public.register_public_occurrence_attempt(text,uuid,text,text,text,text,text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.register_public_occurrence_attempt(text,uuid,text,text,text,text,text,text,text,text,text) to service_role;


commit;
