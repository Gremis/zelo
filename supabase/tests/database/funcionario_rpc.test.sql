begin;

do $$
begin
  if to_regclass('public.funcionarios') is null then
    raise exception 'Testes da RPC requerem a estrutura de funcionários.';
  end if;
  if to_regprocedure('public.create_funcionario(uuid,text,text,text,text)') is null then
    raise exception 'Testes requerem a RPC create_funcionario aplicada.';
  end if;
end;
$$;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1400000-0000-4000-8000-000000000001', 'rpc-a@example.invalid', '{"is_sindico": true}'),
  ('a1400000-0000-4000-8000-000000000002', 'rpc-b@example.invalid', '{"is_sindico": true}');

insert into public.condominiums (manager_id, name, address) values
  ('a1400000-0000-4000-8000-000000000001', 'Cond A', 'Rua A, 1'),
  ('a1400000-0000-4000-8000-000000000002', 'Cond B', 'Rua B, 2');

-- Guarda o id do condomínio do síndico B para o teste de referência cruzada.
create temporary table rpc_refs as
select (select id from public.condominiums where name = 'Cond B') as condo_b;
grant select on rpc_refs to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a1400000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- ---------- create_funcionario ----------
select lives_ok(
  $$select public.create_funcionario(
    (select id from public.condominiums where name = 'Cond A'),
    'Jardineira', 'Maria Silva', '(31) 98888-0001')$$,
  'create_funcionario cria funcionário com função nova'
);
select is(
  (select count(*) from public.funcoes where nome = 'Jardineira'),
  1::bigint, 'A função nova foi criada no mesmo passo'
);

select lives_ok(
  $$select public.create_funcionario(
    (select id from public.condominiums where name = 'Cond A'),
    'jardineira', 'João Souza', '(31) 98888-0002')$$,
  'create_funcionario com função em caixa diferente reaproveita a existente'
);
select is(
  (select count(*) from public.funcoes where lower(nome) = 'jardineira'),
  1::bigint, 'Não duplicou a função (case-insensitive)'
);

-- Atomicidade: celular duplicado falha e não deixa a função nova órfã.
select throws_ok(
  $$select public.create_funcionario(
    (select id from public.condominiums where name = 'Cond A'),
    'Piscineiro', 'Clone', '31 98888 0001')$$,
  '23505', null, 'Celular duplicado na carteira é barrado'
);
select is(
  (select count(*) from public.funcoes where nome = 'Piscineiro'),
  0::bigint, 'Atomicidade: a função Piscineiro não ficou órfã'
);

-- Não cria funcionário apontando para condomínio de outro síndico.
select throws_ok(
  $$select public.create_funcionario(
    (select condo_b from rpc_refs), 'Zelador', 'Alheio', '(31) 97777-0000')$$,
  '42501', null, 'Não cria funcionário em condomínio de outro síndico'
);

-- Campos obrigatórios com erro claro.
select throws_ok(
  $$select public.create_funcionario(
    (select id from public.condominiums where name = 'Cond A'),
    '  ', 'Sem Funcao', '(31) 96666-0000')$$,
  '22023', null, 'Função vazia é rejeitada com erro claro'
);

-- ---------- create_funcao ----------
select lives_ok($$select public.create_funcao('Vigia')$$, 'create_funcao cria a função');
select lives_ok(
  $$select public.create_funcao('vigia')$$,
  'create_funcao reaproveita em caixa diferente'
);
select is(
  (select count(*) from public.funcoes where lower(nome) = 'vigia'),
  1::bigint, 'create_funcao não duplica'
);
select throws_ok(
  $$select public.create_funcao('   ')$$,
  '22023', null, 'create_funcao rejeita nome vazio'
);

-- ---------- anon não executa as RPCs ----------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select public.create_funcionario(
    gen_random_uuid(), 'X', 'Y Z', '(31) 98888-0003')$$,
  '42501', null, 'anon não executa create_funcionario'
);
select throws_ok(
  $$select public.create_funcao('X')$$,
  '42501', null, 'anon não executa create_funcao'
);
reset role;

select * from finish();
rollback;
