begin;

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'Testes de funcionários requerem public.profiles (ORI-20).';
  end if;
  if to_regclass('public.condominiums') is null then
    raise exception 'Testes de funcionários requerem public.condominiums (ORI-29).';
  end if;
  if to_regclass('public.funcionarios') is null then
    raise exception 'Testes requerem a migration de funcionários aplicada.';
  end if;
end;
$$;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

-- Síndico A, Síndico B e um não-síndico C. O metadata controla is_sindico,
-- que o trigger de profiles usa e que dispara o seed das funções padrão.
insert into auth.users (id, email, raw_user_meta_data) values
  ('51400000-0000-4000-8000-000000000001', 's14-a@example.invalid', '{"is_sindico": true}'),
  ('51400000-0000-4000-8000-000000000002', 's14-b@example.invalid', '{"is_sindico": true}'),
  ('51400000-0000-4000-8000-000000000003', 's14-c@example.invalid', '{"is_sindico": false}');

select has_table('public', 'funcoes', 'Tabela funcoes existe');
select has_table('public', 'funcionarios', 'Tabela funcionarios existe');

-- =====================================================================
-- Seed das funções padrão
-- =====================================================================
select is(
  (select count(*) from public.funcoes
    where sindico_id = '51400000-0000-4000-8000-000000000001'),
  3::bigint, 'Síndico recebe 3 funções padrão ao criar o perfil'
);

select bag_eq(
  $$select nome from public.funcoes
    where sindico_id = '51400000-0000-4000-8000-000000000001'$$,
  $$values ('Zelador'), ('Porteiro'), ('Auxiliar de limpeza')$$,
  'Funções padrão são Zelador, Porteiro e Auxiliar de limpeza'
);

select is(
  (select count(*) from public.funcoes
    where sindico_id = '51400000-0000-4000-8000-000000000003'),
  0::bigint, 'Não-síndico não recebe funções padrão'
);

-- Seed quando um perfil existente passa a ser síndico (trigger de UPDATE).
insert into auth.users (id, email, raw_user_meta_data) values
  ('51400000-0000-4000-8000-000000000004', 's14-virou@example.invalid',
   '{"is_sindico": false}');
select is(
  (select count(*) from public.funcoes
    where sindico_id = '51400000-0000-4000-8000-000000000004'),
  0::bigint, 'Perfil criado como não-síndico começa sem funções'
);
update public.profiles set is_sindico = true
  where id = '51400000-0000-4000-8000-000000000004';
select is(
  (select count(*) from public.funcoes
    where sindico_id = '51400000-0000-4000-8000-000000000004'),
  3::bigint, 'Ao virar síndico, recebe as 3 funções padrão'
);
update public.profiles set is_sindico = false
  where id = '51400000-0000-4000-8000-000000000004';
update public.profiles set is_sindico = true
  where id = '51400000-0000-4000-8000-000000000004';
select is(
  (select count(*) from public.funcoes
    where sindico_id = '51400000-0000-4000-8000-000000000004'),
  3::bigint, 'Virar síndico de novo não duplica as funções (on conflict)'
);

-- =====================================================================
-- Restrições de funções
-- =====================================================================
select throws_ok(
  $$insert into public.funcoes (sindico_id, nome)
    values ('51400000-0000-4000-8000-000000000001', 'zelador')$$,
  '23505', null,
  'Função duplicada na carteira é barrada ignorando maiúsculas/minúsculas'
);

select is(
  (select count(*) from public.funcoes
    where lower(nome) = 'zelador'
      and sindico_id in (
        '51400000-0000-4000-8000-000000000001',
        '51400000-0000-4000-8000-000000000002'
      )),
  2::bigint, 'A mesma função pode existir para síndicos diferentes'
);

select throws_ok(
  format(
    $$insert into public.funcoes (sindico_id, nome)
      values ('51400000-0000-4000-8000-000000000001', %L)$$, value),
  '23514', null, 'Função com nome em branco é rejeitada'
)
from (values (''), ('   '), (E'\t\n\r')) as invalid(value);

-- =====================================================================
-- Condomínios de apoio (inseridos como postgres, que ignora RLS)
-- =====================================================================
insert into public.condominiums (manager_id, name, address) values
  ('51400000-0000-4000-8000-000000000001', 'Condo A', 'Rua A, 100'),
  ('51400000-0000-4000-8000-000000000002', 'Condo B', 'Rua B, 200');

-- =====================================================================
-- Restrições de funcionários
-- =====================================================================
select lives_ok(
  $$insert into public.funcionarios
    (sindico_id, condominio_id, funcao_id, nome, celular, horario_trabalho)
    values (
      '51400000-0000-4000-8000-000000000001',
      (select id from public.condominiums where name = 'Condo A'),
      (select id from public.funcoes
        where sindico_id = '51400000-0000-4000-8000-000000000001' and nome = 'Zelador'),
      'Antônio Pereira', '(31) 99300-1180', 'Seg a sex, 7h às 16h'
    )$$,
  'Funcionário válido é inserido'
);

select is(
  (select celular_normalizado from public.funcionarios where nome = 'Antônio Pereira'),
  '31993001180', 'Celular é normalizado removendo a máscara'
);

-- Celular único POR CARTEIRA: mesmo número em carteiras diferentes é permitido.
select lives_ok(
  $$insert into public.funcionarios
    (sindico_id, condominio_id, funcao_id, nome, celular)
    values (
      '51400000-0000-4000-8000-000000000002',
      (select id from public.condominiums where name = 'Condo B'),
      (select id from public.funcoes
        where sindico_id = '51400000-0000-4000-8000-000000000002' and nome = 'Zelador'),
      'Mesmo numero outra carteira', '31 99300 1180'
    )$$,
  'Mesmo celular pode existir em carteiras de síndicos diferentes'
);

-- Na MESMA carteira, o celular duplicado (mesmo com outra máscara) é barrado.
select throws_ok(
  $$insert into public.funcionarios
    (sindico_id, condominio_id, funcao_id, nome, celular)
    values (
      '51400000-0000-4000-8000-000000000001',
      (select id from public.condominiums where name = 'Condo A'),
      (select id from public.funcoes
        where sindico_id = '51400000-0000-4000-8000-000000000001' and nome = 'Porteiro'),
      'Duplicado na carteira', '31 99300-1180'
    )$$,
  '23505', null, 'Celular duplicado na mesma carteira é barrado'
);

-- Celular fora do formato de celular (11 dígitos com 9) é barrado pelo check.
select throws_ok(
  $$insert into public.funcionarios
    (sindico_id, condominio_id, funcao_id, nome, celular)
    values (
      '51400000-0000-4000-8000-000000000001',
      (select id from public.condominiums where name = 'Condo A'),
      (select id from public.funcoes
        where sindico_id = '51400000-0000-4000-8000-000000000001' and nome = 'Zelador'),
      'Numero Fixo', '(31) 3333-4444'
    )$$,
  '23514', null, 'Celular que não é de 11 dígitos com 9 é barrado'
);

select throws_ok(
  $$insert into public.funcionarios
    (sindico_id, condominio_id, funcao_id, nome, celular)
    values (
      '51400000-0000-4000-8000-000000000001',
      (select id from public.condominiums where name = 'Condo A'),
      (select id from public.funcoes
        where sindico_id = '51400000-0000-4000-8000-000000000001' and nome = 'Zelador'),
      '   ', '31999990000'
    )$$,
  '23514', null, 'Funcionário com nome em branco é rejeitado'
);

select throws_ok(
  $$insert into public.funcionarios
    (sindico_id, condominio_id, funcao_id, nome, celular)
    values (
      '51400000-0000-4000-8000-000000000001',
      (select id from public.condominiums where name = 'Condo A'),
      (select id from public.funcoes
        where sindico_id = '51400000-0000-4000-8000-000000000001' and nome = 'Zelador'),
      'Sem Celular', '   '
    )$$,
  '23514', null, 'Funcionário com celular em branco é rejeitado'
);

select throws_ok(
  $$insert into public.funcionarios
    (sindico_id, condominio_id, funcao_id, nome, celular)
    values (
      '51400000-0000-4000-8000-000000000001',
      '51400000-0000-4000-8000-0000000000aa',
      (select id from public.funcoes
        where sindico_id = '51400000-0000-4000-8000-000000000001' and nome = 'Zelador'),
      'Condo Inexistente', '31900000001'
    )$$,
  '23503', null, 'Condomínio precisa existir'
);

select throws_ok(
  $$insert into public.funcionarios
    (sindico_id, condominio_id, funcao_id, nome, celular)
    values (
      '51400000-0000-4000-8000-000000000001',
      (select id from public.condominiums where name = 'Condo A'),
      '51400000-0000-4000-8000-0000000000bb',
      'Função Inexistente', '31900000002'
    )$$,
  '23503', null, 'Função precisa existir'
);

select lives_ok(
  $$insert into public.funcionarios
    (sindico_id, condominio_id, funcao_id, nome, celular)
    values (
      '51400000-0000-4000-8000-000000000001',
      (select id from public.condominiums where name = 'Condo A'),
      (select id from public.funcoes
        where sindico_id = '51400000-0000-4000-8000-000000000001' and nome = 'Porteiro'),
      'Carlos Souza', '31 98888-0000'
    )$$,
  'Horário de trabalho é opcional'
);

-- Funcionário do síndico B, usado nos testes de isolamento.
insert into public.funcionarios
  (sindico_id, condominio_id, funcao_id, nome, celular)
values (
  '51400000-0000-4000-8000-000000000002',
  (select id from public.condominiums where name = 'Condo B'),
  (select id from public.funcoes
    where sindico_id = '51400000-0000-4000-8000-000000000002' and nome = 'Zelador'),
  'Funcionário do B', '31 98000-0000'
);

select lives_ok(
  $$update public.funcionarios set ativo = false where nome = 'Carlos Souza'$$,
  'Soft delete: funcionário pode ser desativado'
);
select is(
  (select ativo from public.funcionarios where nome = 'Carlos Souza'),
  false, 'Funcionário desativado é preservado (sem exclusão física)'
);

-- I1: excluir um síndico com condomínio/funcionário vinculado é bloqueado
-- (a FK preserva os dados em vez de apagar em cascata).
select throws_ok(
  $$delete from auth.users where id = '51400000-0000-4000-8000-000000000001'$$,
  '23503', null,
  'Excluir síndico com condomínio/funcionário vinculado é bloqueado'
);

-- =====================================================================
-- Estrutura de segurança
-- =====================================================================
select ok(relrowsecurity and relforcerowsecurity, 'RLS habilitada e forçada em funcionarios')
from pg_class where oid = 'public.funcionarios'::regclass;
select ok(relrowsecurity and relforcerowsecurity, 'RLS habilitada e forçada em funcoes')
from pg_class where oid = 'public.funcoes'::regclass;

select ok(
  not has_table_privilege('authenticated', 'public.funcionarios', 'DELETE'),
  'Authenticated não pode excluir funcionários (soft delete)'
);
select ok(
  not has_column_privilege('authenticated', 'public.funcionarios', 'sindico_id', 'UPDATE'),
  'Authenticated não pode trocar o síndico dono'
);
select ok(
  not has_table_privilege(role_name, 'public.funcionarios', privilege_name),
  format('%s não tem privilégio %s em funcionarios', role_name, privilege_name)
)
from (values ('anon'), ('service_role')) as roles(role_name)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as privs(privilege_name);

select ok(
  not has_function_privilege(role_name, 'public.seed_funcoes_padrao()', 'EXECUTE'),
  format('%s não chama a função de seed diretamente', role_name)
)
from (values ('anon'), ('authenticated'), ('service_role')) as roles(role_name);

-- Guarda ids do síndico B para os testes de referência cruzada / UPDATE.
create temporary table s14_refs as
select
  (select id from public.condominiums where name = 'Condo B') as condo_b,
  (select id from public.funcoes
    where sindico_id = '51400000-0000-4000-8000-000000000002'
      and nome = 'Zelador') as funcao_b;
grant select on s14_refs to authenticated;

-- =====================================================================
-- Isolamento entre síndicos (identidade autenticada)
-- =====================================================================
update auth.users set email_confirmed_at=now() where id::text like '51400000-%';
insert into auth.sessions(id,user_id) select id,id from auth.users where id::text like '51400000-%';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"51400000-0000-4000-8000-000000000001","session_id":"51400000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(auth.uid(), '51400000-0000-4000-8000-000000000001'::uuid, 'Identidade do síndico A');

select is(
  (select count(*) from public.funcionarios where sindico_id <> auth.uid()),
  0::bigint, 'Síndico A não enxerga funcionários de outro síndico'
);
select is(
  (select count(*) from public.funcoes where sindico_id <> auth.uid()),
  0::bigint, 'Síndico A não enxerga funções de outro síndico'
);

select lives_ok(
  $$insert into public.funcionarios
    (sindico_id, condominio_id, funcao_id, nome, celular)
    values (
      '51400000-0000-4000-8000-000000000001',
      (select id from public.condominiums where name = 'Condo A'),
      (select id from public.funcoes where nome = 'Auxiliar de limpeza'),
      'Joana Martins', '31 99211-7741'
    )$$,
  'Síndico A cria funcionário na própria carteira'
);

-- A desativa o próprio funcionário (caminho de UPDATE sob RLS).
select lives_ok(
  $$update public.funcionarios set ativo = false where nome = 'Joana Martins'$$,
  'Síndico A desativa o próprio funcionário'
);

-- A não pode mover o próprio funcionário para o condomínio de outro síndico.
select throws_ok(
  $$update public.funcionarios
    set condominio_id = (select condo_b from s14_refs)
    where nome = 'Joana Martins'$$,
  '42501', null, 'UPDATE não move funcionário para condomínio de outro síndico'
);

-- A não pode mover o próprio funcionário para a função de outro síndico.
select throws_ok(
  $$update public.funcionarios
    set funcao_id = (select funcao_b from s14_refs)
    where nome = 'Joana Martins'$$,
  '42501', null, 'UPDATE não move funcionário para função de outro síndico'
);

-- A não pode criar função em nome de outro síndico.
select throws_ok(
  $$insert into public.funcoes (sindico_id, nome)
    values ('51400000-0000-4000-8000-000000000002', 'Forjada')$$,
  '42501', null, 'Não cria função em nome de outro síndico'
);

-- A não altera a função de outro síndico (RLS filtra: 0 linhas afetadas).
select results_eq(
  $$with changed as (
      update public.funcoes set nome = 'Renomeada'
      where sindico_id = '51400000-0000-4000-8000-000000000002' returning id)
    select count(*) from changed$$,
  $$values (0::bigint)$$,
  'Síndico A não renomeia função de outro síndico'
);

select throws_ok(
  $$insert into public.funcionarios
    (sindico_id, condominio_id, funcao_id, nome, celular)
    values (
      '51400000-0000-4000-8000-000000000002',
      (select id from public.condominiums where name = 'Condo A'),
      (select id from public.funcoes where nome = 'Zelador'),
      'Impostor', '31 90000-0000'
    )$$,
  '42501', null, 'Síndico A não pode cadastrar em nome de outro síndico'
);

select throws_ok(
  $$insert into public.funcionarios
    (sindico_id, condominio_id, funcao_id, nome, celular)
    values (
      '51400000-0000-4000-8000-000000000001',
      (select condo_b from s14_refs),
      (select id from public.funcoes where nome = 'Zelador'),
      'Condo Alheio', '31 90000-0001'
    )$$,
  '42501', null, 'Funcionário não pode referenciar condomínio de outro síndico'
);

select throws_ok(
  $$insert into public.funcionarios
    (id, sindico_id, condominio_id, funcao_id, nome, celular)
    values (
      '51400000-0000-4000-8000-0000000000cc',
      '51400000-0000-4000-8000-000000000001',
      (select id from public.condominiums where name = 'Condo A'),
      (select id from public.funcoes where nome = 'Zelador'),
      'Chave Manual', '31 90000-0002'
    )$$,
  '42501', null, 'Cliente autenticado não pode definir a chave primária'
);

select results_eq(
  $$with changed as (
      update public.funcionarios set nome = 'Hacked'
      where nome = 'Funcionário do B' returning id)
    select count(*) from changed$$,
  $$values (0::bigint)$$,
  'Síndico A não altera funcionário de outro síndico'
);

select throws_ok(
  $$delete from public.funcionarios where nome = 'Joana Martins'$$,
  '42501', null, 'Exclusão não é permitida (soft delete via ativo)'
);

-- Síndico B: isolamento simétrico.
select set_config(
  'request.jwt.claims',
  '{"sub":"51400000-0000-4000-8000-000000000002","session_id":"51400000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(
  (select count(*) from public.funcionarios where sindico_id <> auth.uid()),
  0::bigint, 'Síndico B também só enxerga a própria carteira'
);
select is(
  (select count(*) from public.funcionarios where nome = 'Funcionário do B'),
  1::bigint, 'Síndico B enxerga o próprio funcionário'
);

-- Não-síndico: sem acesso.
select set_config(
  'request.jwt.claims',
  '{"sub":"51400000-0000-4000-8000-000000000003","session_id":"51400000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is(
  (select count(*) from public.funcionarios), 0::bigint,
  'Não-síndico não enxerga funcionários'
);
select throws_ok(
  $$insert into public.funcoes (sindico_id, nome)
    values ('51400000-0000-4000-8000-000000000003', 'Qualquer')$$,
  '42501', null, 'Não-síndico não cria funções'
);

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok($$select * from public.funcionarios$$, '42501', null,
  'Service role não lê funcionários apesar de ignorar RLS');
select throws_ok($$select * from public.funcoes$$, '42501', null,
  'Service role não lê funções');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select * from public.funcionarios$$, '42501', null,
  'Anônimo não lê funcionários');
reset role;

select * from finish();
rollback;
