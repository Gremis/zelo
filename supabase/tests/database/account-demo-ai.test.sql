begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data) values
('ad000000-0000-4000-8000-000000000001', 'synthetic-demo-ai@example.invalid', now(), '{"full_name":"Synthetic manager","is_sindico":true}');
insert into auth.sessions(id, user_id) values
('ad000000-0000-4000-9000-000000000001', 'ad000000-0000-4000-8000-000000000001');

set local role service_role;
select public.prepare_account_demo('ad000000-0000-4000-8000-000000000001', '[{"key":"a","name":"Synthetic A","address":"Synthetic address A"},{"key":"b","name":"Synthetic B","address":"Synthetic address B"}]');
reset role;
select set_config('test.registration', jsonb_build_object(
  'type', 'registered',
  'condominiumSlug', (select c.slug from public.condominiums c join private.account_demo_condominiums m on m.condominium_id=c.id where m.manager_id='ad000000-0000-4000-8000-000000000001' and m.fixture_key='a'),
  'reporterName', 'Synthetic reporter', 'reporterPhone', '11900000000',
  'reporterUnitOrRole', 'Synthetic unit', 'description', 'Synthetic lamp report', 'location', 'Synthetic hall',
  'suggestedPriority', 'normal', 'suggestionReason', 'Sem sinal de risco no relato.', 'suggestionSource', 'rules'
)::text, true);

select set_config('test.slug_b', (select c.slug from public.condominiums c join private.account_demo_condominiums m on m.condominium_id=c.id where m.manager_id='ad000000-0000-4000-8000-000000000001' and m.fixture_key='b'), true);
set local role service_role;
select set_config('test.legacy_id', (select occurrence_id::text from public.register_account_demo('ad000000-0000-4000-8000-000000000001', 'normal-old', current_setting('test.registration')::jsonb)), true);
select lives_ok($$select public.register_account_demo('ad000000-0000-4000-8000-000000000001', 'normal-old', current_setting('test.registration')::jsonb || '{"category":null,"aiFailureReason":"erro"}')$$, 'Legacy examples accept new fallback fields');
select lives_ok($$select public.register_account_demo('ad000000-0000-4000-8000-000000000001', 'normal-old', current_setting('test.registration')::jsonb || '{"suggestedPriority":"low","suggestionReason":"Synthetic AI suggestion","suggestionSource":"ai","category":"Iluminação","aiFailureReason":null}')$$, 'Legacy examples accept changed AI suggestions');
select is((select occurrence_id::text from public.register_account_demo('ad000000-0000-4000-8000-000000000001', 'normal-old', current_setting('test.registration')::jsonb)), current_setting('test.legacy_id'), 'Retries preserve the occurrence ID');
select throws_ok($$select public.register_account_demo('ad000000-0000-4000-8000-000000000001', 'normal-old', current_setting('test.registration')::jsonb || '{"description":"Different report"}')$$, '22023', 'Demo version mismatch.', 'Changed report content is still rejected');
select throws_ok($$select public.register_account_demo('ad000000-0000-4000-8000-000000000001', 'normal-old', current_setting('test.registration')::jsonb || '{"unexpected":true}')$$, '22023', 'Demo version mismatch.', 'Unexpected payload changes are still rejected');
select set_config('test.ai_id', (select occurrence_id::text from public.register_account_demo('ad000000-0000-4000-8000-000000000001', 'urgent-new', current_setting('test.registration')::jsonb || '{"suggestedPriority":"urgent","suggestionReason":"Synthetic AI risk","suggestionSource":"ai","category":"Elétrica","aiFailureReason":null}')), true);
select set_config('test.fallback_id', (select occurrence_id::text from public.register_account_demo('ad000000-0000-4000-8000-000000000001', 'normal-new', current_setting('test.registration')::jsonb || jsonb_build_object('condominiumSlug', current_setting('test.slug_b'), 'category', null, 'aiFailureReason', 'timeout'))), true);
reset role;
select ok((select suggested_priority='normal' and suggestion_source='rules' and category is null from public.occurrences where id=current_setting('test.legacy_id')::uuid), 'Retries preserve the original stored suggestion');
select ok((select suggested_priority='urgent' and suggestion_source='ai' and category='Elétrica' and ai_failure_reason is null from public.occurrences where id=current_setting('test.ai_id')::uuid), 'New examples persist AI metadata');
select ok((select suggestion_source='rules' and ai_failure_reason='timeout' from public.occurrences where id=current_setting('test.fallback_id')::uuid), 'New examples persist the AI failure reason');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"ad000000-0000-4000-8000-000000000001","session_id":"ad000000-0000-4000-9000-000000000001","role":"authenticated"}', true);
select is(public.occurrence_detail(current_setting('test.ai_id')::uuid)->>'effectivePriority', 'urgent', 'AI suggestion applies before a manual decision');
select is(public.decide_occurrence_priority(current_setting('test.ai_id')::uuid, 'low', 'lower_risk')->>'finalPriority', 'low', 'Manager can override an AI suggestion');
select is(public.occurrence_detail(current_setting('test.ai_id')::uuid)->>'effectivePriority', 'low', 'Manual priority takes precedence over AI');
reset role;
set local role service_role;
select lives_ok($$select public.register_account_demo('ad000000-0000-4000-8000-000000000001', 'urgent-new', current_setting('test.registration')::jsonb || '{"category":null,"aiFailureReason":"timeout"}')$$, 'Preparation resumes after a manual decision and changed AI availability');
reset role;
set local role authenticated;
select is(public.occurrence_detail(current_setting('test.ai_id')::uuid)->>'effectivePriority', 'low', 'Preparation preserves the manual priority');
select is(public.occurrence_detail(current_setting('test.ai_id')::uuid)->>'suggestedPriority', 'urgent', 'Original AI suggestion remains available');
select is(public.occurrence_detail(current_setting('test.ai_id')::uuid)->>'priorityChangeReason', 'lower_risk', 'Preparation preserves the manual change reason');
select is(public.portfolio_occurrence_queue()->'columns'->'new'->'items'->0->>'id', current_setting('test.legacy_id'), 'Queue ordering uses manual priority ahead of the AI suggestion');
reset role;
select is((select count(*) from private.account_demo_occurrences where manager_id='ad000000-0000-4000-8000-000000000001'), 3::bigint, 'Preparation does not duplicate examples');
select is((select count(*) from public.occurrence_events e join private.account_demo_occurrences m on m.occurrence_id=e.occurrence_id where m.manager_id='ad000000-0000-4000-8000-000000000001'), 3::bigint, 'Preparation does not duplicate history');
select ok(not has_function_privilege('anon', 'public.register_account_demo(uuid,text,jsonb)', 'execute'), 'Anonymous callers cannot prepare examples');
select ok(not has_function_privilege('authenticated', 'public.register_account_demo(uuid,text,jsonb)', 'execute'), 'Browser sessions cannot call the privileged preparation function');
select * from finish();
rollback;
