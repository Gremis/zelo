begin;

-- =====================================================================
-- Estrutura de funcionários e funções da carteira do síndico.
-- Funcionários não possuem conta de acesso (sem auth.users).
-- Depende de ORI-20 (public.profiles) e ORI-29 (public.condominiums).
-- =====================================================================

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'Requer a migration de public.profiles (ORI-20).';
  end if;
  if to_regclass('public.condominiums') is null then
    raise exception 'Requer a migration de public.condominiums (ORI-29).';
  end if;
end;
$$;

-- =====================================================================
-- Funções (cadastro próprio da carteira do síndico)
-- =====================================================================
create table public.funcoes (
  id uuid primary key default gen_random_uuid(),
  sindico_id uuid not null references public.profiles (id) on delete cascade,
  nome text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint funcoes_nome_not_blank check (nome ~ '[^[:space:]]'),
  constraint funcoes_nome_length check (char_length(nome) <= 50)
);

-- Impede função duplicada na mesma carteira, ignorando maiúsculas/minúsculas.
create unique index funcoes_sindico_nome_unique
  on public.funcoes (sindico_id, lower(nome));

create trigger funcoes_set_updated_at
  before update on public.funcoes
  for each row
  execute function public.handle_updated_at();

alter table public.funcoes enable row level security;
alter table public.funcoes force row level security;

revoke all on table public.funcoes from public, anon, authenticated, service_role;
grant select on public.funcoes to authenticated;
grant insert (sindico_id, nome) on public.funcoes to authenticated;
grant update (nome) on public.funcoes to authenticated;

create policy funcoes_select_own on public.funcoes
for select to authenticated
using (
  sindico_id = (select auth.uid())
  and exists (
    select 1 from public.profiles as profile
    where profile.id = (select auth.uid()) and profile.is_sindico = true
  )
);

create policy funcoes_insert_own on public.funcoes
for insert to authenticated
with check (
  sindico_id = (select auth.uid())
  and exists (
    select 1 from public.profiles as profile
    where profile.id = (select auth.uid()) and profile.is_sindico = true
  )
);

create policy funcoes_update_own on public.funcoes
for update to authenticated
using (
  sindico_id = (select auth.uid())
  and exists (
    select 1 from public.profiles as profile
    where profile.id = (select auth.uid()) and profile.is_sindico = true
  )
)
with check (
  sindico_id = (select auth.uid())
  and exists (
    select 1 from public.profiles as profile
    where profile.id = (select auth.uid()) and profile.is_sindico = true
  )
);

-- =====================================================================
-- Funcionários (sem conta de acesso; soft delete via "ativo")
-- =====================================================================
create table public.funcionarios (
  id uuid primary key default gen_random_uuid(),
  sindico_id uuid not null references public.profiles (id) on delete cascade,
  condominio_id uuid not null references public.condominiums (id) on delete restrict,
  funcao_id uuid not null references public.funcoes (id) on delete restrict,
  nome text not null,
  celular text not null,
  celular_normalizado text
    generated always as (regexp_replace(celular, '[^0-9]', '', 'g')) stored,
  horario_trabalho text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint funcionarios_nome_not_blank check (nome ~ '[^[:space:]]'),
  constraint funcionarios_nome_length check (char_length(nome) <= 100),
  constraint funcionarios_celular_not_blank check (celular ~ '[^[:space:]]'),
  constraint funcionarios_celular_formato
    check (celular_normalizado ~ '^[1-9][1-9]9[0-9]{8}$'),
  constraint funcionarios_horario_length
    check (horario_trabalho is null or char_length(horario_trabalho) <= 200)
);

-- Celular único por carteira do síndico, independente da máscara.
-- Escopo por carteira (e não global) preserva o isolamento entre síndicos:
-- um síndico não descobre que um celular já pertence a outro.
create unique index funcionarios_sindico_celular_unique
  on public.funcionarios (sindico_id, celular_normalizado);

create index funcionarios_sindico_id_idx on public.funcionarios (sindico_id);

create trigger funcionarios_set_updated_at
  before update on public.funcionarios
  for each row
  execute function public.handle_updated_at();

alter table public.funcionarios enable row level security;
alter table public.funcionarios force row level security;

revoke all on table public.funcionarios from public, anon, authenticated, service_role;
grant select on public.funcionarios to authenticated;
grant insert
  (sindico_id, condominio_id, funcao_id, nome, celular, horario_trabalho, ativo)
  on public.funcionarios to authenticated;
grant update
  (condominio_id, funcao_id, nome, celular, horario_trabalho, ativo)
  on public.funcionarios to authenticated;

-- Além de isolar por síndico, impede apontar para condomínio/função de outro.
create policy funcionarios_select_own on public.funcionarios
for select to authenticated
using (
  sindico_id = (select auth.uid())
  and exists (
    select 1 from public.profiles as profile
    where profile.id = (select auth.uid()) and profile.is_sindico = true
  )
);

create policy funcionarios_insert_own on public.funcionarios
for insert to authenticated
with check (
  sindico_id = (select auth.uid())
  and exists (
    select 1 from public.profiles as profile
    where profile.id = (select auth.uid()) and profile.is_sindico = true
  )
  and exists (
    select 1 from public.condominiums as condominio
    where condominio.id = condominio_id
      and condominio.manager_id = (select auth.uid())
  )
  and exists (
    select 1 from public.funcoes as funcao
    where funcao.id = funcao_id and funcao.sindico_id = (select auth.uid())
  )
);

create policy funcionarios_update_own on public.funcionarios
for update to authenticated
using (
  sindico_id = (select auth.uid())
  and exists (
    select 1 from public.profiles as profile
    where profile.id = (select auth.uid()) and profile.is_sindico = true
  )
)
with check (
  sindico_id = (select auth.uid())
  and exists (
    select 1 from public.condominiums as condominio
    where condominio.id = condominio_id
      and condominio.manager_id = (select auth.uid())
  )
  and exists (
    select 1 from public.funcoes as funcao
    where funcao.id = funcao_id and funcao.sindico_id = (select auth.uid())
  )
);

-- =====================================================================
-- Seed das funções iniciais por síndico (Zelador, Porteiro, Auxiliar de
-- limpeza) ao criar o perfil de um síndico.
-- =====================================================================
create function public.seed_funcoes_padrao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_sindico then
    insert into public.funcoes (sindico_id, nome)
    values
      (new.id, 'Zelador'),
      (new.id, 'Porteiro'),
      (new.id, 'Auxiliar de limpeza');
  end if;
  return new;
end;
$$;

revoke all on function public.seed_funcoes_padrao()
  from public, anon, authenticated, service_role;

create trigger on_profile_created_seed_funcoes
  after insert on public.profiles
  for each row
  execute function public.seed_funcoes_padrao();

commit;
