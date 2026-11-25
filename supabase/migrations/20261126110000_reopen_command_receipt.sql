begin;

create or replace function public.reopen_occurrence(target_occurrence uuid,command_key uuid,expected_version bigint,reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.occurrences%rowtype; actor uuid; prior private.occurrence_commands%rowtype; canonical jsonb; command_receipt jsonb; normalized_reason text;
begin
 if auth.role() is distinct from 'authenticated' or not public.has_active_session() then raise exception using errcode='42501',message='Active session required.'; end if;
 select p.id into actor from public.profiles p where p.id=auth.uid() and p.is_sindico for share;
 if actor is null then raise exception using errcode='42501',message='Manager required.'; end if;
 if command_key is null or expected_version is null or expected_version<0 or length(coalesce(reason,''))>10000 then raise exception using errcode='22023',message='Invalid reopening command.'; end if;
 normalized_reason:=nullif(regexp_replace(reason,'^[[:space:]]+|[[:space:]]+$','','g'),'');
 select o.* into target from public.occurrences o join public.condominiums c on c.id=o.condominium_id where o.id=target_occurrence and c.manager_id=actor for update of o;
 if not found then raise exception using errcode='42501',message='Occurrence unavailable.'; end if;
 canonical:=jsonb_build_object('type','reopen','payload',jsonb_build_object('reason',normalized_reason),'version',expected_version);
 select * into prior from private.occurrence_commands c where c.occurrence_id=target.id and c.command_key=reopen_occurrence.command_key;
 if found then
  if prior.actor_id<>actor or prior.payload<>canonical then raise exception using errcode='P0003',message='Command key conflict.'; end if;
  return prior.receipt;
 end if;
 if target.status<>'completed' or target.version<>expected_version then raise exception using errcode='P0003',message='Occurrence changed.'; end if;
 insert into public.occurrence_completions(occurrence_id,completed_at) values(target.id,target.completed_at) on conflict(occurrence_id,completed_at) do nothing;
 insert into private.occurrence_commands values(target.id,command_key,actor,canonical,'{}'::jsonb);
 update public.occurrences set status='new',completed_at=null,responsible_kind=null,responsible_profile_id=null,responsible_employee_id=null,responsible_name=null,responsible_phone=null,responsible_role=null,due_at=null,due_date=null,delegation_started_at=null where id=target.id;
 perform private.append_occurrence_event(target.id,'reopened','Reabriu a ocorrência'||case when normalized_reason is null then '' else '. '||normalized_reason end,jsonb_build_object('reason',normalized_reason,'previousCompletedAt',target.completed_at,'previousResponsibleName',target.responsible_name,'previousDueDate',target.due_date,'previousDelegationStartedAt',target.delegation_started_at));
 command_receipt:=public.occurrence_detail(target.id);
 update private.occurrence_commands c set receipt=command_receipt where c.occurrence_id=target.id and c.command_key=reopen_occurrence.command_key;
 return command_receipt;
end;
$$;
revoke all on function public.reopen_occurrence(uuid,uuid,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.reopen_occurrence(uuid,uuid,bigint,text) to authenticated;

commit;
