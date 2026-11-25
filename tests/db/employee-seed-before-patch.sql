insert into public.funcoes(sindico_id,nome)
values
('a2050000-0000-4000-8000-000000000001','Synthetic custom role'),
('a2050000-0000-4000-8000-000000000001','zELador')
on conflict(sindico_id,lower(nome)) do nothing;

create table private.employee_seed_compatibility as
select p.oid as function_id,p.proowner as function_owner,
  (select jsonb_agg(to_jsonb(f) order by id) from public.funcoes f) as roles_before,
  null::jsonb as roles_after,
  (select jsonb_agg(jsonb_build_array(c.relname,c.relacl,a.attname,a.attacl) order by c.relname,a.attnum)
   from pg_class c join pg_namespace n on n.oid=c.relnamespace
   join pg_attribute a on a.attrelid=c.oid and a.attnum>0
   where n.nspname='public' and c.relname in ('funcoes','funcionarios')) as grants_before
from pg_proc p where p.oid='public.seed_funcoes_padrao()'::regprocedure;
