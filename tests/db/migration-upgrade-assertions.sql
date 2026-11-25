begin;

do $$
declare source record; baseline_row jsonb; current_row jsonb;
begin
  for source in select * from private.migration_upgrade_snapshot loop
    for baseline_row in select value from jsonb_array_elements(source.rows) loop
      execute format('select to_jsonb(t) from public.%I t where id::text=$1',source.kind)
        into current_row using baseline_row->>'id';
      if current_row is null or not current_row @> baseline_row then
        raise exception 'Existing synthetic % row changed during upgrade.',source.kind;
      end if;
    end loop;
  end loop;
  if (select count(*) from public.funcoes where sindico_id='a1040000-0000-4000-8000-000000000001')<>3 then
    raise exception 'Existing manager did not receive default employee roles.';
  end if;
  if not exists(select 1 from public.occurrence_completions where occurrence_id='a1040000-0000-4000-8000-000000000022' and completed_at='2026-11-21 12:00Z') then
    raise exception 'Historical completion was not preserved.';
  end if;
  if (select due_date from public.occurrences where id='a1040000-0000-4000-8000-000000000021') is distinct from date '2026-12-10' then
    raise exception 'Existing deadline was not migrated.';
  end if;
end;
$$;

update public.profiles set is_sindico=true where id='a1040000-0000-4000-8000-000000000002';
do $$ begin
  if (select count(*) from public.funcoes where sindico_id='a1040000-0000-4000-8000-000000000002')<>3 then
    raise exception 'Role activation did not seed default employee roles.';
  end if;
end $$;

drop table private.migration_upgrade_snapshot;

commit;
