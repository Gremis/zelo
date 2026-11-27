-- ORI-71 (S2.3): cobre o que a migration da sugestão por IA acrescentou à
-- register_public_occurrence_with_suggestion (ORI-74). Verifica a persistência
-- de category e ai_failure_reason, o fallback por regras, o override de risco
-- com categoria vinda da IA, as rejeições dos campos novos e a remoção do
-- overload antigo de 9 argumentos. Cobre também o caminho real do formulário
-- público (register_public_occurrence_attempt), que repassa os campos novos e
-- permanece idempotente.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
insert into auth.users(id,email) values ('71000000-0000-4000-8000-000000000001','ori71@example.invalid');
insert into condominiums(id,manager_id,name,address) values ('71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','Synthetic ORI71','Synthetic address');
select set_config('ori71.slug',(select slug from condominiums where id='71000000-0000-4000-8000-000000000001'),true);
set local role service_role;
-- Caminho IA (Normal): grava a categoria da IA e deixa ai_failure_reason nulo.
select set_config('ori71.ai_normal',(select occurrence_id::text from register_public_occurrence_with_suggestion(current_setting('ori71.slug'),'Synthetic reporter','11900000000','Synthetic unit','Synthetic description','Hall','normal','Lâmpada queimada, sem risco.','ai','Iluminação')),true);
-- Caminho IA (Baixa): a IA pode sugerir Baixa, também com categoria.
select set_config('ori71.ai_low',(select occurrence_id::text from register_public_occurrence_with_suggestion(current_setting('ori71.slug'),'Synthetic reporter','11900000000','Synthetic unit','Synthetic description','Hall','low','Sugestão de melhoria.','ai','Outros')),true);
-- Fallback por regras (IA falhou): Normal, sem categoria, com ai_failure_reason.
select set_config('ori71.fallback',(select occurrence_id::text from register_public_occurrence_with_suggestion(current_setting('ori71.slug'),'Synthetic reporter','11900000000','Synthetic unit','Synthetic description','Hall','normal','Sem sinal de risco no relato.','rules',null,'timeout')),true);
-- Override de risco: regras + Urgente carregam a categoria calculada pela IA.
select set_config('ori71.override',(select occurrence_id::text from register_public_occurrence_with_suggestion(current_setting('ori71.slug'),'Synthetic reporter','11900000000','Synthetic unit','Cheiro de gás no hall','Hall','urgent','Menciona gás: risco à segurança.','rules','Gás')),true);
-- Rejeições dos campos novos (a RPC levanta 22023 antes de gravar).
select throws_ok($$select register_public_occurrence_with_suggestion(current_setting('ori71.slug'),'Synthetic reporter','11900000000','Synthetic unit','Synthetic description','Hall','normal','Classificada pela IA.','ai',' ')$$,'22023',null,'Reject blank category');
select throws_ok($$select register_public_occurrence_with_suggestion(current_setting('ori71.slug'),'Synthetic reporter','11900000000','Synthetic unit','Synthetic description','Hall','normal','Classificada pela IA.','ai',repeat('x',101))$$,'22023',null,'Reject category length');
select throws_ok($$select register_public_occurrence_with_suggestion(current_setting('ori71.slug'),'Synthetic reporter','11900000000','Synthetic unit','Synthetic description','Hall','normal','Sem sinal de risco no relato.','rules',null,' ')$$,'22023',null,'Reject blank ai_failure_reason');
select throws_ok($$select register_public_occurrence_with_suggestion(current_setting('ori71.slug'),'Synthetic reporter','11900000000','Synthetic unit','Synthetic description','Hall','normal','Sem sinal de risco no relato.','rules',null,repeat('x',301))$$,'22023',null,'Reject ai_failure_reason length');
select throws_ok($$select register_public_occurrence_with_suggestion(current_setting('ori71.slug'),'Synthetic reporter','11900000000','Synthetic unit','Synthetic description','Hall','normal',repeat('x',301),'ai','Outros')$$,'22023',null,'Reject AI reason length');
-- Caminho real do formulário (wrapper idempotente): precisa repassar os campos
-- novos; esta submissão falharia se a _attempt não os conhecesse.
select set_config('ori71.form_ai',(select occurrence_id::text from register_public_occurrence_attempt(current_setting('ori71.slug'),'71000000-0000-4000-8000-0000000000aa','Synthetic reporter','11900000000','Synthetic unit','Relato pelo formulário','Hall','normal','Classificada pela IA.','ai','Elétrica')),true);
-- Reenvio idempotente (mesma attempt_key e mesmo conteúdo): devolve a mesma ocorrência.
select set_config('ori71.form_replay',(select occurrence_id::text from register_public_occurrence_attempt(current_setting('ori71.slug'),'71000000-0000-4000-8000-0000000000aa','Synthetic reporter','11900000000','Synthetic unit','Relato pelo formulário','Hall','normal','Classificada pela IA.','ai','Elétrica')),true);
-- Caminho do formulário com fallback por regras: carrega ai_failure_reason.
select set_config('ori71.form_fallback',(select occurrence_id::text from register_public_occurrence_attempt(current_setting('ori71.slug'),'71000000-0000-4000-8000-0000000000bb','Synthetic reporter','11900000000','Synthetic unit','Relato pelo formulário','Hall','normal','Sem sinal de risco no relato.','rules',null,'timeout')),true);
reset role;
-- Persistência do caminho IA (Normal).
select ok((select suggested_priority='normal' and suggestion_source='ai' and category='Iluminação' and ai_failure_reason is null and suggestion_reason='Lâmpada queimada, sem risco.' from occurrences where id=current_setting('ori71.ai_normal')::uuid),'AI path persists category and leaves failure null');
-- Persistência do caminho IA (Baixa).
select ok((select suggested_priority='low' and suggestion_source='ai' and category='Outros' and ai_failure_reason is null from occurrences where id=current_setting('ori71.ai_low')::uuid),'AI low priority persists category');
-- Persistência do fallback por regras.
select ok((select suggested_priority='normal' and suggestion_source='rules' and category is null and ai_failure_reason='timeout' from occurrences where id=current_setting('ori71.fallback')::uuid),'Rules fallback persists failure and leaves category null');
-- Persistência do override de risco.
select ok((select suggested_priority='urgent' and suggestion_source='rules' and category='Gás' and ai_failure_reason is null and suggestion_reason='Menciona gás: risco à segurança.' from occurrences where id=current_setting('ori71.override')::uuid),'Risk override persists AI category with rules urgent');
-- O overload de 9 argumentos foi removido; só existe a entrada de 11.
select ok(to_regprocedure('public.register_public_occurrence_with_suggestion(text,text,text,text,text,text,text,text,text)') is null,'9-arg overload removed');
select ok(to_regprocedure('public.register_public_occurrence_with_suggestion(text,text,text,text,text,text,text,text,text,text,text)') is not null,'11-arg entry exists');
-- Caminho do formulário: grava a categoria da IA através do wrapper idempotente.
select ok((select suggestion_source='ai' and category='Elétrica' and ai_failure_reason is null and origin='public_form' from occurrences where id=current_setting('ori71.form_ai')::uuid),'Form path persists AI category through attempt wrapper');
-- Reenvio idempotente devolve a mesma ocorrência (não duplica).
select is(current_setting('ori71.form_replay'),current_setting('ori71.form_ai'),'Idempotent replay returns the same occurrence');
-- Caminho do formulário com fallback por regras: grava a falha da IA.
select ok((select suggestion_source='rules' and category is null and ai_failure_reason='timeout' from occurrences where id=current_setting('ori71.form_fallback')::uuid),'Form fallback persists ai_failure_reason through attempt wrapper');
-- O overload anterior de 11 argumentos da _attempt foi removido; existe o de 13.
select ok(to_regprocedure('public.register_public_occurrence_attempt(text,uuid,text,text,text,text,text,text,text,text,text)') is null,'11-arg attempt overload removed');
select ok(to_regprocedure('public.register_public_occurrence_attempt(text,uuid,text,text,text,text,text,text,text,text,text,text,text)') is not null,'13-arg attempt entry exists');
select * from finish();
rollback;
