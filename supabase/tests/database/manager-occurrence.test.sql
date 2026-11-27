-- ORI-89: register_manager_occurrence (registro pelo síndico).
-- Cobre o caminho feliz (com e sem quem relatou), o evento 'registered' com o
-- síndico como autor, as rejeições de entrada/sugestão, o isolamento por
-- carteira e os grants.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Síndico A (dono do condomínio A) e síndico B (dono do condomínio B).
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values ('89000000-0000-4000-8000-000000000001','ori89-1@example.invalid',now(),'{"full_name":"Synthetic manager 89","phone":"11900000000","is_sindico":true}');
insert into auth.sessions(id,user_id) values ('89000000-0000-4000-9000-000000000001','89000000-0000-4000-8000-000000000001');
insert into condominiums(id,manager_id,name,address) values ('89000000-0000-4000-8000-000000000001','89000000-0000-4000-8000-000000000001','Synthetic ORI89 A','Synthetic address');
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values ('89000000-0000-4000-8000-000000000002','ori89-2@example.invalid',now(),'{"full_name":"Synthetic manager 89 B","phone":"11900000000","is_sindico":true}');
insert into auth.sessions(id,user_id) values ('89000000-0000-4000-9000-000000000002','89000000-0000-4000-8000-000000000002');
insert into condominiums(id,manager_id,name,address) values ('89000000-0000-4000-8000-000000000002','89000000-0000-4000-8000-000000000002','Synthetic ORI89 B','Synthetic address');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"89000000-0000-4000-8000-000000000001","session_id":"89000000-0000-4000-9000-000000000001","role":"authenticated"}',true);

-- Caminho feliz: com quem relatou (opcional, mas preenchido).
select set_config('ori89.with_reporter',(select occurrence_id::text from public.register_manager_occurrence('89000000-0000-4000-8000-000000000001'::uuid,'whatsapp','Vazamento na garagem','Garagem','Synthetic reporter','11900000000','Apto 101','normal','Sem sinal de risco no relato.','rules')),true);
-- Caminho feliz: sem quem relatou (tudo nulo).
select set_config('ori89.no_reporter',(select occurrence_id::text from public.register_manager_occurrence('89000000-0000-4000-8000-000000000001'::uuid,'phone','Barulho no hall','Hall',null,null,null,'normal','Sem sinal de risco no relato.','rules')),true);

-- Persistência da ocorrência (com quem relatou).
select ok((select origin='manager_panel' and channel='whatsapp' and created_by_profile_id='89000000-0000-4000-8000-000000000001' and reporter_name='Synthetic reporter' and reporter_phone='11900000000' and reporter_unit_or_role='Apto 101' and suggested_priority='normal' and suggestion_source='rules' and suggestion_reason='Sem sinal de risco no relato.' from occurrences where id=current_setting('ori89.with_reporter')::uuid),'Manager panel occurrence persists channel, author and suggestion');
-- Evento inicial com o síndico como autor.
select ok((select event_type='registered' and author_type='manager' and author_profile_id='89000000-0000-4000-8000-000000000001' and author_name='Synthetic manager 89' and author_role='manager' and not is_human_action and not visible_to_resident and public_text is null and data='{"channel":"whatsapp"}'::jsonb from occurrence_events where occurrence_id=current_setting('ori89.with_reporter')::uuid),'Registered event authored by the manager');
select is((select count(*) from occurrence_events where occurrence_id=current_setting('ori89.with_reporter')::uuid and event_type='registered'),1::bigint,'Exactly one registration event');
-- Quem relatou é opcional.
select ok((select origin='manager_panel' and channel='phone' and created_by_profile_id='89000000-0000-4000-8000-000000000001' and reporter_name is null and reporter_phone is null and reporter_unit_or_role is null from occurrences where id=current_setting('ori89.no_reporter')::uuid),'Reporter fields are optional');

-- Rejeições de entrada.
select throws_ok($$select public.register_manager_occurrence('89000000-0000-4000-8000-000000000001'::uuid,'web','Relato','Local',null,null,null,'normal','Sem sinal de risco no relato.','rules')$$,'22023','Invalid manager registration.','Rejects public channel web');
select throws_ok($$select public.register_manager_occurrence('89000000-0000-4000-8000-000000000001'::uuid,'whatsapp','   ','Local',null,null,null,'normal','Sem sinal de risco no relato.','rules')$$,'22023','Invalid manager registration.','Rejects blank description');
select throws_ok($$select public.register_manager_occurrence('89000000-0000-4000-8000-000000000001'::uuid,'whatsapp','Relato','   ',null,null,null,'normal','Sem sinal de risco no relato.','rules')$$,'22023','Invalid manager registration.','Rejects blank location');
select throws_ok($$select public.register_manager_occurrence('89000000-0000-4000-8000-000000000001'::uuid,'whatsapp','Relato','Local','Synthetic reporter','123','Apto 101','normal','Sem sinal de risco no relato.','rules')$$,'22023','Invalid manager registration.','Rejects invalid reporter phone');
select throws_ok($$select public.register_manager_occurrence('89000000-0000-4000-8000-000000000001'::uuid,'whatsapp','Relato','Local',repeat('x',201),null,null,'normal','Sem sinal de risco no relato.','rules')$$,'22023','Invalid manager registration.','Rejects reporter name length');
-- Rejeição de sugestão fora das regras.
select throws_ok($$select public.register_manager_occurrence('89000000-0000-4000-8000-000000000001'::uuid,'whatsapp','Relato','Local',null,null,null,'normal','Sem sinal de risco no relato.','ai')$$,'22023','Invalid rule suggestion.','Rejects non-rules suggestion source');
select throws_ok($$select public.register_manager_occurrence('89000000-0000-4000-8000-000000000001'::uuid,'whatsapp','Relato','Local',null,null,null,'urgent','Motivo errado','rules')$$,'22023','Invalid rule suggestion.','Rejects urgent reason format');

-- Isolamento por carteira: A não registra no condomínio de B.
select throws_ok($$select public.register_manager_occurrence('89000000-0000-4000-8000-000000000002'::uuid,'whatsapp','Relato','Local',null,null,null,'normal','Sem sinal de risco no relato.','rules')$$,'42501','Condominium unavailable.','Manager cannot register for another portfolio');
reset role;

-- B (autenticado) também não registra no condomínio de A.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"89000000-0000-4000-8000-000000000002","session_id":"89000000-0000-4000-9000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.register_manager_occurrence('89000000-0000-4000-8000-000000000001'::uuid,'whatsapp','Relato','Local',null,null,null,'normal','Sem sinal de risco no relato.','rules')$$,'42501','Condominium unavailable.','Other manager denied on A portfolio');
select is((select count(*) from occurrences),0::bigint,'Other manager sees none of A occurrences');
reset role;

-- Anônimo não executa.
set local role anon;
select throws_ok($$select public.register_manager_occurrence('89000000-0000-4000-8000-000000000001'::uuid,'whatsapp','Relato','Local',null,null,null,'normal','Sem sinal de risco no relato.','rules')$$,'42501',null,'Anonymous cannot execute manager registration');
reset role;

-- Grants: só authenticated executa.
select ok(has_function_privilege('authenticated','public.register_manager_occurrence(uuid,text,text,text,text,text,text,text,text,text)','EXECUTE'),'authenticated can execute');
select ok(not has_function_privilege('anon','public.register_manager_occurrence(uuid,text,text,text,text,text,text,text,text,text)','EXECUTE'),'anon cannot execute');
select ok(not has_function_privilege('service_role','public.register_manager_occurrence(uuid,text,text,text,text,text,text,text,text,text)','EXECUTE'),'service_role cannot execute');
-- SECURITY DEFINER com search_path fixo.
select ok(prosecdef and proconfig=array['search_path=""'],'Manager RPC is SECURITY DEFINER with fixed search_path') from pg_proc where oid='public.register_manager_occurrence(uuid,text,text,text,text,text,text,text,text,text)'::regprocedure;

select * from finish();
rollback;
