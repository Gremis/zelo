begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

select is((select count(*) from public.funcoes where sindico_id='a1040000-0000-4000-8000-000000000001'),3::bigint,'Backfill reaches managers that existed before employee tables');
select is((select count(*) from public.funcoes where sindico_id='a2050000-0000-4000-8000-000000000001' and lower(nome) in ('zelador','porteiro','auxiliar de limpeza')),3::bigint,'Default roles are unique even with existing case variants');
select is((select count(*) from public.funcoes where sindico_id='a2050000-0000-4000-8000-000000000001' and nome='Synthetic custom role'),1::bigint,'Custom roles are preserved');
select ok(not exists(select 1 from private.employee_seed_compatibility s,jsonb_array_elements(s.roles_before) old where not exists(select 1 from public.funcoes f where to_jsonb(f)=old)),'Existing role IDs, names and timestamps are preserved');
select is((select jsonb_agg(to_jsonb(f) order by id) from public.funcoes f),(select roles_after from private.employee_seed_compatibility),'Reapplying the patch changes no seeded rows');
select is((select count(*) from pg_trigger where tgrelid='public.profiles'::regclass and tgname='on_profile_sindico_seed_funcoes' and not tgisinternal),1::bigint,'Exactly one activation trigger exists');
select is((select count(*) from pg_trigger where tgrelid='public.profiles'::regclass and tgname='on_profile_created_seed_funcoes' and not tgisinternal),1::bigint,'Exactly one creation trigger remains');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='seed_funcoes_padrao'),1::bigint,'No seed function overload or duplicate is introduced');
select is('public.seed_funcoes_padrao()'::regprocedure::oid,(select function_id from private.employee_seed_compatibility),'Existing seed function identity is preserved');
select is((select proowner from pg_proc where oid='public.seed_funcoes_padrao()'::regprocedure),(select function_owner from private.employee_seed_compatibility),'Seed function ownership is preserved');
select ok(prosecdef and proconfig=array['search_path=""'],'Seed function retains definer execution and a fixed search path') from pg_proc where oid='public.seed_funcoes_padrao()'::regprocedure;
select ok(not has_function_privilege(r,'public.seed_funcoes_padrao()','execute'),'Seed function cannot be called directly by '||r) from (values('anon'),('authenticated'),('service_role')) roles(r);
select is((select jsonb_agg(jsonb_build_array(c.relname,c.relacl,a.attname,a.attacl) order by c.relname,a.attnum)
  from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum>0
  where n.nspname='public' and c.relname in ('funcoes','funcionarios')),(select grants_before from private.employee_seed_compatibility),'Table and column permissions are unchanged');

update public.profiles set is_sindico=true where id='a2050000-0000-4000-8000-000000000002';
select is((select count(*) from public.funcoes where sindico_id='a2050000-0000-4000-8000-000000000002'),3::bigint,'Activating an existing manager seeds the defaults');
create temporary table activation_roles as select jsonb_agg(to_jsonb(f) order by id) as data from public.funcoes f where sindico_id='a2050000-0000-4000-8000-000000000002';
update public.profiles set is_sindico=false where id='a2050000-0000-4000-8000-000000000002';
update public.profiles set is_sindico=true where id='a2050000-0000-4000-8000-000000000002';
select is((select jsonb_agg(to_jsonb(f) order by id) from public.funcoes f where sindico_id='a2050000-0000-4000-8000-000000000002'),(select data from activation_roles),'Reactivation does not duplicate or rewrite roles');
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
values('a2050000-0000-4000-8000-000000000003','seed-new-manager@example.invalid',now(),'{"is_sindico":true,"full_name":"Synthetic new manager"}');
select is((select count(*) from public.funcoes where sindico_id='a2050000-0000-4000-8000-000000000003'),3::bigint,'The creation trigger still seeds new managers');
select * from finish();
rollback;
