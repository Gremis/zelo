begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

select is((select count(*) from supabase_migrations.schema_migrations),37::bigint,'Canonical ledger has exactly 37 unique migrations');
select ok(not exists(select 1 from supabase_migrations.schema_migrations where version in ('20261120120000','20261120130000')),'Alternative employee migration identities are absent');
select is((select name from supabase_migrations.schema_migrations where version='20261124120000'),'create_funcionarios','Employee version has one meaning');
select is((select name from supabase_migrations.schema_migrations where version='20261124121000'),'public_registration_attempts','Registration has its own version');
select is((select name from supabase_migrations.schema_migrations where version='20261124160000'),'private_occurrence_uploads','Uploads retain their unique version');
select is((select name from supabase_migrations.schema_migrations where version='20261126130000'),'occurrence_tracking_lookup','Tracking lookup is applied once at its canonical version');
select ok(to_regprocedure('public.occurrence_tracking(text)') is not null,'Resident lookup exists');
select ok(to_regprocedure('public.employee_task(text)') is not null,'Employee lookup exists');
select ok(to_regprocedure('public.create_funcionario(uuid,text,text,text,text)') is not null,'Employee registration RPC exists');
select ok(position('trackingCode' in pg_get_functiondef('public.occurrence_detail(uuid)'::regprocedure))>0,'Final detail contains resident tracking');
select ok(position('responsibleKind' in pg_get_functiondef('public.occurrence_detail(uuid)'::regprocedure))>0,'Final detail contains workflow fields');
select ok(position('attachments' in pg_get_functiondef('public.occurrence_detail(uuid)'::regprocedure))>0,'Final detail contains attachments');
select ok(not has_function_privilege('authenticated','public.delegate_occurrence(uuid,uuid,bigint,jsonb,uuid,uuid,text)','execute'),'Browser cannot supply trusted task origin');
select ok(has_function_privilege('service_role','public.delegate_occurrence(uuid,uuid,bigint,jsonb,uuid,uuid,text)','execute'),'Only the server may delegate with configured origin');
select is(public.employee_task('invalid'),null,'Invalid task code remains generic');

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
values('a1040000-0000-4000-8000-000000000100','migration-contract@example.invalid',now(),'{"is_sindico":true,"full_name":"Synthetic contract manager"}');
insert into auth.sessions(id,user_id,created_at,updated_at)
values('a1040000-0000-4000-8000-000000000101','a1040000-0000-4000-8000-000000000100',now(),now());
insert into public.condominiums(id,manager_id,name,address)
values('a1040000-0000-4000-8000-000000000102','a1040000-0000-4000-8000-000000000100','Synthetic contract condominium','Synthetic address');
insert into public.funcionarios(id,sindico_id,condominio_id,funcao_id,nome,celular)
select 'a1040000-0000-4000-8000-000000000103','a1040000-0000-4000-8000-000000000100','a1040000-0000-4000-8000-000000000102',id,'Synthetic employee','11900000009'
from public.funcoes where sindico_id='a1040000-0000-4000-8000-000000000100' and nome='Zelador';
insert into public.occurrences(id,condominium_id,origin,channel,description,reporter_name,reporter_phone,reporter_unit_or_role)
values('a1040000-0000-4000-8000-000000000104','a1040000-0000-4000-8000-000000000102','public_form','web','Synthetic contract report','Synthetic reporter','11900000001','101');

create temporary table migration_receipt(value jsonb);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into migration_receipt select public.delegate_occurrence(
'a1040000-0000-4000-8000-000000000104','a1040000-0000-4000-8000-000000000105',0,
'{"employeeId":"a1040000-0000-4000-8000-000000000103","message":"Synthetic prefix"}',
'a1040000-0000-4000-8000-000000000100','a1040000-0000-4000-8000-000000000101','http://127.0.0.1:3100');
select is((select value->'delegation'->>'url' from migration_receipt),'http://127.0.0.1:3100/t/'||(select value->'delegation'->>'code' from migration_receipt),'Fresh delegation returns absolute configured URL');
select is(public.delegate_occurrence(
'a1040000-0000-4000-8000-000000000104','a1040000-0000-4000-8000-000000000105',0,
'{"employeeId":"a1040000-0000-4000-8000-000000000103","message":"Synthetic prefix"}',
'a1040000-0000-4000-8000-000000000100','a1040000-0000-4000-8000-000000000101','https://tasks.example.invalid'),(select value from migration_receipt),'Retry after origin changes preserves the entire receipt');
select ok(not(public.employee_task((select value->'delegation'->>'code' from migration_receipt)) ?| array['reporterPhone','trackingCode','events']),'Task payload excludes private fields');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"a1040000-0000-4000-8000-000000000100","session_id":"a1040000-0000-4000-8000-000000000101"}',true);
select is(public.occurrence_command('a1040000-0000-4000-8000-000000000104','a1040000-0000-4000-8000-000000000106',(select version from public.occurrences where id='a1040000-0000-4000-8000-000000000104'),'complete','{}')->>'status','completed','Completion command works after the complete chain');
select is(public.reopen_occurrence('a1040000-0000-4000-8000-000000000104','a1040000-0000-4000-8000-000000000107',(select version from public.occurrences where id='a1040000-0000-4000-8000-000000000104'))->>'status','new','Reopening command works after the complete chain');
select is(public.employee_task((select value->'delegation'->>'code' from migration_receipt))->>'status','completed','Old task stays completed after reopening');

select * from finish();
rollback;
