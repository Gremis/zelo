begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email, email_confirmed_at) values
  ('88000000-0000-4000-8000-000000000001', 'ori88-session@example.invalid', now());
insert into auth.sessions (id, user_id) values
  ('88000000-0000-4000-8000-000000000011', '88000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"88000000-0000-4000-8000-000000000001","session_id":"88000000-0000-4000-8000-000000000011","role":"authenticated"}', true);
select ok(public.has_active_session(), 'Confirmed active session is accepted');
select is((select count(*) from public.profiles), 1::bigint, 'Active session can read own profile');

reset role;
update auth.sessions set not_after = now() - interval '1 second'
where id = '88000000-0000-4000-8000-000000000011';
set local role authenticated;
select ok(not public.has_active_session(), 'Expired session is rejected');
select is((select count(*) from public.profiles), 0::bigint, 'Expired session cannot read profiles');
select results_eq($$update public.profiles set full_name = 'Blocked' returning id$$, $$select null::uuid where false$$, 'Expired session cannot update profile');

reset role;
update auth.sessions set not_after = null
where id = '88000000-0000-4000-8000-000000000011';
update auth.users set email_confirmed_at = null
where id = '88000000-0000-4000-8000-000000000001';
set local role authenticated;
select ok(not public.has_active_session(), 'Unconfirmed account is rejected');
select is((select count(*) from public.profiles), 0::bigint, 'Unconfirmed account cannot read profiles');

reset role;
update auth.users set email_confirmed_at = now()
where id = '88000000-0000-4000-8000-000000000001';
delete from auth.sessions where id = '88000000-0000-4000-8000-000000000011';
set local role authenticated;
select ok(not public.has_active_session(), 'Deleted session is rejected despite unchanged JWT claims');
select is((select count(*) from public.profiles), 0::bigint, 'Revoked session cannot read profiles');
select set_config('request.jwt.claims', '{"sub":"88000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select ok(not public.has_active_session(), 'Missing session claim is rejected');
select set_config('request.jwt.claims', '{"sub":"88000000-0000-4000-8000-000000000001","session_id":"invalid","role":"authenticated"}', true);
select ok(not public.has_active_session(), 'Malformed session claim is rejected without a cast error');

reset role;
select ok(not has_function_privilege('anon', 'public.has_active_session()', 'execute'), 'Anonymous role cannot call session probe');
select ok(not has_table_privilege('authenticated', 'auth.sessions', 'select'), 'User role cannot inspect session records');
select * from finish();
rollback;
