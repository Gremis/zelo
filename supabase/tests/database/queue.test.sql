begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
select ok(not prosecdef and provolatile='s' and pronargs=0 and proconfig=array['search_path=""'],'Queue uses stable parameterless invoker and fixed search path') from pg_proc where oid='public.portfolio_occurrence_queue()'::regprocedure;
select ok(has_function_privilege('authenticated','public.portfolio_occurrence_queue()','execute'),'Session role may call queue');
select ok(not has_function_privilege('anon','public.portfolio_occurrence_queue()','execute'),'Anonymous role cannot call queue');
select ok(not has_function_privilege('service_role','public.portfolio_occurrence_queue()','execute'),'Server credential is not a queue bypass');
select ok(not has_table_privilege('authenticated','public.occurrences','insert'),'Queue adds no occurrence write privilege');
set local role authenticated;
select throws_ok($$select public.portfolio_occurrence_queue()$$,'28000','Active confirmed session required.','Missing session is denied');
reset role;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('75000000-0000-4000-8000-000000000001','ori75-manager@example.invalid',now(),'{"is_sindico":true}'),
('75000000-0000-4000-8000-000000000002','ori75-resident@example.invalid',now(),'{"is_sindico":false}');
insert into auth.sessions(id,user_id) values
('75000000-0000-4000-9000-000000000001','75000000-0000-4000-8000-000000000001'),
('75000000-0000-4000-9000-000000000002','75000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"75000000-0000-4000-8000-000000000001","session_id":"75000000-0000-4000-9000-000000000001","role":"authenticated"}',true);
select is(public.portfolio_occurrence_queue()->'openByPriority','{"urgent":0,"normal":0,"low":0,"unclassified":0}'::jsonb,'Empty manager portfolio has zero open counts');
select is((public.portfolio_occurrence_queue()->'columns'->'completed'->>'count')::integer,0,'Empty completed column count');
select is(public.portfolio_occurrence_queue()->'columns'->'new'->'items','[]'::jsonb,'Empty new column items');
select throws_ok($$select public.portfolio_occurrence_queue(manager_id=>'75000000-0000-4000-8000-000000000002'::uuid)$$,'42883',null,'Queue cannot accept a selected manager');
reset role;
insert into public.condominiums(id,manager_id,name,address) values
('75000000-0000-4000-8000-000000000010','75000000-0000-4000-8000-000000000001','Synthetic queue ordering','Synthetic address');
insert into public.occurrences(condominium_id,origin,channel,description,status,suggested_priority,suggestion_source,suggestion_reason,suggestion_at,registered_at)
select '75000000-0000-4000-8000-000000000010','manager_panel','phone',d.label,s.status,d.priority,
case when d.priority is not null then 'rules' end,case when d.priority is not null then 'Synthetic persisted reason' end,
case when d.priority is not null then '2026-01-01'::timestamptz end,d.registered_at
from (values ('new'),('in_progress'),('delegated')) s(status)
cross join (values
(1,'urgent_recent','urgent','2026-01-05'::timestamptz),
(2,'normal_old','normal','2026-01-01'::timestamptz),
(3,'urgent_old','urgent','2026-01-02'::timestamptz),
(4,'urgent_tie_first','urgent','2026-01-03'::timestamptz),
(5,'urgent_tie_second','urgent','2026-01-03'::timestamptz),
(6,'unclassified',null,'2026-01-01'::timestamptz)
) d(position,label,priority,registered_at)
order by s.status,d.position;
insert into public.occurrences(condominium_id,origin,channel,description,status,registered_at,completed_at) values
('75000000-0000-4000-8000-000000000010','manager_panel','phone','completed_old','completed','2026-01-01','2026-01-10'),
('75000000-0000-4000-8000-000000000010','manager_panel','phone','completed_tie_first','completed','2026-01-01','2026-01-20'),
('75000000-0000-4000-8000-000000000010','manager_panel','phone','completed_tie_second','completed','2026-01-01','2026-01-20');
select throws_ok($$insert into public.occurrences(condominium_id,origin,channel,description,status) values ('75000000-0000-4000-8000-000000000010','manager_panel','phone','Synthetic missing completion date','completed')$$,'23514',null,'Current model rejects completed rows without a completion date');
set local role authenticated;
select is((select jsonb_agg(item->>'description' order by position) from jsonb_array_elements(public.portfolio_occurrence_queue()->'columns'->'new'->'items') with ordinality as rows(item,position)),'["urgent_old","urgent_tie_first","urgent_tie_second","urgent_recent","normal_old","unclassified"]'::jsonb,'new uses priority age number ordering and puts unclassified last');
select is((select jsonb_agg(item->>'description' order by position) from jsonb_array_elements(public.portfolio_occurrence_queue()->'columns'->'in_progress'->'items') with ordinality as rows(item,position)),'["urgent_old","urgent_tie_first","urgent_tie_second","urgent_recent","normal_old","unclassified"]'::jsonb,'in_progress uses priority age number ordering and puts unclassified last');
select is((select jsonb_agg(item->>'description' order by position) from jsonb_array_elements(public.portfolio_occurrence_queue()->'columns'->'delegated'->'items') with ordinality as rows(item,position)),'["urgent_old","urgent_tie_first","urgent_tie_second","urgent_recent","normal_old","unclassified"]'::jsonb,'delegated uses priority age number ordering and puts unclassified last');
select is((select jsonb_agg(item->>'description' order by position) from jsonb_array_elements(public.portfolio_occurrence_queue()->'columns'->'completed'->'items') with ordinality as rows(item,position)),'["completed_tie_first","completed_tie_second","completed_old"]'::jsonb,'Completed uses newest completion and stable number ties');
select set_config('request.jwt.claims','{"sub":"75000000-0000-4000-8000-000000000002","session_id":"75000000-0000-4000-9000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.portfolio_occurrence_queue()$$,'42501','Manager profile required.','Confirmed resident is denied');
reset role;
delete from auth.sessions where user_id='75000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"75000000-0000-4000-8000-000000000001","session_id":"75000000-0000-4000-9000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.portfolio_occurrence_queue()$$,'28000','Active confirmed session required.','Revoked session is denied');
reset role;
select * from finish();
rollback;
