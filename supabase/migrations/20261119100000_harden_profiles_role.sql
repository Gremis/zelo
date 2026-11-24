-- Hardening de segurança: impedir escalonamento de privilégio no profiles.
--
-- A policy de UPDATE restringe apenas QUAL linha o usuário altera (a dele),
-- mas não restringe QUAIS colunas. Com o grant de UPDATE no nível da tabela,
-- um usuário autenticado conseguia alterar o próprio is_sindico/is_morador
-- pela API (PostgREST) e se tornar síndico.
--
-- A correção é usar privilégio por coluna: o papel "authenticated" passa a
-- poder atualizar somente os campos de perfil que lhe pertencem.
-- O tipo da conta (is_sindico/is_morador) só é definido no cadastro, pela
-- trigger handle_new_user (SECURITY DEFINER), nunca pelo cliente via UPDATE.

revoke update on public.profiles from authenticated;

grant update (full_name, phone) on public.profiles to authenticated;
