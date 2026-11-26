begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
select ok(not prosecdef and provolatile='s' and pronargs=1 and proconfig=array['search_path=""'],'Detail uses stable invoker and fixed search path') from pg_proc where oid='public.occurrence_detail(uuid)'::regprocedure;
select ok(prosecdef and proconfig=array['search_path=""'],'Priority decision uses fixed definer search path') from pg_proc where oid='public.decide_occurrence_priority(uuid,text,text)'::regprocedure;
select ok(has_function_privilege('authenticated','public.occurrence_detail(uuid)','execute'),'Session role may read detail');
select ok(has_function_privilege('authenticated','public.decide_occurrence_priority(uuid,text,text)','execute'),'Session role may decide priority');
select ok(not has_function_privilege('anon','public.occurrence_detail(uuid)','execute'),'Anonymous role cannot read detail');
select ok(not has_function_privilege('anon','public.decide_occurrence_priority(uuid,text,text)','execute'),'Anonymous role cannot decide priority');
select ok(not has_function_privilege('service_role','public.occurrence_detail(uuid)','execute'),'Server credential is not a detail bypass');
select ok(not has_function_privilege('service_role','public.decide_occurrence_priority(uuid,text,text)','execute'),'Server credential is not a priority bypass');

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('7b000000-0000-4000-8000-000000000001','ori80-manager@example.invalid',now(),'{"full_name":"Synthetic ORI80 Manager","is_sindico":true}'),
('7b000000-0000-4000-8000-000000000002','ori80-other@example.invalid',now(),'{"full_name":"Synthetic ORI80 Other","is_sindico":true}'),
('7b000000-0000-4000-8000-000000000003','ori80-resident@example.invalid',now(),'{"full_name":"Synthetic ORI80 Resident","is_sindico":false}');
insert into auth.sessions(id,user_id) values
('7b000000-0000-4000-9000-000000000001','7b000000-0000-4000-8000-000000000001'),
('7b000000-0000-4000-9000-000000000002','7b000000-0000-4000-8000-000000000002'),
('7b000000-0000-4000-9000-000000000003','7b000000-0000-4000-8000-000000000003');
insert into public.condominiums(id,manager_id,name,address) values
('7b000000-0000-4000-8000-000000000010','7b000000-0000-4000-8000-000000000001','Synthetic ORI80 A','Synthetic address'),
('7b000000-0000-4000-8000-000000000011','7b000000-0000-4000-8000-000000000002','Synthetic ORI80 B','Synthetic address');
insert into public.occurrences(id,condominium_id,origin,channel,description,status,completed_at,suggested_priority,suggestion_source,suggestion_reason,suggestion_at,registered_at,reporter_name,reporter_phone,reporter_unit_or_role,location)
values
('7b000000-0000-4000-8000-000000000020','7b000000-0000-4000-8000-000000000010','public_form','web','Cheiro de gás no hall sintético','new',null,'urgent','rules','Menciona gás: risco à segurança.','2026-01-01 00:00Z','2026-01-01 00:00Z','Synthetic reporter','11900000000','Synthetic unit','Synthetic hall'),
('7b000000-0000-4000-8000-000000000021','7b000000-0000-4000-8000-000000000010','manager_panel','phone','Synthetic completed occurrence','completed','2026-01-02 00:00Z','normal','rules','Sem sinal de risco no relato.','2026-01-01 00:00Z','2026-01-01 00:00Z',null,null,null,null),
('7b000000-0000-4000-8000-000000000022','7b000000-0000-4000-8000-000000000011','manager_panel','phone','Synthetic other portfolio occurrence','new',null,'normal','rules','Sem sinal de risco no relato.','2026-01-01 00:00Z','2026-01-01 00:00Z',null,null,null,null);
insert into public.occurrence_events(occurrence_id,event_type,occurred_at,author_type,author_name,author_phone,author_role,internal_description,visible_to_resident,public_text)
values ('7b000000-0000-4000-8000-000000000020','registered','2026-01-01 00:00Z','reporter','Synthetic reporter','11900000000','Synthetic unit','Registrou a ocorrência pelo formulário. Unidade informada: Synthetic unit',true,'Registrou a ocorrência pelo formulário. Unidade informada: Synthetic unit');

set local role authenticated;
select throws_ok($$select public.occurrence_detail('7b000000-0000-4000-8000-000000000020')$$,'28000','Active confirmed session required.','Detail requires an active session');
select throws_ok($$select public.decide_occurrence_priority('7b000000-0000-4000-8000-000000000020','normal')$$,'28000','Active confirmed session required.','Decision requires an active session');
select set_config('request.jwt.claims','{"sub":"7b000000-0000-4000-8000-000000000003","session_id":"7b000000-0000-4000-9000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.occurrence_detail('7b000000-0000-4000-8000-000000000020')$$,'42501','Manager profile required.','Resident cannot read detail');
select set_config('request.jwt.claims','{"sub":"7b000000-0000-4000-8000-000000000002","session_id":"7b000000-0000-4000-9000-000000000002","role":"authenticated"}',true);
select ok(public.occurrence_detail('7b000000-0000-4000-8000-000000000020') is null,'Another portfolio detail is indistinguishable from missing');
select throws_ok($$select public.decide_occurrence_priority('7b000000-0000-4000-8000-000000000020','normal')$$,'42501','Occurrence unavailable.','Another portfolio cannot decide priority');
select set_config('request.jwt.claims','{"sub":"7b000000-0000-4000-8000-000000000001","session_id":"7b000000-0000-4000-9000-000000000001","role":"authenticated"}',true);

select is((public.occurrence_detail('7b000000-0000-4000-8000-000000000020')->>'number')::bigint,(select number from public.occurrences where id='7b000000-0000-4000-8000-000000000020'),'Detail exposes the occurrence number');
select is(public.occurrence_detail('7b000000-0000-4000-8000-000000000020')->>'trackingCode',(select tracking_code from public.occurrences where id='7b000000-0000-4000-8000-000000000020'),'Detail exposes the tracking code');
select ok(public.occurrence_detail('7b000000-0000-4000-8000-000000000020') ?& array['trackingCode','version','responsibleKind','responsibleName','responsibleEmployeeId','firstResponsibleAt','dueDate'], 'Detail preserves tracking and workflow fields together');
select is(public.occurrence_detail('7b000000-0000-4000-8000-000000000020')->'condominium'->>'name','Synthetic ORI80 A','Detail exposes the condominium');
select is(public.occurrence_detail('7b000000-0000-4000-8000-000000000020')->>'suggestedPriority','urgent','Detail exposes the original suggestion');
select is(public.occurrence_detail('7b000000-0000-4000-8000-000000000020')->>'suggestionPending','true','Pending suggestion is explicit');
select is(public.occurrence_detail('7b000000-0000-4000-8000-000000000020')->>'canDecidePriority','true','Open occurrence allows a decision');
select is(jsonb_array_length(public.occurrence_detail('7b000000-0000-4000-8000-000000000020')->'events'),1,'Detail exposes only real history');
select is(public.occurrence_detail('7b000000-0000-4000-8000-000000000020')->'events'->0->>'authorIsViewer','false','Reporter is not the viewer');
select is(public.occurrence_detail('7b000000-0000-4000-8000-000000000021')->>'canDecidePriority','false','Completed occurrence locks the decision');
select throws_ok($$select public.decide_occurrence_priority('7b000000-0000-4000-8000-000000000021','urgent')$$,'55000','Completed occurrence priority is locked.','Completed occurrence cannot change priority');

select is(public.decide_occurrence_priority('7b000000-0000-4000-8000-000000000020','urgent'),'{"finalPriority":null,"suggestionPending":true,"priorityChangeReason":null}'::jsonb,'Selecting the suggestion keeps the original state');
select ok((select final_priority is null and priority_decided_at is null and decided_priority is null from public.occurrences where id='7b000000-0000-4000-8000-000000000020'),'Unchanged suggestion records no decision');
select throws_ok($$select public.decide_occurrence_priority('7b000000-0000-4000-8000-000000000020','high')$$,'22023','Invalid final priority.','Invalid priority is rejected');
select throws_ok($$select public.decide_occurrence_priority('7b000000-0000-4000-8000-000000000020','normal','free_text')$$,'22023','Invalid priority change reason.','Invalid reason is rejected');

select is(public.decide_occurrence_priority('7b000000-0000-4000-8000-000000000020','normal','greater_risk'),'{"finalPriority":"normal","suggestionPending":false,"priorityChangeReason":"greater_risk"}'::jsonb,'Changing priority returns the final decision');
select ok((select final_priority='normal' and priority_decided_at is not null and decided_priority='normal' and decided_suggested_priority='urgent' and priority_change_reason='greater_risk' and suggested_priority='urgent' from public.occurrences where id='7b000000-0000-4000-8000-000000000020'),'Decision keeps the original suggestion and stores the final priority');
select is((select count(*) from public.occurrence_events where occurrence_id='7b000000-0000-4000-8000-000000000020'),1::bigint,'Priority changes do not add history rows');
select is(public.occurrence_detail('7b000000-0000-4000-8000-000000000020')->>'finalPriority','normal','Detail reflects the final priority');
select is(public.occurrence_detail('7b000000-0000-4000-8000-000000000020')->>'suggestionPending','false','Detail reflects the human decision');
select is(public.occurrence_detail('7b000000-0000-4000-8000-000000000020')->>'priorityChangeReason','greater_risk','Detail reflects the change reason');
select is(public.decide_occurrence_priority('7b000000-0000-4000-8000-000000000020','urgent','other'),'{"finalPriority":"urgent","suggestionPending":false,"priorityChangeReason":null}'::jsonb,'Returning to the suggestion clears the reason');
select ok((select final_priority='urgent' and decided_priority='urgent' and decided_suggested_priority='urgent' and priority_change_reason is null from public.occurrences where id='7b000000-0000-4000-8000-000000000020'),'Decision snapshot keeps the first suggested priority');

select public.append_occurrence_note('7b000000-0000-4000-8000-000000000020','Zelador olhou o portão. Motor queimado, pedi orçamento.');
select is(jsonb_array_length(public.occurrence_detail('7b000000-0000-4000-8000-000000000020')->'events'),2,'Manager update appears in history');
select is(public.occurrence_detail('7b000000-0000-4000-8000-000000000020')->'events'->0->>'type','manager_update','Newest history row comes first');
select is(public.occurrence_detail('7b000000-0000-4000-8000-000000000020')->'events'->0->>'authorName','Synthetic ORI80 Manager','History keeps the stored author name');
select is(public.occurrence_detail('7b000000-0000-4000-8000-000000000020')->'events'->0->>'authorIsViewer','true','Viewer manager is identified');
select is(public.occurrence_detail('7b000000-0000-4000-8000-000000000020')->'events'->0->>'text','Zelador olhou o portão. Motor queimado, pedi orçamento.','History keeps the update text');
select ok((select status='new' and final_priority='urgent' and priority_change_reason is null from public.occurrences where id='7b000000-0000-4000-8000-000000000020'),'Manager update changes neither status nor priority');

reset role;
delete from auth.sessions where id='7b000000-0000-4000-9000-000000000001';
set local role authenticated;
select throws_ok($$select public.occurrence_detail('7b000000-0000-4000-8000-000000000020')$$,'28000','Active confirmed session required.','Revoked session cannot read detail');
reset role;
select * from finish();
rollback;
