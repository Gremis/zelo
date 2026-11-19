create or replace function public.email_confirmation_guard(
  operation text,
  email_address text,
  registration_id uuid default null,
  lease_id uuid default null,
  outcome text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge private.email_confirmation_challenges%rowtype;
  attempt private.email_confirmation_attempts%rowtype;
  lease uuid;
  pending_count integer;
  guard_now timestamptz := clock_timestamp();
begin
  if email_address is null or length(email_address) > 254 then
    return jsonb_build_object('status', 'missing');
  end if;
  if operation = 'send' then
    insert into private.email_confirmation_challenges(email)
    values (lower(trim(email_address))) on conflict (email) do nothing;
  end if;
  select * into challenge from private.email_confirmation_challenges
    where email = lower(trim(email_address)) for update;
  if not found or (operation <> 'send' and challenge.id is distinct from registration_id) then
    return jsonb_build_object('status', 'missing');
  end if;
  delete from private.email_confirmation_attempts
    where challenge_id = challenge.id and created_at < guard_now - interval '60 seconds';

  if operation = 'send' then
    if challenge.blocked_until > guard_now then
      return jsonb_build_object('status', 'blocked');
    end if;
    if challenge.next_send_at > guard_now or exists (
      select 1 from private.email_confirmation_attempts where challenge_id = challenge.id
    ) then
      return jsonb_build_object('status', 'rate_limited');
    end if;
    lease := gen_random_uuid();
    update private.email_confirmation_challenges set
      next_send_at = guard_now + interval '60 seconds', send_lease = lease, send_started_at = guard_now
      where id = challenge.id;
    return jsonb_build_object('status', 'ok', 'id', challenge.id, 'lease', lease);
  elsif operation = 'sent' then
    if challenge.send_lease is distinct from lease_id then
      return jsonb_build_object('status', 'missing');
    end if;
    if outcome = 'ok' then
      update private.email_confirmation_challenges set
        generation = gen_random_uuid(), expires_at = guard_now + interval '15 minutes',
        failures = case when blocked_until is not null and blocked_until <= guard_now then 0 else failures end,
        blocked_until = null, requires_new_code = false,
        send_lease = null, send_started_at = null where id = challenge.id;
    else
      update private.email_confirmation_challenges set send_lease = null, send_started_at = null where id = challenge.id;
    end if;
    return jsonb_build_object('status', 'ok');
  elsif operation = 'reserve' then
    if challenge.blocked_until > guard_now then
      return jsonb_build_object('status', 'blocked');
    end if;
    if challenge.requires_new_code or challenge.expires_at is null or challenge.expires_at <= guard_now then
      return jsonb_build_object('status', 'expired');
    end if;
    if challenge.send_started_at > guard_now - interval '60 seconds' then
      return jsonb_build_object('status', 'rate_limited');
    end if;
    select count(*) into pending_count from private.email_confirmation_attempts where challenge_id = challenge.id;
    if challenge.failures + pending_count >= 5 then
      return jsonb_build_object('status', 'rate_limited');
    end if;
    insert into private.email_confirmation_attempts(challenge_id, generation)
      values (challenge.id, challenge.generation) returning id into lease;
    return jsonb_build_object('status', 'ok', 'id', challenge.id, 'lease', lease);
  elsif operation = 'settle' then
    delete from private.email_confirmation_attempts where id = lease_id and challenge_id = challenge.id
      returning * into attempt;
    if not found or attempt.generation <> challenge.generation then
      return jsonb_build_object('status', 'missing');
    end if;
    if outcome = 'invalid' then
      update private.email_confirmation_challenges set
        failures = least(failures + 1, 5),
        blocked_until = case when failures + 1 >= 5 then guard_now + interval '15 minutes' else blocked_until end,
        requires_new_code = requires_new_code or failures + 1 >= 5
        where id = challenge.id returning * into challenge;
      if challenge.failures >= 5 then return jsonb_build_object('status', 'blocked'); end if;
    elsif outcome = 'ok' then
      update private.email_confirmation_challenges set expires_at = null, requires_new_code = true where id = challenge.id;
      delete from private.email_confirmation_attempts where challenge_id = challenge.id;
    end if;
    return jsonb_build_object('status', 'ok');
  end if;
  return jsonb_build_object('status', 'missing');
end;
$$;
