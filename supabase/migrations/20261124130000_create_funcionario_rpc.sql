begin;

do $$
begin
  if to_regclass('public.funcionarios') is null then
    raise exception 'Requer a migration de estrutura de funcionarios.';
  end if;
end;
$$;

-- =====================================================================
-- RPC: cadastra um funcionário de forma atômica, achando ou criando a
-- função da carteira do síndico no mesmo passo.
--
-- SECURITY INVOKER: roda com a identidade do síndico autenticado, então
-- RLS e os grants por coluna continuam valendo (não dá pra cadastrar em
-- nome de outro síndico nem apontar para condomínio/função alheios).
--
-- Atomicidade: se o insert do funcionário falhar (ex.: celular duplicado),
-- toda a transação é desfeita — inclusive uma função recém-criada aqui —,
-- evitando função órfã.
-- =====================================================================
create function public.create_funcionario(
  p_condominio_id uuid,
  p_funcao_nome text,
  p_nome text,
  p_celular text,
  p_horario_trabalho text default null
)
returns public.funcionarios
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sindico uuid := auth.uid();
  -- Colapsa espaços internos para "Auxiliar de  limpeza" = "Auxiliar de limpeza".
  v_funcao_nome text := trim(regexp_replace(p_funcao_nome, '\s+', ' ', 'g'));
  v_funcao_id uuid;
  v_funcionario public.funcionarios;
begin
  -- Falha cedo, com erro claro, antes de tocar as tabelas.
  if v_sindico is null then
    raise exception 'Não autenticado.' using errcode = '28000';
  end if;
  if coalesce(v_funcao_nome, '') = '' then
    raise exception 'A função é obrigatória.' using errcode = '22023';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'O nome é obrigatório.' using errcode = '22023';
  end if;
  if coalesce(trim(p_celular), '') = '' then
    raise exception 'O celular é obrigatório.' using errcode = '22023';
  end if;

  -- Garante a função na carteira do síndico. O índice único em
  -- (sindico_id, lower(nome)) reaproveita a existente quando a diferença
  -- é só de maiúsculas/minúsculas e evita duplicar em concorrência.
  insert into public.funcoes (sindico_id, nome)
  values (v_sindico, v_funcao_nome)
  on conflict (sindico_id, lower(nome)) do nothing;

  select id
  into v_funcao_id
  from public.funcoes
  where sindico_id = v_sindico and lower(nome) = lower(v_funcao_nome);

  insert into public.funcionarios
    (sindico_id, condominio_id, funcao_id, nome, celular, horario_trabalho)
  values
    (v_sindico, p_condominio_id, v_funcao_id, p_nome, p_celular, p_horario_trabalho)
  returning * into v_funcionario;

  return v_funcionario;
end;
$$;

-- No Supabase os default privileges do schema public concedem execute a
-- anon/authenticated/service_role, então o revoke precisa ser explícito.
revoke all on function
  public.create_funcionario(uuid, text, text, text, text) from public, anon;
grant execute on function
  public.create_funcionario(uuid, text, text, text, text) to authenticated;

-- =====================================================================
-- RPC: cria (ou reaproveita) uma função avulsa na carteira do síndico.
-- Mesma lógica achar-ou-criar do cadastro de funcionário.
-- =====================================================================
create function public.create_funcao(p_nome text)
returns public.funcoes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sindico uuid := auth.uid();
  v_nome text := trim(regexp_replace(p_nome, '\s+', ' ', 'g'));
  v_funcao public.funcoes;
begin
  if v_sindico is null then
    raise exception 'Não autenticado.' using errcode = '28000';
  end if;
  if coalesce(v_nome, '') = '' then
    raise exception 'A função é obrigatória.' using errcode = '22023';
  end if;

  insert into public.funcoes (sindico_id, nome)
  values (v_sindico, v_nome)
  on conflict (sindico_id, lower(nome)) do nothing;

  select *
  into v_funcao
  from public.funcoes
  where sindico_id = v_sindico and lower(nome) = lower(v_nome);

  return v_funcao;
end;
$$;

revoke all on function public.create_funcao(text) from public, anon;
grant execute on function public.create_funcao(text) to authenticated;

commit;
