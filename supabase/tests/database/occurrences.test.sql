begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
insert into auth.users(id,email) values ('62000000-0000-4000-8000-000000000001','ori62@example.invalid');
insert into public.condominiums(id,manager_id,name,address) values
('62000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001','Synthetic ORI62','Synthetic address');
insert into public.occurrences(id, condominium_id, origin, channel, description, suggested_priority, suggestion_source, suggestion_reason, suggestion_at) values
('62000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001','manager_panel','phone','Synthetic report','urgent','rules','Synthetic rule','2026-01-01 00:00Z'),
('62000000-0000-4000-8000-000000000002','62000000-0000-4000-8000-000000000001','public_form','web','Second synthetic report',null,null,null,null);
select is((select status from occurrences where id='62000000-0000-4000-8000-000000000001'),'new','Initial status');
select ok((select reporter_name is null and final_priority is null and responsible_profile_id is null from occurrences where id='62000000-0000-4000-8000-000000000001'),'Initial optional fields remain null');
select is((select count(distinct tracking_code) from occurrences where condominium_id='62000000-0000-4000-8000-000000000001'),2::bigint,'Independent unique tracking codes');
select matches((select tracking_code from occurrences where id='62000000-0000-4000-8000-000000000001'),'^[0-9a-f]{64}$','256 bit tracking code');
select throws_ok($$update occurrences set tracking_code=(select tracking_code from occurrences where id='62000000-0000-4000-8000-000000000001') where id='62000000-0000-4000-8000-000000000002'$$,'23505',null,'Duplicate tracking code rejected');
select throws_ok($$update occurrences set description=NULL where id='62000000-0000-4000-8000-000000000001'$$,'23502',null,'Reject invalid description');
select throws_ok($$update occurrences set description=E' \t\n' where id='62000000-0000-4000-8000-000000000001'$$,'23514',null,'Reject invalid description');
select throws_ok($$update occurrences set status='overdue' where id='62000000-0000-4000-8000-000000000001'$$,'23514',null,'Reject invalid status');
select throws_ok($$update occurrences set origin='phone' where id='62000000-0000-4000-8000-000000000001'$$,'23514',null,'Reject invalid origin');
select throws_ok($$update occurrences set channel='public_form' where id='62000000-0000-4000-8000-000000000001'$$,'23514',null,'Reject invalid channel');
select throws_ok($$update occurrences set final_priority='high' where id='62000000-0000-4000-8000-000000000001'$$,'23514',null,'Reject invalid final_priority');
select throws_ok($$update occurrences set reporter_name=' ' where id='62000000-0000-4000-8000-000000000001'$$,'23514',null,'Reject invalid reporter_name');
select throws_ok($$update occurrences set suggested_priority='normal' where id='62000000-0000-4000-8000-000000000001'$$,'42501',null,'Original suggested priority cannot change');
select throws_ok($$update occurrences set condominium_id='62000000-0000-4000-8000-000000000099' where id='62000000-0000-4000-8000-000000000001'$$,'23503',null,'Reject invalid condominium_id');
select throws_ok($$update occurrences set status='completed' where id='62000000-0000-4000-8000-000000000001'$$,'23514',null,'Reject invalid status');
update occurrences set registered_at='2026-01-01 00:00Z', final_priority='normal', priority_decided_at='2026-01-01 00:01Z', decided_priority='urgent', decided_suggested_priority='urgent' where id='62000000-0000-4000-8000-000000000001';
insert into occurrence_events(occurrence_id,event_type,author_type,author_profile_id,author_name,author_phone,author_role,internal_description,public_text,visible_to_resident,occurred_at,is_human_action,priority_snapshot) values
('62000000-0000-4000-8000-000000000001','manager_update','manager','62000000-0000-4000-8000-000000000001','Synthetic author','00000000000','manager','Private note','Public update',true,'2026-01-01 00:05Z',true,'urgent');
create temporary table first_event as select id from occurrence_events where occurrence_id='62000000-0000-4000-8000-000000000001';
update profiles set full_name='Changed synthetic author', phone='11111111111' where id='62000000-0000-4000-8000-000000000001';
select is((select author_name from occurrence_events where id=(select id from first_event)),'Synthetic author','Author name survives profile edits');
select is((select author_phone from occurrence_events where id=(select id from first_event)),'00000000000','Author phone survives profile edits');
select isnt((select public_text from occurrence_events where id=(select id from first_event)),(select internal_description from occurrence_events where id=(select id from first_event)),'Public text is independent');
select throws_ok($$update occurrence_events set public_text=null where id=(select id from first_event)$$,'23514',null,'Visible events require explicit public text');
select throws_ok($$update occurrence_events set event_type='priority_changed' where id=(select id from first_event)$$,'23514',null,'Priority changes are not human timeline types');
insert into occurrence_attachments(occurrence_id,event_id,storage_bucket,storage_path,file_name,content_type,size_bytes)
select '62000000-0000-4000-8000-000000000001',id,'private','synthetic/file.pdf','file.pdf','application/pdf',100 from first_event;
select throws_ok($$update occurrence_attachments set occurrence_id='62000000-0000-4000-8000-000000000002' where event_id=(select id from first_event)$$,'23503',null,'Attachment cannot reference another occurrence');
select throws_ok($$update occurrence_attachments set storage_path='https://example.invalid/file' where event_id=(select id from first_event)$$,'23514',null,'Storage reference rejects URLs');
select throws_ok($$update occurrence_attachments set size_bytes=0 where event_id=(select id from first_event)$$,'23514',null,'Empty attachment rejected');
select throws_ok($$delete from occurrence_events where id=(select id from first_event)$$,'23503',null,'Deleting event cannot erase attachments');
select throws_ok($$delete from occurrences where id='62000000-0000-4000-8000-000000000001'$$,'23503',null,'Deleting occurrence cannot erase timeline');
insert into occurrence_events(occurrence_id,event_type,author_type,author_name,internal_description,occurred_at,delegation_started_at)
values ('62000000-0000-4000-8000-000000000001','completed','manager','Synthetic author','Completed','2026-01-01 02:00Z','2026-01-01 01:00Z');
insert into occurrence_events(occurrence_id,event_type,author_type,author_name,internal_description,occurred_at,priority_snapshot) values
('62000000-0000-4000-8000-000000000001','registered','reporter','Synthetic reporter','Registered','2026-01-01 00:00Z','urgent'),
('62000000-0000-4000-8000-000000000002','registered','reporter','Synthetic reporter','Registered','2026-01-01 00:00Z','normal');
update occurrence_events set priority_snapshot='normal' where id=(select id from first_event);
insert into occurrence_events(occurrence_id,event_type,author_type,author_name,internal_description,occurred_at,is_human_action,priority_snapshot) values
('62000000-0000-4000-8000-000000000001','manager_update','manager','Synthetic author','Later urgent action','2026-01-01 00:06Z',true,'urgent'),
('62000000-0000-4000-8000-000000000002','manager_update','manager','Synthetic author','Later escalation','2026-01-01 00:05Z',true,'urgent');
create temporary view urgent_response_metrics as
select o.id, a.occurred_at - o.registered_at as first_human_response
from public.occurrences o
cross join lateral (
  select e.priority_snapshot
  from public.occurrence_events e
  where e.occurrence_id = o.id and e.event_type = 'registered'
  order by e.occurred_at, e.id
  limit 1
) registration
left join lateral (
  select e.occurred_at
  from public.occurrence_events e
  where e.occurrence_id = o.id and e.is_human_action
  order by e.occurred_at, e.id
  limit 1
) a on true
where registration.priority_snapshot = 'urgent';
select is((select extract(epoch from first_human_response)::bigint from urgent_response_metrics where id='62000000-0000-4000-8000-000000000001'),300::bigint,'Initially urgent response uses first action even after reprioritization');
select is((select count(*) from urgent_response_metrics where id='62000000-0000-4000-8000-000000000002'),0::bigint,'Later escalation does not rewrite initial urgent cohort');
select is((select 100.0*count(*) filter(where decided_priority=decided_suggested_priority)/count(*) from occurrences where id='62000000-0000-4000-8000-000000000001' and decided_suggested_priority is not null),100.0,'Decision snapshot survives later priority edit');
select is((select extract(epoch from occurred_at-delegation_started_at)::bigint from occurrence_events where occurrence_id='62000000-0000-4000-8000-000000000001' and event_type='completed'),3600::bigint,'Delegation to completion duration');
select ok(relrowsecurity and relforcerowsecurity,relname || ' uses forced RLS') from pg_class where oid in ('occurrences'::regclass,'occurrence_events'::regclass,'occurrence_attachments'::regclass);
select is(has_table_privilege(r,t,p), r = 'authenticated' and p = 'SELECT', r || ' expected ' || p || ' on ' || t)
from (values ('anon'),('authenticated'),('service_role')) roles(r)
cross join (values ('occurrences'),('occurrence_events'),('occurrence_attachments')) tables(t)
cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) privileges(p);
select is((select count(*) from pg_policy where polrelid in ('occurrences'::regclass,'occurrence_events'::regclass,'occurrence_attachments'::regclass)),3::bigint,'Portfolio read policies cover all history tables');
select throws_ok($$update occurrences set condominium_id=null where id='62000000-0000-4000-8000-000000000001'$$,'23502',null,'Required condominium_id');
select throws_ok($$update occurrences set origin=null where id='62000000-0000-4000-8000-000000000001'$$,'23502',null,'Required origin');
select throws_ok($$update occurrences set channel=null where id='62000000-0000-4000-8000-000000000001'$$,'23502',null,'Required channel');
select throws_ok($$update occurrences set registered_at=null where id='62000000-0000-4000-8000-000000000001'$$,'23502',null,'Required registered_at');
select throws_ok($$update occurrences set status=null where id='62000000-0000-4000-8000-000000000001'$$,'23502',null,'Required status');
select throws_ok($$update occurrences set tracking_code=null where id='62000000-0000-4000-8000-000000000001'$$,'23502',null,'Required tracking_code');
select throws_ok($$update occurrences set reporter_phone=E' \t\n' where id='62000000-0000-4000-8000-000000000001'$$,'23514',null,'Blank reporter_phone rejected');
select throws_ok($$update occurrences set reporter_unit_or_role=E' \t\n' where id='62000000-0000-4000-8000-000000000001'$$,'23514',null,'Blank reporter_unit_or_role rejected');
select throws_ok($$update occurrences set location=E' \t\n' where id='62000000-0000-4000-8000-000000000001'$$,'23514',null,'Blank location rejected');
select throws_ok($$update occurrences set category=E' \t\n' where id='62000000-0000-4000-8000-000000000001'$$,'23514',null,'Blank category rejected');
select throws_ok($$update occurrences set priority_change_reason=E' \t\n' where id='62000000-0000-4000-8000-000000000001'$$,'23514',null,'Blank priority_change_reason rejected');
select throws_ok($$update occurrences set decision=E' \t\n' where id='62000000-0000-4000-8000-000000000001'$$,'23514',null,'Blank decision rejected');
select throws_ok($$update occurrences set responsible_name=E' \t\n' where id='62000000-0000-4000-8000-000000000001'$$,'23514',null,'Blank responsible_name rejected');
select throws_ok($$update occurrences set responsible_phone=E' \t\n' where id='62000000-0000-4000-8000-000000000001'$$,'23514',null,'Blank responsible_phone rejected');
select throws_ok($$update occurrences set responsible_role=E' \t\n' where id='62000000-0000-4000-8000-000000000001'$$,'23514',null,'Blank responsible_role rejected');
select throws_ok($$update occurrences set internal_note=E' \t\n' where id='62000000-0000-4000-8000-000000000001'$$,'23514',null,'Blank internal_note rejected');
insert into auth.users(id,email) values ('62000000-0000-4000-8000-000000000003','ori62-author@example.invalid');
update occurrence_events set author_profile_id='62000000-0000-4000-8000-000000000003' where id=(select id from first_event);
update occurrences set responsible_profile_id='62000000-0000-4000-8000-000000000003', responsible_name='Synthetic responsible' where id='62000000-0000-4000-8000-000000000001';
select throws_ok($$delete from auth.users where id='62000000-0000-4000-8000-000000000003'$$,'23503',null,'Author deletion is restricted to preserve immutable reference');
select ok((select author_profile_id='62000000-0000-4000-8000-000000000003' and author_name='Synthetic author' and author_phone='00000000000' and author_role='manager' from occurrence_events where id=(select id from first_event)),'Author snapshots and reference survive attempted deletion');
select ok((select responsible_profile_id='62000000-0000-4000-8000-000000000003' and responsible_name='Synthetic responsible' from occurrences where id='62000000-0000-4000-8000-000000000001'),'Responsible snapshot survives rejected account deletion');
insert into occurrence_events(occurrence_id,event_type,author_type,author_name,internal_description,occurred_at)
values ('62000000-0000-4000-8000-000000000001','manager_update','manager','Synthetic author','Same timestamp','2026-01-01 00:05Z');
select is((select id from occurrence_events where occurrence_id='62000000-0000-4000-8000-000000000001' and event_type='manager_update' order by occurred_at,id limit 1),(select id from first_event),'Identity breaks timestamp ties deterministically');
select ok(not has_sequence_privilege(r,s,'USAGE'),r || ' cannot use ' || s)
from (values ('anon'),('authenticated'),('service_role')) roles(r)
cross join (values ('occurrences_number_seq'),('occurrence_events_id_seq')) sequences(s);
set local role anon;
select throws_ok($$select tracking_code from public.occurrences$$,'42501',null,'Anonymous tracking lookup denied');
reset role;
set local role authenticated;
select is((select count(*) from public.occurrence_events where visible_to_resident),0::bigint,'Visibility flag grants no access without active portfolio session');
reset role;
set local role service_role;
select throws_ok($$select * from public.occurrence_attachments$$,'42501',null,'Service bypass RLS grants no table privilege');
reset role;
select throws_ok($$delete from condominiums where id='62000000-0000-4000-8000-000000000001'$$,'23503',null,'Condominium deletion cannot cascade into evidence');
select throws_ok($$update occurrences set number=42 where id='62000000-0000-4000-8000-000000000001'$$,'428C9',null,'Identity number rejects explicit assignment');
select ok((select registered_at is not null and number > 0 from occurrences where id='62000000-0000-4000-8000-000000000002'),'Database generates registration time and number');
select ok((select public_text is null and not visible_to_resident and data='{}'::jsonb from occurrence_events where occurrence_id='62000000-0000-4000-8000-000000000001' and event_type='registered'),'New event defaults are private with an object payload');
select throws_ok($$update occurrence_events set event_type='ai_failed' where id=(select id from first_event)$$,'23514',null,'Reject invalid event event_type');
select throws_ok($$update occurrence_events set author_type='unknown' where id=(select id from first_event)$$,'23514',null,'Reject invalid event author_type');
select throws_ok($$update occurrence_events set internal_description=E' \t\n' where id=(select id from first_event)$$,'23514',null,'Reject invalid event internal_description');
select throws_ok($$update occurrence_events set author_name=null where id=(select id from first_event)$$,'23514',null,'Reject invalid event author_name');
select throws_ok($$update occurrence_events set data='[]'::jsonb where id=(select id from first_event)$$,'23514',null,'Reject invalid event data');
select throws_ok($$update occurrence_events set author_role=' ' where id=(select id from first_event)$$,'23514',null,'Reject invalid event author_role');
select throws_ok($$update occurrence_events set author_phone=' ' where id=(select id from first_event)$$,'23514',null,'Reject invalid event author_phone');
select throws_ok($$update occurrence_events set public_text=' ' where id=(select id from first_event)$$,'23514',null,'Reject invalid event public_text');
select throws_ok($$update occurrence_events set occurrence_id='62000000-0000-4000-8000-000000000099' where id=(select id from first_event)$$,'23503',null,'Reject invalid event occurrence_id');
select throws_ok($$update occurrence_events set occurrence_id=null where id=(select id from first_event)$$,'23502',null,'Required event occurrence_id');
select throws_ok($$update occurrence_events set event_type=null where id=(select id from first_event)$$,'23502',null,'Required event event_type');
select throws_ok($$update occurrence_events set author_type=null where id=(select id from first_event)$$,'23502',null,'Required event author_type');
select throws_ok($$update occurrence_events set internal_description=null where id=(select id from first_event)$$,'23502',null,'Required event internal_description');
select throws_ok($$update occurrence_events set occurred_at=null where id=(select id from first_event)$$,'23502',null,'Required event occurred_at');
select throws_ok($$update occurrence_events set visible_to_resident=null where id=(select id from first_event)$$,'23502',null,'Required event visible_to_resident');
select throws_ok($$update occurrence_events set is_human_action=null where id=(select id from first_event)$$,'23502',null,'Required event is_human_action');
select throws_ok($$update occurrence_events set data=null where id=(select id from first_event)$$,'23502',null,'Required event data');
select throws_ok($$insert into occurrence_events(occurrence_id,event_type,author_type,internal_description) values ('62000000-0000-4000-8000-000000000002','registered','system','Synthetic event')$$,'23505',null,'A second registration event is rejected');
select lives_ok($$insert into occurrence_events(occurrence_id,event_type,author_type,internal_description) values ('62000000-0000-4000-8000-000000000002','responsible_changed','system','Synthetic event')$$,'All supported event types persist: responsible_changed');
select lives_ok($$insert into occurrence_events(occurrence_id,event_type,author_type,internal_description) values ('62000000-0000-4000-8000-000000000002','deadline_changed','system','Synthetic event')$$,'All supported event types persist: deadline_changed');
select lives_ok($$insert into occurrence_events(occurrence_id,event_type,author_type,internal_description) values ('62000000-0000-4000-8000-000000000002','manager_update','system','Synthetic event')$$,'All supported event types persist: manager_update');
select lives_ok($$insert into occurrence_events(occurrence_id,event_type,author_type,internal_description) values ('62000000-0000-4000-8000-000000000002','employee_message','system','Synthetic event')$$,'All supported event types persist: employee_message');
select lives_ok($$insert into occurrence_events(occurrence_id,event_type,author_type,internal_description) values ('62000000-0000-4000-8000-000000000002','completed','system','Synthetic event')$$,'All supported event types persist: completed');
select throws_ok($$update occurrence_attachments set event_id=-1 where event_id=(select id from first_event)$$,'23503',null,'Reject invalid attachment event_id');
select throws_ok($$update occurrence_attachments set storage_bucket=' ' where event_id=(select id from first_event)$$,'23514',null,'Reject invalid attachment storage_bucket');
select throws_ok($$update occurrence_attachments set storage_path=' ' where event_id=(select id from first_event)$$,'23514',null,'Reject invalid attachment storage_path');
select throws_ok($$update occurrence_attachments set file_name=' ' where event_id=(select id from first_event)$$,'23514',null,'Reject invalid attachment file_name');
select throws_ok($$update occurrence_attachments set content_type='invalid' where event_id=(select id from first_event)$$,'23514',null,'Reject invalid attachment content_type');
select throws_ok($$update occurrence_attachments set size_bytes=-1 where event_id=(select id from first_event)$$,'23514',null,'Reject invalid attachment size_bytes');
select throws_ok($$update occurrence_attachments set event_id=null where event_id=(select id from first_event)$$,'23502',null,'Required attachment event_id');
select throws_ok($$update occurrence_attachments set occurrence_id=null where event_id=(select id from first_event)$$,'23502',null,'Required attachment occurrence_id');
select throws_ok($$update occurrence_attachments set storage_bucket=null where event_id=(select id from first_event)$$,'23502',null,'Required attachment storage_bucket');
select throws_ok($$update occurrence_attachments set storage_path=null where event_id=(select id from first_event)$$,'23502',null,'Required attachment storage_path');
select throws_ok($$update occurrence_attachments set file_name=null where event_id=(select id from first_event)$$,'23502',null,'Required attachment file_name');
select throws_ok($$update occurrence_attachments set content_type=null where event_id=(select id from first_event)$$,'23502',null,'Required attachment content_type');
select throws_ok($$update occurrence_attachments set size_bytes=null where event_id=(select id from first_event)$$,'23502',null,'Required attachment size_bytes');
select throws_ok($$update occurrence_attachments set created_at=null where event_id=(select id from first_event)$$,'23502',null,'Required attachment created_at');
select throws_ok($$insert into occurrence_attachments(occurrence_id,event_id,storage_bucket,storage_path,file_name,content_type,size_bytes) select occurrence_id,event_id,storage_bucket,storage_path,file_name,content_type,size_bytes from occurrence_attachments where event_id=(select id from first_event)$$,'23505',null,'Duplicate storage reference rejected');
select lives_ok($$update occurrences set status='in_progress', due_at=clock_timestamp() - interval '1 day' where id='62000000-0000-4000-8000-000000000002'$$,'In-progress status persists without speculative required fields');
select ok((select due_at < now() and status <> 'completed' from occurrences where id='62000000-0000-4000-8000-000000000002'),'Overdue is derived from deadline and status');
select lives_ok($$update occurrences set status='delegated' where id='62000000-0000-4000-8000-000000000002'$$,'Delegated status persists');
select throws_ok($$update occurrences set status='completed', completed_at=registered_at - interval '1 second' where id='62000000-0000-4000-8000-000000000002'$$,'23514',null,'Completion cannot precede registration');
select lives_ok($$update occurrences set status='completed', completed_at=clock_timestamp() where id='62000000-0000-4000-8000-000000000002'$$,'Completed status persists with completion time');
select throws_ok($$update occurrences set suggested_priority='low', suggestion_source='ai', suggestion_reason='Later synthetic suggestion', suggestion_at=clock_timestamp(), final_priority='low' where id='62000000-0000-4000-8000-000000000001'$$,'42501','Original occurrence suggestion is immutable.','Later suggestion overwrite is rejected');
select is((select decided_suggested_priority from occurrences where id='62000000-0000-4000-8000-000000000001'),'urgent','Decision comparison preserves original suggestion');
select is((select extract(epoch from occurred_at-delegation_started_at)::bigint from occurrence_events where occurrence_id='62000000-0000-4000-8000-000000000001' and event_type='completed'),3600::bigint,'Completion duration is independent of current occurrence fields');
select * from finish();
rollback;
