begin;

create or replace function public.seed_funcoes_padrao()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.is_sindico then
    insert into public.funcoes(sindico_id,nome)
    values(new.id,'Zelador'),(new.id,'Porteiro'),(new.id,'Auxiliar de limpeza')
    on conflict(sindico_id,lower(nome)) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.seed_funcoes_padrao() from public,anon,authenticated,service_role;

create trigger on_profile_sindico_seed_funcoes
  after update of is_sindico on public.profiles
  for each row when(new.is_sindico and not old.is_sindico)
  execute function public.seed_funcoes_padrao();

insert into public.funcoes(sindico_id,nome)
select p.id,f.nome from public.profiles p
cross join(values('Zelador'),('Porteiro'),('Auxiliar de limpeza')) f(nome)
where p.is_sindico
on conflict(sindico_id,lower(nome)) do nothing;

commit;
