begin;

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
values
('a1040000-0000-4000-8000-000000000001','migration-manager@example.invalid',now(),'{"full_name":"Synthetic migration manager","is_sindico":true}'),
('a1040000-0000-4000-8000-000000000002','migration-resident@example.invalid',now(),'{"full_name":"Synthetic migration resident","is_sindico":false,"is_morador":true}');

insert into public.condominiums(id,manager_id,name,address)
values('a1040000-0000-4000-8000-000000000010','a1040000-0000-4000-8000-000000000001','Synthetic migration condominium','Synthetic address');

insert into public.occurrences(id,condominium_id,origin,channel,description,status,reporter_name,reporter_phone,reporter_unit_or_role,location,suggested_priority,suggestion_source,suggestion_at,suggestion_reason,registered_at,completed_at,responsible_name,due_at)
values
('a1040000-0000-4000-8000-000000000020','a1040000-0000-4000-8000-000000000010','public_form','web','Synthetic new report','new','Synthetic reporter','11900000001','101','Synthetic hall','normal','rules',now(),'Synthetic rule','2026-11-20 10:00Z',null,null,null),
('a1040000-0000-4000-8000-000000000021','a1040000-0000-4000-8000-000000000010','manager_panel','web','Synthetic ongoing report','in_progress',null,null,null,'Synthetic garage','normal','rules',now(),'Synthetic rule','2026-11-20 11:00Z',null,'Synthetic provider','2026-12-10 12:00Z'),
('a1040000-0000-4000-8000-000000000022','a1040000-0000-4000-8000-000000000010','manager_panel','phone','Synthetic completed report','completed','Synthetic reporter',null,'202',null,null,null,null,null,'2026-11-20 12:00Z','2026-11-21 12:00Z','Synthetic provider',null);

insert into public.occurrence_events(occurrence_id,event_type,author_type,author_name,internal_description,occurred_at)
values
('a1040000-0000-4000-8000-000000000020','registered','reporter','Synthetic reporter','Synthetic registration','2026-11-20 10:00Z'),
('a1040000-0000-4000-8000-000000000021','manager_update','manager','Synthetic manager','Synthetic private note','2026-11-20 12:00Z'),
('a1040000-0000-4000-8000-000000000022','completed','manager','Synthetic manager','Synthetic completion','2026-11-21 12:00Z');

create table private.migration_upgrade_snapshot(kind text primary key,rows jsonb not null);
insert into private.migration_upgrade_snapshot values
('occurrences',(select jsonb_agg(to_jsonb(o) order by id) from public.occurrences o)),
('occurrence_events',(select jsonb_agg(to_jsonb(e) order by id) from public.occurrence_events e)),
('profiles',(select jsonb_agg(to_jsonb(p) order by id) from public.profiles p)),
('condominiums',(select jsonb_agg(to_jsonb(c) order by id) from public.condominiums c));

commit;
