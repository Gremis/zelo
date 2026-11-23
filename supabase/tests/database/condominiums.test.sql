begin;

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'ORI-29 tests require the integrated ORI-20 public.profiles schema and protected role flags.';
  end if;
  if to_regclass('public.condominiums') is null then
    raise exception 'ORI-29 tests require the condominium migration to be applied locally.';
  end if;
end;
$$;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

insert into auth.users (id, email) values
  ('29000000-0000-4000-8000-000000000001', 'ori29-a@example.invalid'),
  ('29000000-0000-4000-8000-000000000002', 'ori29-b@example.invalid'),
  ('29000000-0000-4000-8000-000000000003', 'ori29-other@example.invalid');

insert into public.profiles (id, is_sindico, is_morador) values
  ('29000000-0000-4000-8000-000000000001', true, false),
  ('29000000-0000-4000-8000-000000000002', true, true),
  ('29000000-0000-4000-8000-000000000003', false, true)
on conflict (id) do update set
  is_sindico = excluded.is_sindico,
  is_morador = excluded.is_morador;

select has_table('public', 'condominiums', 'Condominiums table exists');

select lives_ok(
  $$insert into public.condominiums (manager_id, name, address) values ('29000000-0000-4000-8000-000000000001', 'Edifício São João', 'Synthetic street 100')$$,
  'Valid condominium can be inserted'
);

select throws_ok(
  $$insert into public.condominiums (manager_id, name, address) values ('29000000-0000-4000-8000-000000000001', null, 'Synthetic street 100')$$,
  '23502', null, 'Name is required'
);

select throws_ok(
  $$insert into public.condominiums (manager_id, name, address) values ('29000000-0000-4000-8000-000000000001', 'Example', null)$$,
  '23502', null, 'Address is required'
);

select throws_ok(
  format($$insert into public.condominiums (manager_id, name, address) values ('29000000-0000-4000-8000-000000000001', %L, %L)$$, value, 'Synthetic street 100'),
  '23514', null, 'Blank name is rejected'
)
from (values (''), ('   '), (E'\t\n\r')) as invalid(value);

select throws_ok(
  format($$insert into public.condominiums (manager_id, name, address) values ('29000000-0000-4000-8000-000000000001', %L, %L)$$, 'Example', value),
  '23514', null, 'Blank address is rejected'
)
from (values (''), ('   '), (E'\t\n\r')) as invalid(value);

select matches(
  (select slug from public.condominiums where name = 'Edifício São João'),
  '^sao-joao-[a-z0-9]{4}$',
  'Slug contains the normalized initial name and a random code'
);

select lives_ok(
  $$insert into public.condominiums (manager_id, name, address) values ('29000000-0000-4000-8000-000000000001', 'Edifício São João', 'Synthetic street 100')$$,
  'Repeated names and addresses are allowed'
);

select is(
  (select count(distinct slug) from public.condominiums where name = 'Edifício São João'),
  2::bigint,
  'Equal names receive distinct slugs'
);

select is(
  (select count(id) from public.condominiums where name = 'Edifício São João'),
  2::bigint,
  'Inserted condominiums persist with generated primary keys'
);

create temporary table original_condominium as
select id, slug from public.condominiums where name = 'Edifício São João' order by id limit 1;

select throws_ok(
  $$update public.condominiums set name = null where id = (select id from original_condominium)$$,
  '23502', null, 'Editing cannot clear the name'
);

select throws_ok(
  $$update public.condominiums set address = null where id = (select id from original_condominium)$$,
  '23502', null, 'Editing cannot clear the address'
);

select throws_ok(
  $$update public.condominiums set name = E'\t\n ' where id = (select id from original_condominium)$$,
  '23514', null, 'Editing cannot replace the name with whitespace'
);

select throws_ok(
  $$update public.condominiums set address = E'\t\n ' where id = (select id from original_condominium)$$,
  '23514', null, 'Editing cannot replace the address with whitespace'
);

select lives_ok(
  $$update public.condominiums set name = 'Renamed example', address = 'Synthetic avenue 200' where id = (select id from original_condominium)$$,
  'Name and address can be edited'
);

select is(
  (select slug from public.condominiums where id = (select id from original_condominium)),
  (select slug from original_condominium),
  'Editing name and address preserves the original slug'
);

select throws_ok(
  $$update public.condominiums set slug = 'changed-00000000000000000000000000000000' where id = (select id from original_condominium)$$,
  '23514', 'Condominium slug is immutable.', 'Direct slug changes are rejected'
);

select throws_ok(
  $$update public.condominiums set slug = null where id = (select id from original_condominium)$$,
  '23514', 'Condominium slug is immutable.', 'Slug cannot be cleared'
);

select throws_ok(
  $$insert into public.condominiums (manager_id, name, address, slug) values ('29000000-0000-4000-8000-000000000001', 'Example', 'Synthetic street 100', 'custom-00000000000000000000000000000000')$$,
  '23514', 'Condominium slug must be generated by the database.', 'Clients cannot supply a slug'
);

select lives_ok(
  $$insert into public.condominiums (manager_id, name, address) values ('29000000-0000-4000-8000-000000000001', '東京', 'Synthetic street 100')$$,
  'Names without ASCII letters or digits are supported'
);

select matches(
  (select slug from public.condominiums where name = '東京'),
  '^condominio-[a-z0-9]{4}$',
  'An empty normalized name uses a stable fallback prefix'
);

alter table public.condominiums disable trigger condominiums_slug;

select throws_ok(
  $$insert into public.condominiums (manager_id, name, address, slug) select '29000000-0000-4000-8000-000000000001', 'Duplicate', 'Synthetic street 100', slug from original_condominium$$,
  '23505', null, 'Unique constraint independently rejects duplicate slugs'
);

select throws_ok(
  $$insert into public.condominiums (manager_id, name, address, slug) values ('29000000-0000-4000-8000-000000000001', 'Missing slug', 'Synthetic street 100', null)$$,
  '23502', null, 'The slug remains required independently of the trigger'
);

select throws_ok(
  format($$insert into public.condominiums (manager_id, name, address, slug) values ('29000000-0000-4000-8000-000000000001', 'Invalid slug', 'Synthetic street 100', %L)$$, value),
  '23514', null, 'The slug format is enforced independently of the trigger'
)
from (values (''), ('   '), ('custom'), ('custom-0000000000000000000000000000000G')) as invalid(value);

alter table public.condominiums enable trigger condominiums_slug;

select ok(relrowsecurity and relforcerowsecurity, 'RLS is enabled and forced')
from pg_class where oid = 'public.condominiums'::regclass;

select is(
  (select count(*) from pg_policy where polrelid = 'public.condominiums'::regclass),
  4::bigint,
  'Ownership policies and restrictive session policy exist'
);

select ok(
  not has_table_privilege(role_name, 'public.condominiums', privilege_name),
  format('%s has no %s privilege', role_name, privilege_name)
)
from (values ('anon'), ('service_role')) as roles(role_name)
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as privileges(privilege_name);

select ok(
  not has_column_privilege('authenticated', 'public.condominiums', column_name, 'UPDATE'),
  format('Authenticated users cannot edit %s', column_name)
)
from (values ('id'), ('manager_id'), ('slug')) as columns(column_name);

select ok(
  not has_function_privilege(role_name, 'public.set_condominium_slug()', 'EXECUTE'),
  format('%s cannot call the trigger function directly', role_name)
)
from (values ('anon'), ('authenticated'), ('service_role')) as roles(role_name);

select throws_ok(
  $$insert into public.condominiums (name, address) values ('Missing manager', 'Synthetic street 100')$$,
  '23502', null, 'Manager is required'
);

select throws_ok(
  $$insert into public.condominiums (manager_id, name, address) values ('29000000-0000-4000-8000-000000000099', 'Missing profile', 'Synthetic street 100')$$,
  '23503', null, 'Manager must reference an existing profile'
);

select throws_ok(
  $$update public.condominiums set manager_id = '29000000-0000-4000-8000-000000000002' where id = (select id from original_condominium)$$,
  '23514', 'Condominium manager is immutable.', 'Trigger independently rejects ownership changes'
);

select throws_ok(
  $$delete from public.profiles where id = '29000000-0000-4000-8000-000000000001'$$,
  '23503', null, 'A referenced manager profile cannot be deleted'
);

insert into public.condominiums (manager_id, name, address) values
  ('29000000-0000-4000-8000-000000000002', 'B private', 'Synthetic street 200'),
  ('29000000-0000-4000-8000-000000000003', 'Non-manager private', 'Synthetic street 300');

update auth.users set email_confirmed_at = now()
where id in ('29000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000002', '29000000-0000-4000-8000-000000000003');
insert into auth.sessions (id, user_id) values
  ('88000000-0000-4000-8000-000000000001', '29000000-0000-4000-8000-000000000001'),
  ('88000000-0000-4000-8000-000000000002', '29000000-0000-4000-8000-000000000002'),
  ('88000000-0000-4000-8000-000000000003', '29000000-0000-4000-8000-000000000003');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"29000000-0000-4000-8000-000000000001","session_id":"88000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(auth.uid(), '29000000-0000-4000-8000-000000000001'::uuid, 'Access tests use manager A identity');

select lives_ok(
  $$insert into public.condominiums (manager_id, name, address) values ('29000000-0000-4000-8000-000000000001', 'A created', 'Synthetic street 400')$$,
  'Manager A can create an owned condominium'
);

select is((select count(*) from public.condominiums where name = 'A created'), 1::bigint, 'Manager A can read own condominium');
select lives_ok(
  $$insert into public.condominiums (manager_id, name, address) values ('29000000-0000-4000-8000-000000000001', 'A returning', 'Synthetic street 425') returning id, name, address, manager_id, slug$$,
  'Authenticated creation can return all columns needed by the typed SDK'
);
select results_eq(
  $$update public.condominiums set address = 'Synthetic avenue 425' where name = 'A returning' returning address$$,
  $$values ('Synthetic avenue 425'::text)$$,
  'Authenticated editing can return the persisted row'
);

select is((select count(*) from public.condominiums where manager_id <> auth.uid()), 0::bigint, 'Manager A cannot read another portfolio');

select lives_ok(
  $$update public.condominiums set name = 'A edited', address = 'Synthetic avenue 400' where name = 'A created'$$,
  'Manager A can edit own name and address'
);
select is((select address from public.condominiums where name = 'A edited'), 'Synthetic avenue 400', 'Owned edit changes the stored row');

select throws_ok(
  $$insert into public.condominiums (id, manager_id, name, address) values ('29000000-0000-4000-8000-000000000099', '29000000-0000-4000-8000-000000000001', 'Client primary key', 'Synthetic street 900')$$,
  '42501', null, 'Authenticated clients cannot supply a primary key'
);
select throws_ok(
  $$update public.condominiums set id = '29000000-0000-4000-8000-000000000099' where name = 'A edited'$$,
  '42501', null, 'Authenticated clients cannot replace a primary key'
);

select throws_ok(
  $$insert into public.condominiums (manager_id, name, address) values ('29000000-0000-4000-8000-000000000002', 'Impersonated', 'Synthetic street 500')$$,
  '42501', null, 'Manager A cannot create for B'
);
select throws_ok(
  $$update public.condominiums set manager_id = '29000000-0000-4000-8000-000000000002' where name = 'A edited'$$,
  '42501', null, 'Ordinary edit cannot transfer ownership'
);
select throws_ok(
  $$update public.condominiums set slug = 'changed-00000000000000000000000000000000' where name = 'A edited'$$,
  '42501', null, 'Authenticated users cannot edit the slug column'
);
select throws_ok(
  $$insert into public.condominiums (manager_id, name, address, slug) values ('29000000-0000-4000-8000-000000000001', 'Client slug', 'Synthetic street 100', 'custom-00000000000000000000000000000000')$$,
  '42501', null, 'Authenticated users cannot supply a slug'
);
select matches(
  (select slug from public.condominiums where name = 'A edited'),
  '^a-created-[a-z0-9]{4}$',
  'An authenticated edit preserves the slug generated from the initial name'
);
select is(
  (select manager_id from public.condominiums where name = 'A edited'),
  auth.uid(), 'Rejected ownership changes preserve the original manager'
);
select results_eq(
  $$with changed as (update public.condominiums set address = 'Unauthorized' where name = 'B private' returning id) select count(*) from changed$$,
  $$values (0::bigint)$$, 'Manager A cannot update B condominium'
);
select throws_ok(
  $$delete from public.condominiums where name = 'A edited'$$,
  '42501', null, 'Deletion is not granted even for owned rows'
);

select set_config('request.jwt.claims', '{"sub":"29000000-0000-4000-8000-000000000002","session_id":"88000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(
  (select is_sindico and is_morador from public.profiles where id = auth.uid()),
  true, 'Manager B explicitly has both manager and resident roles'
);
select lives_ok(
  $$insert into public.condominiums (manager_id, name, address) values ('29000000-0000-4000-8000-000000000002', 'B dual-role created', 'Synthetic street 800')$$,
  'Resident role does not prevent a manager from creating an owned condominium'
);
select is(
  (select count(*) from public.condominiums where name = 'B dual-role created'),
  1::bigint, 'A user with both roles can read the newly created condominium'
);
select is((select count(*) from public.condominiums where name = 'B private'), 1::bigint, 'A user with both roles can read an owned condominium');
select is((select count(*) from public.condominiums where manager_id <> auth.uid()), 0::bigint, 'Manager B cannot read A portfolio');
select is((select address from public.condominiums where name = 'B private'), 'Synthetic street 200', 'Attempted cross-account update preserved B row');
select lives_ok(
  $$update public.condominiums set address = 'Synthetic avenue 200' where name = 'B private'$$,
  'A user with both roles can edit an owned condominium'
);
select is((select address from public.condominiums where name = 'B private'), 'Synthetic avenue 200', 'The edit by a user with both roles is persisted');

select set_config('request.jwt.claims', '{"sub":"29000000-0000-4000-8000-000000000003","session_id":"88000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*) from public.condominiums), 0::bigint, 'Non-manager cannot read even an owned condominium');
select throws_ok(
  $$insert into public.condominiums (manager_id, name, address) values ('29000000-0000-4000-8000-000000000003', 'Denied', 'Synthetic street 600')$$,
  '42501', null, 'Non-manager cannot create condominiums'
);
select results_eq(
  $$with changed as (update public.condominiums set address = 'Unauthorized' where name = 'Non-manager private' returning id) select count(*) from changed$$,
  $$values (0::bigint)$$, 'Non-manager cannot edit even an owned condominium'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', role_column, 'UPDATE'),
  format('Integrated profiles protection denies updates to %s', role_column)
)
from (values ('is_sindico'), ('is_morador')) as protected(role_column);
select throws_ok(
  $$update public.profiles set is_morador = false where id = auth.uid()$$,
  '42501', null, 'Authenticated users cannot replace their resident role'
);

select lives_ok(
  $$do $attempt$ begin
    update public.profiles set is_sindico = true where id = auth.uid();
  exception when insufficient_privilege then null;
  end $attempt$;$$,
  'Profile self-promotion attempt is handled without changing the test transaction'
);
select is(
  (select is_sindico from public.profiles where id = auth.uid()),
  false, 'ORI-20 dependency: profiles must prevent users from promoting themselves to manager'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select is((select count(*) from public.condominiums), 0::bigint, 'A missing user identity cannot read condominiums');
select throws_ok(
  $$insert into public.condominiums (manager_id, name, address) values ('29000000-0000-4000-8000-000000000001', 'Missing identity', 'Synthetic street 950')$$,
  '42501', null, 'A missing user identity cannot create condominiums'
);

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok($$select * from public.condominiums$$, '42501', null, 'Service role cannot read condominiums despite bypassing RLS');
select throws_ok(
  $$insert into public.condominiums (manager_id, name, address) values ('29000000-0000-4000-8000-000000000001', 'Service role denied', 'Synthetic street 975')$$,
  '42501', null, 'Service role cannot create condominiums'
);
select throws_ok($$update public.condominiums set name = 'Service role denied'$$, '42501', null, 'Service role cannot edit condominiums');
select throws_ok($$delete from public.condominiums$$, '42501', null, 'Service role cannot delete condominiums');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select * from public.condominiums$$, '42501', null, 'Anonymous reads are denied');
select throws_ok(
  $$insert into public.condominiums (manager_id, name, address) values ('29000000-0000-4000-8000-000000000001', 'Anonymous', 'Synthetic street 700')$$,
  '42501', null, 'Anonymous inserts are denied'
);
select throws_ok($$update public.condominiums set name = 'Anonymous'$$, '42501', null, 'Anonymous edits are denied');
select throws_ok($$delete from public.condominiums$$, '42501', null, 'Anonymous deletion is denied');
reset role;

select * from finish();
rollback;
