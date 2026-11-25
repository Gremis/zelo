begin;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('occurrence-evidence', 'occurrence-evidence', false, 26214400,
  array['image/jpeg','image/png','image/webp','application/pdf','video/mp4']);

create table private.occurrence_upload_sessions (
  id uuid primary key,
  condominium_id uuid not null references public.condominiums(id) on delete restrict,
  secret_hash bytea not null,
  manifest jsonb not null,
  state text not null default 'open' check (state in ('open','cancelled','cleaning','linked')),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp() + interval '24 hours',
  last_activity_at timestamptz not null default clock_timestamp(),
  cleaned_at timestamptz,
  occurrence_id uuid references public.occurrences(id) on delete restrict
);
create index occurrence_upload_sessions_cleanup_idx on private.occurrence_upload_sessions(last_activity_at) where cleaned_at is null;
create index occurrence_upload_sessions_condominium_idx on private.occurrence_upload_sessions(condominium_id, created_at);

create table private.occurrence_upload_files (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references private.occurrence_upload_sessions(id) on delete restrict,
  file_name text not null,
  content_type text not null,
  size_bytes bigint not null,
  state text not null default 'reserved' check (state in ('reserved','inspecting','valid','invalid')),
  source_path text not null unique,
  evidence_path text not null unique,
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  authorizations integer not null default 0,
  lease_id uuid,
  lease_until timestamptz,
  failure text
);
create index occurrence_upload_files_session_idx on private.occurrence_upload_files(session_id);
alter table private.occurrence_upload_sessions enable row level security;
alter table private.occurrence_upload_files enable row level security;
revoke all on private.occurrence_upload_sessions, private.occurrence_upload_files from public, anon, authenticated, service_role;

create function public.occurrence_upload_operation(
  operation text, session_key uuid, condominium_slug text default null,
  upload_secret text default null, payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target uuid;
  s private.occurrence_upload_sessions%rowtype;
  f private.occurrence_upload_files%rowtype;
  item jsonb;
  item_id uuid;
  total bigint := 0;
  maximum bigint;
  result jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode='42501', message='Server access required.';
  end if;
  if operation = 'cleanup' then
    with candidates as (
      select u.id from private.occurrence_upload_sessions u
      where u.cleaned_at is null and u.last_activity_at < clock_timestamp() - interval '48 hours'
      order by u.last_activity_at limit 25 for update skip locked
    ), claimed as (
      update private.occurrence_upload_sessions u set state=case when u.state='linked' then 'linked' else 'cleaning' end
      from candidates c where u.id=c.id returning u.*
    ) select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'paths', (
      select jsonb_agg(p.path) from private.occurrence_upload_files uf
      cross join lateral (values (uf.source_path), (uf.evidence_path)) p(path)
      where uf.session_id=c.id and not exists (
        select 1 from public.occurrence_attachments a where a.storage_bucket='occurrence-evidence' and a.storage_path=p.path
      ) and (c.state<>'linked' or p.path=uf.source_path)
    ))), '[]'::jsonb) into result from claimed c;
    return result;
  end if;
  if operation = 'cleaned' then
    update private.occurrence_upload_sessions set cleaned_at=clock_timestamp()
    where id=session_key and state in ('linked','cleaning')
      and last_activity_at < clock_timestamp() - interval '48 hours';
    return '{}'::jsonb;
  end if;
  if session_key is null or upload_secret is null or upload_secret !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023', message='Invalid upload credentials.';
  end if;
  select c.id into target from public.condominiums c join public.profiles p on p.id=c.manager_id and p.is_sindico
  where c.slug=condominium_slug for share of c, p;
  if not found then raise exception using errcode='P0002', message='Upload unavailable.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target::text || ':' || session_key::text, 0));
  select * into s from private.occurrence_upload_sessions where id=session_key for update;
  if operation='prepare' and not found then
    if exists(select 1 from private.public_registration_attempts a where a.condominium_id=target and a.attempt_key=session_key) then
      raise exception using errcode='P0003', message='Attempt already registered.';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('uploads:' || target::text, 0));
    if (select count(*) from private.occurrence_upload_sessions where condominium_id=target and created_at>clock_timestamp()-interval '1 hour') >= 20 then
      raise exception using errcode='P0004', message='Upload reservation budget exceeded.';
    end if;
    if jsonb_typeof(payload) is distinct from 'array' then
      raise exception using errcode='22023', message='Invalid file manifest.';
    end if;
    if jsonb_array_length(payload) not between 1 and 5 then
      raise exception using errcode='22023', message='Invalid file count.';
    end if;
    for item in select value from jsonb_array_elements(payload) loop
      maximum := case item->>'contentType' when 'image/jpeg' then 8388608 when 'image/png' then 8388608 when 'image/webp' then 8388608 when 'application/pdf' then 10485760 when 'video/mp4' then 26214400 end;
      if maximum is null or jsonb_typeof(item) <> 'object' or (select count(*) from jsonb_object_keys(item))<>3
        or jsonb_typeof(item->'name') is distinct from 'string' or length(item->>'name') not between 1 and 200
        or item->>'name' ~ '[[:cntrl:]/\\]' or item->>'name' !~ '[^[:space:]]'
        or jsonb_typeof(item->'size') is distinct from 'number' or item->>'size' !~ '^[0-9]{1,8}$'
        or (item->>'size')::bigint not between 1 and maximum then
        raise exception using errcode='22023', message='Invalid file manifest.';
      end if;
      if not (lower(item->>'name') ~ case item->>'contentType' when 'image/jpeg' then '\.(jpg|jpeg)$' when 'image/png' then '\.png$' when 'image/webp' then '\.webp$' when 'application/pdf' then '\.pdf$' when 'video/mp4' then '\.mp4$' end) then
        raise exception using errcode='22023', message='File extension mismatch.';
      end if;
      total := total + (item->>'size')::bigint;
    end loop;
    if total>41943040 then raise exception using errcode='22023', message='Total upload size exceeded.'; end if;
    insert into private.occurrence_upload_sessions(id,condominium_id,secret_hash,manifest)
    values(session_key,target,extensions.digest(upload_secret,'sha256'),payload) returning * into s;
    for item in select value from jsonb_array_elements(payload) loop
      item_id := gen_random_uuid();
      insert into private.occurrence_upload_files(id,session_id,file_name,content_type,size_bytes,source_path,evidence_path)
      values(item_id,s.id,item->>'name',item->>'contentType',(item->>'size')::bigint,
        'incoming/' || s.id || '/' || item_id, 'evidence/' || s.id || '/' || item_id);
    end loop;
  end if;
  if s.id is null or s.condominium_id<>target or s.secret_hash<>extensions.digest(upload_secret,'sha256') then
    raise exception using errcode='P0002', message='Upload unavailable.';
  end if;
  if operation='prepare' and s.manifest<>payload then raise exception using errcode='P0003', message='Manifest conflict.'; end if;
  if operation not in ('status','prepare') then
    if operation='cancel' and s.state='cancelled' then return jsonb_build_object('state','cancelled'); end if;
    if s.state<>'open' or s.expires_at<=clock_timestamp() then raise exception using errcode='P0003', message='Upload is closed.'; end if;
    if operation='cancel' then
      update private.occurrence_upload_sessions set state='cancelled' where id=s.id;
      return jsonb_build_object('state','cancelled');
    end if;
    select * into f from private.occurrence_upload_files where session_id=s.id and id=(payload->>'fileId')::uuid for update;
    if not found then raise exception using errcode='P0002', message='File unavailable.'; end if;
    if operation='authorize' then
      if f.state not in ('reserved') or f.authorizations>=10 then raise exception using errcode='P0003', message='File authorization unavailable.'; end if;
      update private.occurrence_upload_files set authorizations=authorizations+1 where id=f.id;
    elsif operation='claim' then
      if f.state='invalid' or (f.state='inspecting' and f.lease_until>clock_timestamp()) then
        raise exception using errcode='P0003', message='File validation unavailable.';
      end if;
      if f.state<>'valid' then
        perform pg_advisory_xact_lock(hashtextextended('inspection:' || target::text,0));
        if exists(select 1 from private.occurrence_upload_files uf join private.occurrence_upload_sessions us on us.id=uf.session_id
          where us.condominium_id=target and uf.state='inspecting' and uf.lease_until>clock_timestamp()) then
          raise exception using errcode='P0003', message='Another file is being inspected.';
        end if;
        update private.occurrence_upload_files set state='inspecting',lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '90 seconds'
        where id=f.id returning * into f;
      end if;
    elsif operation in ('validated','failed','retry') then
      if f.state<>'inspecting' or f.lease_id is distinct from (payload->>'leaseId')::uuid or f.lease_until<=clock_timestamp() then
        raise exception using errcode='P0003', message='Inspection lease expired.';
      end if;
      if operation='validated' and ((payload->>'sha256') is null or (payload->>'sha256') !~ '^[0-9a-f]{64}$' or (payload->>'size')::bigint is distinct from f.size_bytes or payload->>'contentType' is distinct from f.content_type) then
        raise exception using errcode='22023', message='Invalid verified metadata.';
      end if;
      update private.occurrence_upload_files set state=case operation when 'validated' then 'valid' when 'retry' then 'reserved' else 'invalid' end,
        sha256=case when operation='validated' then payload->>'sha256' end,
        failure=case when operation='failed' then 'invalid_content' end, lease_id=null,lease_until=null
      where id=f.id;
    else raise exception using errcode='22023', message='Unknown upload operation.';
    end if;
    update private.occurrence_upload_sessions set last_activity_at=clock_timestamp() where id=s.id;
    if operation in ('authorize','claim') then return to_jsonb(f); end if;
  end if;
  return jsonb_build_object('id',s.id,'state',s.state,'expiresAt',s.expires_at,'number',(
    select o.number from public.occurrences o where o.id=s.occurrence_id
  ),'files',(
    select jsonb_agg(jsonb_build_object('id',uf.id,'name',uf.file_name,'contentType',uf.content_type,'size',uf.size_bytes,'state',uf.state,'failure',uf.failure) order by uf.id)
    from private.occurrence_upload_files uf where uf.session_id=s.id
  ));
end;
$$;
revoke all on function public.occurrence_upload_operation(text,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.occurrence_upload_operation(text,uuid,text,text,jsonb) to service_role;

drop function public.register_public_occurrence_attempt(text,uuid,text,text,text,text,text,text,text,text);
create function public.register_public_occurrence_attempt(
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
    if s.condominium_id<>target or upload_secret is null or s.secret_hash<>extensions.digest(upload_secret,'sha256') then
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

notify pgrst, 'reload schema';
commit;
