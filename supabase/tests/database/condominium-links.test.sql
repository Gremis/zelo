begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
insert into auth.users (id, email) values ('29000000-0000-4000-8000-000000000009', 'condominium-links@example.invalid');
insert into public.profiles (id, is_sindico) values ('29000000-0000-4000-8000-000000000009', true)
on conflict (id) do update set is_sindico = true;
select set_config('request.jwt.claims', '{"sub":"29000000-0000-4000-8000-000000000009"}', true);
select lives_ok($$select * from public.create_condominium('Residencial Edifício São João', 'Synthetic address')$$, 'Creation succeeds');
select matches((select slug from public.condominiums where manager_id = auth.uid()), '^sao-joao-[a-z0-9]{4}$', 'Prefixes and accents normalized');
create temporary table initial_link as select slug from public.condominiums where manager_id = auth.uid();
create temporary sequence collision_attempts;
create function pg_temp.force_slug_collision() returns trigger language plpgsql as $$
begin
  if nextval('pg_temp.collision_attempts') <= 2 then
    NEW.slug := (select slug from initial_link);
  end if;
  return NEW;
end;
$$;
create trigger zz_test_collision before insert on public.condominiums for each row execute function pg_temp.force_slug_collision();
select lives_ok($$select * from public.create_condominium('Another name', 'Synthetic address')$$, 'Unique constraint collisions retried');
select is((select last_value from collision_attempts), 3::bigint, 'Success after exactly two collisions');
select is((select count(*) from public.condominiums where manager_id = auth.uid()), 2::bigint, 'Retries create one record');
drop trigger zz_test_collision on public.condominiums;
create function pg_temp.force_all_collisions() returns trigger language plpgsql as $$
begin
  perform nextval('pg_temp.collision_attempts');
  NEW.slug := (select slug from initial_link);
  return NEW;
end;
$$;
create trigger zz_test_collision before insert on public.condominiums for each row execute function pg_temp.force_all_collisions();
select throws_ok($$select * from public.create_condominium('Exhaust retries', 'Synthetic address')$$, '23505', null, 'Retry exhaustion preserves unique constraint failure');
select is((select last_value from collision_attempts), 11::bigint, 'Retries bounded to eight attempts');
drop trigger zz_test_collision on public.condominiums;
select is((select count(*) from public.condominiums where manager_id = auth.uid()), 2::bigint, 'Failed attempts leave no rows');
select lives_ok($$select * from public.create_condominium('!!!', 'Synthetic address')$$, 'Empty normalized name supported');
select matches((select slug from public.condominiums where name = '!!!' and manager_id = auth.uid()), '^condominio-[a-z0-9]{4}$', 'Fallback stem used');
select lives_ok($$select * from public.create_condominium('Condomínio ' || repeat('Á', 100), 'Synthetic address')$$, 'Long name supported');
select matches((select slug from public.condominiums where name like 'Condomínio %' and manager_id = auth.uid()), '^a{40}-[a-z0-9]{4}$', 'Stem limited to forty characters');
select lives_ok($$select * from public.create_condominium('Residencialista', 'Synthetic address')$$, 'Prefix substring supported');
select matches((select slug from public.condominiums where name = 'Residencialista' and manager_id = auth.uid()), '^residencialista-[a-z0-9]{4}$', 'Only complete leading words removed');
select lives_ok($$select * from public.create_condominium('Residencial Edifício', 'Synthetic address')$$, 'Category-only name supported');
select matches((select slug from public.condominiums where name = 'Residencial Edifício' and manager_id = auth.uid()), '^condominio-[a-z0-9]{4}$', 'All leading categories removed');
alter table public.condominiums disable trigger condominiums_slug;
insert into public.condominiums (manager_id, name, address, slug) values
  (auth.uid(), 'Legacy fixture', 'Synthetic address', 'legacy-0123456789abcdef0123456789abcdef');
alter table public.condominiums enable trigger condominiums_slug;
update public.condominiums set name = 'Legacy updated', address = 'Updated address'
where slug = 'legacy-0123456789abcdef0123456789abcdef';
select is((select slug from public.condominiums where name = 'Legacy updated'), 'legacy-0123456789abcdef0123456789abcdef', 'Legacy identifier remains stable');
select is((select name from public.resolve_condominium_link('legacy-0123456789abcdef0123456789abcdef')), 'Legacy updated', 'Legacy public link resolves current name');
select * from finish();
rollback;
