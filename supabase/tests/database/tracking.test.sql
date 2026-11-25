begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select ok(prosecdef and provolatile = 's' and pronargs = 1 and proconfig = array['search_path=""'], 'Tracking lookup uses stable definer and fixed search path') from pg_proc where oid = 'public.occurrence_tracking(text)'::regprocedure;
select ok(has_function_privilege('anon', 'public.occurrence_tracking(text)', 'execute'), 'Anonymous role may use a tracking link');
select ok(has_function_privilege('authenticated', 'public.occurrence_tracking(text)', 'execute'), 'Session role may use a tracking link');
select ok(not has_function_privilege('service_role', 'public.occurrence_tracking(text)', 'execute'), 'Server credential is not a tracking bypass');

insert into auth.users(id, email) values ('7c000000-0000-4000-8000-000000000001', 'ori65@example.invalid');
insert into public.condominiums(id, manager_id, name, address) values
('7c000000-0000-4000-8000-000000000010', '7c000000-0000-4000-8000-000000000001', 'Synthetic ORI65', 'Synthetic address');
insert into public.occurrences(id, condominium_id, origin, channel, description, status, completed_at, registered_at, reporter_name, reporter_phone, reporter_unit_or_role, location, tracking_code) values
('7c000000-0000-4000-8000-000000000020', '7c000000-0000-4000-8000-000000000010', 'public_form', 'web', 'Synthetic open report', 'new', null, '2026-11-20 10:00Z', 'Synthetic Reporter', '11900000000', 'Synthetic unit 101', 'Synthetic garage', repeat('a', 64)),
('7c000000-0000-4000-8000-000000000021', '7c000000-0000-4000-8000-000000000010', 'public_form', 'web', 'Synthetic completed report', 'in_progress', null, '2026-11-21 10:00Z', 'Synthetic Reporter Two', '11900000001', 'Synthetic unit 202', 'Synthetic hall', repeat('b', 64));

insert into public.occurrence_events(occurrence_id, event_type, occurred_at, author_type, author_name, author_phone, internal_description, due_at)
values
('7c000000-0000-4000-8000-000000000020', 'registered', '2026-11-20 10:00Z', 'reporter', 'Synthetic Reporter', '11900000000', 'Registrou a ocorrência pelo formulário. Celular confidencial 11900000000', null),
('7c000000-0000-4000-8000-000000000020', 'manager_update', '2026-11-20 11:00Z', 'manager', 'Synthetic Manager', null, 'Nota interna do síndico', null),
('7c000000-0000-4000-8000-000000000020', 'responsible_changed', '2026-11-20 12:00Z', 'manager', 'Synthetic Manager', null, 'Delegado a Cláudio Reis', null),
('7c000000-0000-4000-8000-000000000020', 'responsible_changed', '2026-11-20 13:00Z', 'manager', 'Synthetic Manager', null, 'Trocou o responsável para Maria Silva', null),
('7c000000-0000-4000-8000-000000000020', 'deadline_changed', '2026-11-20 14:00Z', 'manager', 'Synthetic Manager', null, 'Previsão de atendimento', '2026-12-20 12:00Z'),
('7c000000-0000-4000-8000-000000000020', 'deadline_changed', '2026-11-20 15:00Z', 'manager', 'Synthetic Manager', null, 'Previsão removida pelo síndico', null),
('7c000000-0000-4000-8000-000000000021', 'registered', '2026-11-21 10:00Z', 'reporter', 'Synthetic Reporter Two', '11900000001', 'Registro particular da segunda ocorrência', null),
('7c000000-0000-4000-8000-000000000021', 'completed', '2026-11-21 18:00Z', 'manager', 'Synthetic Manager', null, 'Concluída com anexo privado', null);

update public.occurrences set status='completed', completed_at='2026-11-21 18:00Z' where id='7c000000-0000-4000-8000-000000000021';

insert into public.occurrence_attachments(occurrence_id, event_id, storage_bucket, storage_path, file_name, content_type, size_bytes)
select '7c000000-0000-4000-8000-000000000020', id, 'occurrence-evidence', 'tracking/private-file.pdf', 'private-file.pdf', 'application/pdf', 120
from public.occurrence_events where occurrence_id = '7c000000-0000-4000-8000-000000000020' and event_type = 'registered';

select is((public.occurrence_tracking(repeat('a', 64))->>'condominiumName'), 'Synthetic ORI65', 'Tracking exposes the condominium name');
select is((public.occurrence_tracking(repeat('a', 64))->>'number')::bigint, (select number from public.occurrences where id = '7c000000-0000-4000-8000-000000000020'), 'Tracking exposes the occurrence number');
select is((public.occurrence_tracking(repeat('a', 64))->>'description'), 'Synthetic open report', 'Tracking exposes the report');
select is((public.occurrence_tracking(repeat('a', 64))->>'unit'), 'Synthetic unit 101', 'Tracking exposes the informed unit');
select is((public.occurrence_tracking(repeat('a', 64))->>'location'), 'Synthetic garage', 'Tracking exposes the location');
select is(public.occurrence_tracking(repeat('a', 64))->'situation'->>'step', 'received', 'New occurrence is received by the manager');
select is(public.occurrence_tracking(repeat('a', 64))->'situation'->>'label', 'Recebida pelo síndico', 'Situation arrives translated');
select is(jsonb_array_length(public.occurrence_tracking(repeat('a', 64))->'updates'), 4, 'Only authorized tracking events are listed');
select is(public.occurrence_tracking(repeat('a', 64))->'updates'->0->>'text', 'A previsão de atendimento foi retirada.', 'Updates are listed newest first');
select is(public.occurrence_tracking(repeat('a', 64))->'updates'->1->>'text', 'Atendimento previsto para 20/12.', 'Deadline is shown as day and month');
select is((select count(*) from jsonb_array_elements(public.occurrence_tracking(repeat('a', 64))->'updates') e where e->>'text' = 'O síndico está cuidando da ocorrência.'), 1::bigint, 'Only the first responsibility event is exposed');
select is(public.occurrence_tracking(repeat('a', 64))->'updates'->3->>'text', 'Ocorrência registrada. O síndico já recebeu.', 'Registration text is written for the resident');

select ok(not (public.occurrence_tracking(repeat('a', 64)) ?| array['reporterName', 'reporterPhone', 'trackingCode', 'attachments', 'responsibleName']), 'Public payload has no reporter, code or attachment fields');
select is(position('11900000000' in public.occurrence_tracking(repeat('a', 64))::text), 0, 'Reporter phone never appears');
select is(position('Nota interna do síndico' in public.occurrence_tracking(repeat('a', 64))::text), 0, 'Internal notes never appear');
select is(position('Cláudio Reis' in public.occurrence_tracking(repeat('a', 64))::text), 0, 'Assignee names never appear');
select is(position('Maria Silva' in public.occurrence_tracking(repeat('a', 64))::text), 0, 'Later assignee names never appear');
select is(position('private-file.pdf' in public.occurrence_tracking(repeat('a', 64))::text), 0, 'Attachments never appear');
select is(position('Synthetic completed report' in public.occurrence_tracking(repeat('a', 64))::text), 0, 'Another occurrence is never included');

select is(public.occurrence_tracking(repeat('b', 64))->'situation'->>'label', 'Concluída', 'Completed occurrence is translated');
select is(public.occurrence_tracking(repeat('b', 64))->'updates'->0->>'text', 'Ocorrência concluída.', 'Completion update is exposed');
select is(public.occurrence_tracking(repeat('b', 64))->>'number'::text, (select number::text from public.occurrences where id = '7c000000-0000-4000-8000-000000000021'), 'Each code resolves only its own occurrence');

select is(public.occurrence_tracking(repeat('c', 64)), null, 'Unknown tracking code is not found');
select is(public.occurrence_tracking(repeat('a', 63)), null, 'Short tracking code is rejected');
select is(public.occurrence_tracking(repeat('A', 64)), null, 'Uppercase tracking code is rejected');
select is(public.occurrence_tracking(null), null, 'Missing tracking code is rejected');
select is(public.occurrence_tracking('codigoqualquer'), null, 'Arbitrary tracking code is rejected');

set local role anon;
select is(public.occurrence_tracking(repeat('a', 64))->'situation'->>'label', 'Recebida pelo síndico', 'Anonymous link renders the resident situation');
select is(position('Nota interna do síndico' in public.occurrence_tracking(repeat('a', 64))::text), 0, 'Anonymous link hides internal notes');
select throws_ok($$select tracking_code from public.occurrences$$, '42501', null, 'Anonymous role cannot enumerate occurrences');

select * from finish();
rollback;
