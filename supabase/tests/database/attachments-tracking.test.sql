begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select is(
  (select pg_get_expr(d.adbin, d.adrelid)
   from pg_attrdef d join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum
   where d.adrelid='public.occurrences'::regclass and a.attname='tracking_code'),
  'encode(gen_random_bytes(32), ''hex''::text)',
  'Tracking default encodes 32 cryptographically random bytes independently of reporter and sequence data'
);

select ok(exists (
  select 1 from pg_depend dependency
  join pg_attrdef d on dependency.classid='pg_attrdef'::regclass and dependency.objid=d.oid
  join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum
  where d.adrelid='public.occurrences'::regclass and a.attname='tracking_code'
    and dependency.refclassid='pg_proc'::regclass
    and dependency.refobjid='extensions.gen_random_bytes(integer)'::regprocedure
), 'Tracking default depends on the existing pgcrypto random-byte function');

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('57000000-0000-4000-8000-000000000001','ori57-1@example.invalid',now(),'{"full_name":"Synthetic manager 1","is_sindico":true}'),
('57000000-0000-4000-8000-000000000002','ori57-2@example.invalid',now(),'{"full_name":"Synthetic manager 2","is_sindico":true}');
insert into auth.sessions(id,user_id) values
('57000000-0000-4000-9000-000000000001','57000000-0000-4000-8000-000000000001'),
('57000000-0000-4000-9000-000000000002','57000000-0000-4000-8000-000000000002');
insert into condominiums(id,manager_id,name,address) values
('57000000-0000-4000-8000-000000000001','57000000-0000-4000-8000-000000000001','Synthetic ORI57 1','Synthetic address'),
('57000000-0000-4000-8000-000000000002','57000000-0000-4000-8000-000000000002','Synthetic ORI57 2','Synthetic address');
select set_config('ori57.slug', (select slug from condominiums where id='57000000-0000-4000-8000-000000000001'), true);

set local role service_role;
select set_config('ori57.created', r.occurrence_id::text, true),
       set_config('ori57.tracking', r.tracking_code, true)
from public.register_public_occurrence_attempt(current_setting('ori57.slug'),'57000000-0000-4000-a000-000000000001','Ana','11900000000','Porteiro','Synthetic report','Hall','normal','Sem sinal de risco no relato.','rules') r;
reset role;

create temporary table ori57_original_event as
select * from occurrence_events where occurrence_id=current_setting('ori57.created')::uuid;
insert into occurrence_attachments(id,occurrence_id,event_id,storage_bucket,storage_path,file_name,content_type,size_bytes)
select '57000000-0000-4000-b000-000000000001',occurrence_id,id,'private','ori57/evidence.pdf','evidence.pdf','application/pdf',100
from ori57_original_event;
create temporary table ori57_original_attachment as
select * from occurrence_attachments where id='57000000-0000-4000-b000-000000000001';

insert into occurrences(id,condominium_id,origin,channel,description) values
('57000000-0000-4000-8000-000000000002','57000000-0000-4000-8000-000000000001','manager_panel','web','Synthetic second occurrence in same portfolio');
select throws_ok($$insert into occurrence_attachments(occurrence_id,event_id,storage_bucket,storage_path,file_name,content_type,size_bytes)
select '57000000-0000-4000-8000-000000000002',id,'private','ori57/mismatch.pdf','mismatch.pdf','application/pdf',100 from ori57_original_event$$,
'23503',null,'Attachment insertion rejects another occurrence event even within the same portfolio');

set local role service_role;
select set_config('ori57.replayed_id',r.occurrence_id::text,true),
       set_config('ori57.replayed_tracking',r.tracking_code,true)
from public.register_public_occurrence_attempt(current_setting('ori57.slug'),'57000000-0000-4000-a000-000000000001','Ana','11900000000','Porteiro','Synthetic report','Hall','normal','Sem sinal de risco no relato.','rules') r;
reset role;
select is(current_setting('ori57.replayed_id'),current_setting('ori57.created'),'Retry returns the original occurrence after metadata persistence');
select is(current_setting('ori57.replayed_tracking'),current_setting('ori57.tracking'),'Retry preserves the existing tracking code');
select is((select count(*) from occurrence_events where occurrence_id=current_setting('ori57.created')::uuid),1::bigint,'Metadata insertion and retry do not create another initial event');
select results_eq('select * from occurrence_events where occurrence_id=current_setting(''ori57.created'')::uuid','select * from ori57_original_event','Initial event remains byte-for-byte unchanged');
select results_eq('select * from occurrence_attachments where id=''57000000-0000-4000-b000-000000000001''','select * from ori57_original_attachment','Retry preserves persisted attachment metadata');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000002","session_id":"57000000-0000-4000-9000-000000000002","role":"authenticated"}',true);
select is((select count(*) from occurrences where tracking_code=current_setting('ori57.tracking')),0::bigint,'Knowing a tracking code does not bypass another portfolio read policy');
select is((select count(*) from occurrence_attachments where occurrence_id=current_setting('ori57.created')::uuid),0::bigint,'Known code and occurrence do not expose foreign attachment metadata');
select throws_ok($$update occurrences set status='in_progress' where tracking_code=current_setting('ori57.tracking')$$,'42501',null,'Known code does not grant administrative writes');
reset role;

set local role anon;
select throws_ok($$select number from occurrences where tracking_code=current_setting('ori57.tracking')$$,'42501',null,'Even a known code grants no anonymous lookup');
select throws_ok($$select * from occurrence_attachments where occurrence_id=current_setting('ori57.created')::uuid$$,'42501',null,'Known occurrence grants no anonymous metadata access');
reset role;

select * from finish();
rollback;
