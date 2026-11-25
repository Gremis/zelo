begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values ('63000000-0000-4000-8000-000000000001','ori63-1@example.invalid',now(),'{"full_name":"Synthetic manager 1","is_sindico":true}');
insert into auth.sessions(id,user_id) values ('63000000-0000-4000-9000-000000000001','63000000-0000-4000-8000-000000000001');
insert into condominiums(id,manager_id,name,address) values ('63000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','Synthetic 1','Synthetic address');
insert into occurrences(id,condominium_id,origin,channel,description) values ('63000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','manager_panel','web','Synthetic occurrence');
insert into occurrence_events(occurrence_id,event_type,author_type,internal_description) values ('63000000-0000-4000-8000-000000000001','registered','system','Registered');
insert into occurrence_attachments(occurrence_id,event_id,storage_bucket,storage_path,file_name,content_type,size_bytes) select '63000000-0000-4000-8000-000000000001',id,'private','ori63/1','evidence.pdf','application/pdf',1 from occurrence_events where occurrence_id='63000000-0000-4000-8000-000000000001';
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values ('63000000-0000-4000-8000-000000000002','ori63-2@example.invalid',now(),'{"full_name":"Synthetic manager 2","is_sindico":true}');
insert into auth.sessions(id,user_id) values ('63000000-0000-4000-9000-000000000002','63000000-0000-4000-8000-000000000002');
insert into condominiums(id,manager_id,name,address) values ('63000000-0000-4000-8000-000000000002','63000000-0000-4000-8000-000000000002','Synthetic 2','Synthetic address');
insert into occurrences(id,condominium_id,origin,channel,description) values ('63000000-0000-4000-8000-000000000002','63000000-0000-4000-8000-000000000002','manager_panel','web','Synthetic occurrence');
insert into occurrence_events(occurrence_id,event_type,author_type,internal_description) values ('63000000-0000-4000-8000-000000000002','registered','system','Registered');
insert into occurrence_attachments(occurrence_id,event_id,storage_bucket,storage_path,file_name,content_type,size_bytes) select '63000000-0000-4000-8000-000000000002',id,'private','ori63/2','evidence.pdf','application/pdf',1 from occurrence_events where occurrence_id='63000000-0000-4000-8000-000000000002';
select set_config('ori63.foreign_event', (select id::text from occurrence_events where occurrence_id='63000000-0000-4000-8000-000000000002'), true);
select set_config('ori63.foreign_attachment', (select id::text from occurrence_attachments where occurrence_id='63000000-0000-4000-8000-000000000002'), true);
select set_config('ori63.foreign_number', (select number::text from occurrences where id='63000000-0000-4000-8000-000000000002'), true);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"63000000-0000-4000-8000-000000000001","session_id":"63000000-0000-4000-9000-000000000001","role":"authenticated"}',true);
select is((select count(*) from occurrences),1::bigint,'Manager 1 reads own occurrences');
select is((select count(*) from occurrences where id='63000000-0000-4000-8000-000000000002'),0::bigint,'Other portfolio occurrences hidden by ID');
select is((select count(*) from occurrence_events),1::bigint,'Manager 1 reads own occurrence_events');
select is((select count(*) from occurrence_events where occurrence_id='63000000-0000-4000-8000-000000000002'),0::bigint,'Other portfolio occurrence_events hidden by ID');
select is((select count(*) from occurrence_attachments),1::bigint,'Manager 1 reads own occurrence_attachments');
select is((select count(*) from occurrence_attachments where occurrence_id='63000000-0000-4000-8000-000000000002'),0::bigint,'Other portfolio occurrence_attachments hidden by ID');
select is((select count(*) from occurrences where number not in (select number from occurrences where id='63000000-0000-4000-8000-000000000001')),0::bigint,'Sequence filters cannot escape portfolio');
select is((select count(*) from occurrences where number=current_setting('ori63.foreign_number')::bigint),0::bigint,'Known foreign sequence number returns nothing');
select is((select count(*) from occurrences where id='63000000-0000-4000-8000-000000000099'),0::bigint,'Missing ID has same empty result as foreign ID');
select is((select count(*) from occurrence_events where id=current_setting('ori63.foreign_event')::bigint),0::bigint,'Foreign event primary ID is hidden');
select is((select count(*) from occurrence_attachments where id=current_setting('ori63.foreign_attachment')::uuid),0::bigint,'Foreign attachment primary ID is hidden');
select lives_ok($$select append_occurrence_note('63000000-0000-4000-8000-000000000001','Internal synthetic note')$$,'Authorized append succeeds');
select throws_ok($$select append_occurrence_note('63000000-0000-4000-8000-000000000002','Secret')$$,'42501','Occurrence unavailable.','Other portfolio append indistinguishable');
select throws_ok($$select append_occurrence_note('63000000-0000-4000-8000-000000000099','Secret')$$,'42501','Occurrence unavailable.','Missing append indistinguishable');
select throws_ok($$select append_occurrence_note('63000000-0000-4000-8000-000000000001',' ')$$,'22023',null,'Blank note rejected');
select throws_ok($$select public.append_occurrence_note(target_occurrence => '63000000-0000-4000-8000-000000000001'::uuid, note => 'Note'::text, author_profile_id => '63000000-0000-4000-8000-000000000002'::uuid)$$,'42883',null,'RPC rejects caller-selected author_profile_id');
select throws_ok($$select public.append_occurrence_note(target_occurrence => '63000000-0000-4000-8000-000000000001'::uuid, note => 'Note'::text, occurred_at => '2000-01-01'::timestamptz)$$,'42883',null,'RPC rejects caller-selected occurred_at');
select throws_ok($$select public.append_occurrence_note(target_occurrence => '63000000-0000-4000-8000-000000000001'::uuid, note => 'Note'::text, visible_to_resident => true)$$,'42883',null,'RPC rejects caller-selected visible_to_resident');
select throws_ok($$select public.append_occurrence_note(target_occurrence => '63000000-0000-4000-8000-000000000001'::uuid, note => 'Note'::text, data => '{"public_text":"Leak"}'::jsonb)$$,'42883',null,'RPC rejects caller-selected data');
select ok((select bool_and(author_profile_id='63000000-0000-4000-8000-000000000001' and author_name='Synthetic manager 1' and occurred_at >= transaction_timestamp() and not visible_to_resident and public_text is null and data='{}'::jsonb and is_human_action) from occurrence_events where event_type='manager_update'),'Identity time and projection are derived');
select throws_ok($$update occurrences set id=id$$,'42501',null,'authenticated cannot update occurrences');
select throws_ok($$delete from occurrences$$,'42501',null,'authenticated cannot delete occurrences');
select throws_ok($$truncate occurrences cascade$$,'42501',null,'authenticated cannot truncate occurrences');
select throws_ok($$update occurrence_events set internal_description=internal_description$$,'42501',null,'authenticated cannot update occurrence_events');
select throws_ok($$delete from occurrence_events$$,'42501',null,'authenticated cannot delete occurrence_events');
select throws_ok($$truncate occurrence_events cascade$$,'42501',null,'authenticated cannot truncate occurrence_events');
select throws_ok($$update occurrence_attachments set id=id$$,'42501',null,'authenticated cannot update occurrence_attachments');
select throws_ok($$delete from occurrence_attachments$$,'42501',null,'authenticated cannot delete occurrence_attachments');
select throws_ok($$truncate occurrence_attachments cascade$$,'42501',null,'authenticated cannot truncate occurrence_attachments');
select throws_ok($$insert into occurrence_events(occurrence_id,event_type,author_type,author_name,internal_description,occurred_at,visible_to_resident,public_text,data) values ('63000000-0000-4000-8000-000000000001','manager_update','manager','Forged','Private','2000-01-01',true,'Leak','{"author":"forged"}')$$,'42501',null,'Forged event payload denied');
select throws_ok($$insert into occurrence_attachments(occurrence_id,event_id,storage_bucket,storage_path,file_name,content_type,size_bytes) values ('63000000-0000-4000-8000-000000000002',1,'private','forged','forged','text/plain',1)$$,'42501',null,'Cross portfolio attachment denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"63000000-0000-4000-8000-000000000002","session_id":"63000000-0000-4000-9000-000000000002","role":"authenticated"}',true);
select is((select count(*) from occurrences),1::bigint,'Manager 2 reads own occurrences');
select is((select count(*) from occurrences where id='63000000-0000-4000-8000-000000000001'),0::bigint,'Other portfolio occurrences hidden by ID');
select is((select count(*) from occurrence_events),1::bigint,'Manager 2 reads own occurrence_events');
select is((select count(*) from occurrence_events where occurrence_id='63000000-0000-4000-8000-000000000001'),0::bigint,'Other portfolio occurrence_events hidden by ID');
select is((select count(*) from occurrence_attachments),1::bigint,'Manager 2 reads own occurrence_attachments');
select is((select count(*) from occurrence_attachments where occurrence_id='63000000-0000-4000-8000-000000000001'),0::bigint,'Other portfolio occurrence_attachments hidden by ID');
select is((select count(*) from occurrences where number not in (select number from occurrences where id='63000000-0000-4000-8000-000000000002')),0::bigint,'Sequence filters cannot escape portfolio');
select lives_ok($$select append_occurrence_note('63000000-0000-4000-8000-000000000002','Internal synthetic note')$$,'Authorized append succeeds');
select throws_ok($$select append_occurrence_note('63000000-0000-4000-8000-000000000001','Secret')$$,'42501','Occurrence unavailable.','Other portfolio append indistinguishable');
select throws_ok($$select append_occurrence_note('63000000-0000-4000-8000-000000000099','Secret')$$,'42501','Occurrence unavailable.','Missing append indistinguishable');
select throws_ok($$select append_occurrence_note('63000000-0000-4000-8000-000000000002',' ')$$,'22023',null,'Blank note rejected');
select ok((select bool_and(author_profile_id='63000000-0000-4000-8000-000000000002' and author_name='Synthetic manager 2' and occurred_at >= transaction_timestamp() and not visible_to_resident and public_text is null and data='{}'::jsonb and is_human_action) from occurrence_events where event_type='manager_update'),'Identity time and projection are derived');
select throws_ok($$update occurrences set id=id$$,'42501',null,'authenticated cannot update occurrences');
select throws_ok($$delete from occurrences$$,'42501',null,'authenticated cannot delete occurrences');
select throws_ok($$truncate occurrences cascade$$,'42501',null,'authenticated cannot truncate occurrences');
select throws_ok($$update occurrence_events set internal_description=internal_description$$,'42501',null,'authenticated cannot update occurrence_events');
select throws_ok($$delete from occurrence_events$$,'42501',null,'authenticated cannot delete occurrence_events');
select throws_ok($$truncate occurrence_events cascade$$,'42501',null,'authenticated cannot truncate occurrence_events');
select throws_ok($$update occurrence_attachments set id=id$$,'42501',null,'authenticated cannot update occurrence_attachments');
select throws_ok($$delete from occurrence_attachments$$,'42501',null,'authenticated cannot delete occurrence_attachments');
select throws_ok($$truncate occurrence_attachments cascade$$,'42501',null,'authenticated cannot truncate occurrence_attachments');
select throws_ok($$insert into occurrence_events(occurrence_id,event_type,author_type,author_name,internal_description,occurred_at,visible_to_resident,public_text,data) values ('63000000-0000-4000-8000-000000000002','manager_update','manager','Forged','Private','2000-01-01',true,'Leak','{"author":"forged"}')$$,'42501',null,'Forged event payload denied');
select throws_ok($$insert into occurrence_attachments(occurrence_id,event_id,storage_bucket,storage_path,file_name,content_type,size_bytes) values ('63000000-0000-4000-8000-000000000001',1,'private','forged','forged','text/plain',1)$$,'42501',null,'Cross portfolio attachment denied');
reset role;
update profiles set full_name='Changed name' where id='63000000-0000-4000-8000-000000000001';
select is((select author_name from occurrence_events where occurrence_id='63000000-0000-4000-8000-000000000001' and event_type='manager_update'),'Synthetic manager 1','Snapshot survives profile edits');
select throws_ok($$delete from occurrences where id='63000000-0000-4000-8000-000000000001'$$,'23503',null,'Occurrence deletion preserves history');
select throws_ok($$delete from condominiums where id='63000000-0000-4000-8000-000000000001'$$,'23503',null,'Condominium deletion preserves history');
select throws_ok($$delete from profiles where id='63000000-0000-4000-8000-000000000001'$$,'23503',null,'Profile deletion cannot rewrite author reference');
select throws_ok($$delete from auth.users where id='63000000-0000-4000-8000-000000000001'$$,'23503',null,'Account cascade cannot destroy history');
set local role authenticated;
select set_config('request.jwt.claims','{}',true);
select is((select count(*) from occurrences),0::bigint,'Invalid session reads nothing');
select throws_ok($$select append_occurrence_note('63000000-0000-4000-8000-000000000001','Blocked')$$,'42501',null,'Invalid session cannot append');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"63000000-0000-4000-8000-000000000001","session_id":"invalid","role":"authenticated"}',true);
select is((select count(*) from occurrences),0::bigint,'Invalid session reads nothing');
select throws_ok($$select append_occurrence_note('63000000-0000-4000-8000-000000000001','Blocked')$$,'42501',null,'Invalid session cannot append');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"63000000-0000-4000-8000-000000000001","session_id":"63000000-0000-4000-9000-000000000002","role":"authenticated"}',true);
select is((select count(*) from occurrences),0::bigint,'Invalid session reads nothing');
select throws_ok($$select append_occurrence_note('63000000-0000-4000-8000-000000000001','Blocked')$$,'42501',null,'Invalid session cannot append');
reset role;
delete from auth.sessions where id='63000000-0000-4000-9000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"63000000-0000-4000-8000-000000000001","session_id":"63000000-0000-4000-9000-000000000001","role":"authenticated"}',true);
select is((select count(*) from occurrences),0::bigint,'Revoked session cannot read occurrences');
select is((select count(*) from occurrence_events),0::bigint,'Revoked session cannot read occurrence_events');
select is((select count(*) from occurrence_attachments),0::bigint,'Revoked session cannot read occurrence_attachments');
select throws_ok($$select append_occurrence_note('63000000-0000-4000-8000-000000000001','Blocked')$$,'42501',null,'Revoked session cannot append');
reset role;
set local role anon;
select ok(not has_table_privilege(current_user,'public.occurrences','select'),'anon lacks select on occurrences');
select ok(not has_table_privilege(current_user,'public.occurrences','insert'),'anon lacks insert on occurrences');
select ok(not has_table_privilege(current_user,'public.occurrences','update'),'anon lacks update on occurrences');
select ok(not has_table_privilege(current_user,'public.occurrences','delete'),'anon lacks delete on occurrences');
select ok(not has_table_privilege(current_user,'public.occurrences','truncate'),'anon lacks truncate on occurrences');
select throws_ok($$select * from occurrences$$,'42501',null,'anon direct read denied');
select throws_ok($$truncate occurrences cascade$$,'42501',null,'anon truncate denied');
select ok(not has_table_privilege(current_user,'public.occurrence_events','select'),'anon lacks select on occurrence_events');
select ok(not has_table_privilege(current_user,'public.occurrence_events','insert'),'anon lacks insert on occurrence_events');
select ok(not has_table_privilege(current_user,'public.occurrence_events','update'),'anon lacks update on occurrence_events');
select ok(not has_table_privilege(current_user,'public.occurrence_events','delete'),'anon lacks delete on occurrence_events');
select ok(not has_table_privilege(current_user,'public.occurrence_events','truncate'),'anon lacks truncate on occurrence_events');
select throws_ok($$select * from occurrence_events$$,'42501',null,'anon direct read denied');
select throws_ok($$truncate occurrence_events cascade$$,'42501',null,'anon truncate denied');
select ok(not has_table_privilege(current_user,'public.occurrence_attachments','select'),'anon lacks select on occurrence_attachments');
select ok(not has_table_privilege(current_user,'public.occurrence_attachments','insert'),'anon lacks insert on occurrence_attachments');
select ok(not has_table_privilege(current_user,'public.occurrence_attachments','update'),'anon lacks update on occurrence_attachments');
select ok(not has_table_privilege(current_user,'public.occurrence_attachments','delete'),'anon lacks delete on occurrence_attachments');
select ok(not has_table_privilege(current_user,'public.occurrence_attachments','truncate'),'anon lacks truncate on occurrence_attachments');
select throws_ok($$select * from occurrence_attachments$$,'42501',null,'anon direct read denied');
select throws_ok($$truncate occurrence_attachments cascade$$,'42501',null,'anon truncate denied');
select throws_ok($$select append_occurrence_note('63000000-0000-4000-8000-000000000001','Blocked')$$,'42501',null,'Privileged server cannot invoke writer');
reset role;
set local role service_role;
select ok(not has_table_privilege(current_user,'public.occurrences','select'),'service_role lacks select on occurrences');
select ok(not has_table_privilege(current_user,'public.occurrences','insert'),'service_role lacks insert on occurrences');
select ok(not has_table_privilege(current_user,'public.occurrences','update'),'service_role lacks update on occurrences');
select ok(not has_table_privilege(current_user,'public.occurrences','delete'),'service_role lacks delete on occurrences');
select ok(not has_table_privilege(current_user,'public.occurrences','truncate'),'service_role lacks truncate on occurrences');
select throws_ok($$select * from occurrences$$,'42501',null,'service_role direct read denied');
select throws_ok($$truncate occurrences cascade$$,'42501',null,'service_role truncate denied');
select ok(not has_table_privilege(current_user,'public.occurrence_events','select'),'service_role lacks select on occurrence_events');
select ok(not has_table_privilege(current_user,'public.occurrence_events','insert'),'service_role lacks insert on occurrence_events');
select ok(not has_table_privilege(current_user,'public.occurrence_events','update'),'service_role lacks update on occurrence_events');
select ok(not has_table_privilege(current_user,'public.occurrence_events','delete'),'service_role lacks delete on occurrence_events');
select ok(not has_table_privilege(current_user,'public.occurrence_events','truncate'),'service_role lacks truncate on occurrence_events');
select throws_ok($$select * from occurrence_events$$,'42501',null,'service_role direct read denied');
select throws_ok($$truncate occurrence_events cascade$$,'42501',null,'service_role truncate denied');
select ok(not has_table_privilege(current_user,'public.occurrence_attachments','select'),'service_role lacks select on occurrence_attachments');
select ok(not has_table_privilege(current_user,'public.occurrence_attachments','insert'),'service_role lacks insert on occurrence_attachments');
select ok(not has_table_privilege(current_user,'public.occurrence_attachments','update'),'service_role lacks update on occurrence_attachments');
select ok(not has_table_privilege(current_user,'public.occurrence_attachments','delete'),'service_role lacks delete on occurrence_attachments');
select ok(not has_table_privilege(current_user,'public.occurrence_attachments','truncate'),'service_role lacks truncate on occurrence_attachments');
select throws_ok($$select * from occurrence_attachments$$,'42501',null,'service_role direct read denied');
select throws_ok($$truncate occurrence_attachments cascade$$,'42501',null,'service_role truncate denied');
select throws_ok($$select append_occurrence_note('63000000-0000-4000-8000-000000000001','Blocked')$$,'42501',null,'Privileged server cannot invoke writer');
reset role;
select ok((select rolbypassrls from pg_roles where rolname='service_role'),'service_role bypasses RLS; ACLs enforce denial');
select ok(not has_function_privilege('service_role','public.protect_occurrence_evidence()','execute'),'Trigger function not exposed');
select ok(not has_function_privilege('authenticated','public.email_confirmation_guard(text,text,uuid,uuid,text)','execute'),'Server guard not exposed to user');
create temporary table ori63_truncate_grants as
with recursive dependencies(relation) as (
  select 'public.occurrence_events'::regclass::oid
  union
  select constraint_row.conrelid
  from pg_constraint constraint_row join dependencies on constraint_row.confrelid = dependencies.relation
  where constraint_row.contype = 'f'
)
select relation::regclass as relation from dependencies
where not has_table_privilege('service_role', relation, 'TRUNCATE');
do $$
declare target regclass;
begin
  for target in select relation from ori63_truncate_grants loop
    execute format('grant truncate on table %s to service_role', target);
  end loop;
end;
$$;
grant update, delete, truncate on occurrence_events, occurrence_attachments, occurrence_completions to service_role;
set local role service_role;
select throws_ok($$update occurrence_events set internal_description='Rewritten'$$,'42501','Occurrence evidence is append-only.','Trigger blocks BYPASSRLS even if update is accidentally granted');
select throws_ok($$delete from occurrence_events$$,'42501','Occurrence evidence is append-only.','Trigger blocks deletion after accidental grant');
select throws_ok($$truncate occurrence_events cascade$$,'42501','Occurrence evidence is append-only.','Trigger blocks truncate after accidental grant');
select throws_ok($$update occurrence_attachments set storage_path='replacement'$$,'42501','Occurrence evidence is append-only.','Metadata cannot substitute evidence');
select throws_ok($$delete from occurrence_attachments$$,'42501','Occurrence evidence is append-only.','Metadata cannot remove evidence');
select throws_ok($$truncate occurrence_attachments$$,'42501','Occurrence evidence is append-only.','Metadata truncate blocked');
reset role;
select ok(to_regprocedure('public.append_occurrence_note(uuid,text,jsonb)') is null,'No structured payload overload exposed');
revoke update, delete, truncate on occurrence_events, occurrence_attachments, occurrence_completions from service_role;
do $$
declare target regclass;
begin
  for target in select relation from ori63_truncate_grants loop
    execute format('revoke truncate on table %s from service_role', target);
  end loop;
end;
$$;

select ok(not pg_has_role(r,'postgres','MEMBER') and not pg_has_role(r,'supabase_admin','MEMBER'),r || ' cannot inherit administrator exceptions')
from (values ('anon'),('authenticated'),('service_role')) roles(r);
select ok(not has_any_column_privilege(r,t,'INSERT') and not has_any_column_privilege(r,t,'UPDATE'),r || ' has no column write bypass on ' || t)
from (values ('anon'),('authenticated'),('service_role')) roles(r)
cross join (values ('occurrences'),('occurrence_events'),('occurrence_attachments')) tables(t);
select ok(prosecdef and proconfig = array['search_path=""'], 'Note RPC has fixed empty search_path and SECURITY DEFINER')
from pg_proc where oid='public.append_occurrence_note(uuid,text)'::regprocedure;
select is(has_function_privilege(r,'public.append_occurrence_note(uuid,text)','EXECUTE'),r='authenticated',r || ' effective RPC execute matches contract')
from (values ('anon'),('authenticated'),('service_role')) roles(r);
set local role authenticated;
select throws_ok($$select public.handle_new_user()$$,'0A000',null,'Legacy definer trigger cannot be used as an RPC');
reset role;
select * from finish();
rollback;
