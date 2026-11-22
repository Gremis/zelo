begin;
create schema if not exists local_demo;
revoke all on schema local_demo from public, anon, authenticated, service_role;
create table if not exists local_demo.accounts (
  fixture_key text primary key,
  user_id uuid not null unique references auth.users(id) on delete restrict
);
create table if not exists local_demo.condominiums (
  fixture_key text primary key,
  condominium_id uuid not null unique references public.condominiums(id) on delete restrict
);
create table if not exists local_demo.occurrences (
  fixture_key text primary key,
  condominium_id uuid not null references public.condominiums(id) on delete restrict,
  input jsonb not null,
  occurrence_id uuid unique references public.occurrences(id) on delete restrict,
  event_id bigint unique,
  check ((occurrence_id is null) = (event_id is null)),
  foreign key (occurrence_id,event_id) references public.occurrence_events(occurrence_id,id) on delete restrict,
  unique (condominium_id,input)
);
revoke all on all tables in schema local_demo from public, anon, authenticated, service_role;
create or replace function local_demo.capture_registration()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  target public.occurrences%rowtype;
  fixture local_demo.occurrences%rowtype;
  payload jsonb;
begin
  if new.event_type <> 'registered' then return new; end if;
  select o.* into target from public.occurrences o where o.id=new.occurrence_id;
  payload := jsonb_build_object(
    'type','registered','condominiumSlug',(select slug from public.condominiums where id=target.condominium_id),
    'reporterName',target.reporter_name,'reporterPhone',target.reporter_phone,
    'reporterUnitOrRole',target.reporter_unit_or_role,'location',target.location,'description',target.description
  );
  select * into fixture from local_demo.occurrences
  where condominium_id=target.condominium_id and input=payload for update;
  if not found then return new; end if;
  if fixture.occurrence_id is not null then
    raise exception using errcode='23505',message='Local demo fixture already registered.';
  end if;
  update local_demo.occurrences set occurrence_id=new.occurrence_id,event_id=new.id where fixture_key=fixture.fixture_key;
  return new;
end;
$$;
revoke all on function local_demo.capture_registration() from public, anon, authenticated, service_role;
create or replace trigger ori76_capture_registration after insert on public.occurrence_events
for each row when (new.event_type='registered') execute function local_demo.capture_registration();
commit;
