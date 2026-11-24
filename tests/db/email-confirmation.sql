\set ON_ERROR_STOP on
begin;
do $$
declare
  response jsonb;
  reservation jsonb;
  challenge uuid;
  iteration integer;
  attempt_ids uuid[] := '{}';
  lease uuid;
begin
  assert not has_schema_privilege('anon', 'private', 'usage');
  assert not has_schema_privilege('authenticated', 'private', 'usage');
  assert not has_table_privilege('service_role', 'private.email_confirmation_challenges', 'select');
  assert not has_function_privilege('anon', 'public.email_confirmation_guard(text,text,uuid,uuid,text)', 'execute');
  assert not has_function_privilege('authenticated', 'public.email_confirmation_guard(text,text,uuid,uuid,text)', 'execute');
  assert has_function_privilege('service_role', 'public.email_confirmation_guard(text,text,uuid,uuid,text)', 'execute');

  response := public.email_confirmation_guard('send', 'ori47-sql@example.invalid');
  assert response->>'status' = 'ok', 'Initial send reservation';
  challenge := (response->>'id')::uuid;
  perform public.email_confirmation_guard('sent', 'ori47-sql@example.invalid', challenge, (response->>'lease')::uuid, 'ok');
  response := public.email_confirmation_guard('send', 'ori47-sql@example.invalid');
  assert response->>'status' = 'rate_limited', 'Resend cooldown';
  response := public.email_confirmation_guard('reserve', 'other@example.invalid', challenge);
  assert response->>'status' = 'missing', 'Email binding';
  response := public.email_confirmation_guard('reserve', 'ori47-sql@example.invalid', gen_random_uuid());
  assert response->>'status' = 'missing', 'Registration binding';

  for iteration in 1..5 loop
    reservation := public.email_confirmation_guard('reserve', 'ori47-sql@example.invalid', challenge);
    assert reservation->>'status' = 'ok', 'Five reservations admitted';
    attempt_ids := array_append(attempt_ids, (reservation->>'lease')::uuid);
  end loop;
  response := public.email_confirmation_guard('reserve', 'ori47-sql@example.invalid', challenge);
  assert response->>'status' = 'rate_limited', 'Concurrent budget reserved';
  response := public.email_confirmation_guard('settle', 'ori47-sql@example.invalid', challenge, attempt_ids[1], 'error');
  assert response->>'status' = 'ok';
  reservation := public.email_confirmation_guard('reserve', 'ori47-sql@example.invalid', challenge);
  assert reservation->>'status' = 'ok', 'Transport failure refunds reservation';
  response := public.email_confirmation_guard('settle', 'ori47-sql@example.invalid', challenge, (reservation->>'lease')::uuid, 'invalid');
  assert response->>'status' = 'ok';
  for iteration in 2..5 loop
    response := public.email_confirmation_guard('settle', 'ori47-sql@example.invalid', challenge, attempt_ids[iteration], 'invalid');
  end loop;
  assert response->>'status' = 'blocked', 'Fifth incorrect code blocks';
  response := public.email_confirmation_guard('send', 'ori47-sql@example.invalid');
  assert response->>'status' = 'blocked', 'Resend cannot bypass block';
  response := public.email_confirmation_guard('reserve', 'ori47-sql@example.invalid', challenge);
  assert response->>'status' = 'blocked', 'Confirmation cannot bypass block';
  assert (select blocked_until > clock_timestamp() + interval '14 minutes' from private.email_confirmation_challenges where id = challenge);

  update private.email_confirmation_challenges set blocked_until = clock_timestamp() - interval '1 second', next_send_at = clock_timestamp() - interval '1 second' where id = challenge;
  response := public.email_confirmation_guard('reserve', 'ori47-sql@example.invalid', challenge);
  assert response->>'status' = 'expired', 'New code required after block';
  reservation := public.email_confirmation_guard('send', 'ori47-sql@example.invalid');
  perform public.email_confirmation_guard('sent', 'ori47-sql@example.invalid', challenge, (reservation->>'lease')::uuid, 'ok');
  assert (select failures = 0 and expires_at > clock_timestamp() + interval '14 minutes' from private.email_confirmation_challenges where id = challenge);

  reservation := public.email_confirmation_guard('reserve', 'ori47-sql@example.invalid', challenge);
  perform public.email_confirmation_guard('settle', 'ori47-sql@example.invalid', challenge, (reservation->>'lease')::uuid, 'invalid');
  update private.email_confirmation_challenges set next_send_at = '-infinity' where id = challenge;
  reservation := public.email_confirmation_guard('send', 'ori47-sql@example.invalid');
  perform public.email_confirmation_guard('sent', 'ori47-sql@example.invalid', challenge, (reservation->>'lease')::uuid, 'ok');
  assert (select failures = 1 from private.email_confirmation_challenges where id = challenge), 'Resend preserves failures';

  reservation := public.email_confirmation_guard('reserve', 'ori47-sql@example.invalid', challenge);
  perform public.email_confirmation_guard('settle', 'ori47-sql@example.invalid', challenge, (reservation->>'lease')::uuid, 'ok');
  response := public.email_confirmation_guard('reserve', 'ori47-sql@example.invalid', challenge);
  assert response->>'status' = 'expired', 'Successful challenge is consumed';

  update private.email_confirmation_challenges set requires_new_code = false, expires_at = clock_timestamp() - interval '1 second' where id = challenge;
  response := public.email_confirmation_guard('reserve', 'ori47-sql@example.invalid', challenge);
  assert response->>'status' = 'expired', 'Expired challenge rejected';
  raise notice 'ORI-47 SQL assertions passed';
end;
$$;
rollback;
