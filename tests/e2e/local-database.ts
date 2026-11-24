import { execFileSync } from "node:child_process";

export function localSql(statement: string) {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== "http://127.0.0.1:54321")
    throw new Error("Only the project-local Supabase stack is permitted.");
  try {
    return execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "supabase_db_zelo-local",
        "psql",
        "-X",
        "-qAt",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      {
        input: statement,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    ).trim();
  } catch {
    throw new Error("Local synthetic fixture SQL failed.");
  }
}

export function removeLocalAccountData(id: string) {
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))
    throw new Error("Invalid local fixture account ID.");
  localSql(`begin;
    do $$ begin
      if not exists (select 1 from auth.users where id='${id}'::uuid and email like '%@example.invalid') then
        raise exception 'Synthetic local account required.';
      end if;
    end $$;
    delete from private.occurrence_commands where occurrence_id in (select o.id from public.occurrences o join public.condominiums c on c.id=o.condominium_id where c.manager_id='${id}'::uuid);
    delete from private.occurrence_upload_files where session_id in (select id from private.occurrence_upload_sessions where manager_id='${id}'::uuid);
    delete from private.occurrence_upload_sessions where manager_id='${id}'::uuid;
    delete from private.account_demo_occurrences where manager_id='${id}'::uuid;
    delete from private.account_demo_condominiums where manager_id='${id}'::uuid;
    delete from private.account_demo where manager_id='${id}'::uuid;
    delete from public.occurrence_attachments where occurrence_id in (select o.id from public.occurrences o join public.condominiums c on c.id=o.condominium_id where c.manager_id='${id}'::uuid);
    delete from public.occurrence_events where occurrence_id in (select o.id from public.occurrences o join public.condominiums c on c.id=o.condominium_id where c.manager_id='${id}'::uuid);
    delete from public.occurrences where condominium_id in (select id from public.condominiums where manager_id='${id}'::uuid);
    delete from public.funcionarios where sindico_id='${id}'::uuid;
    delete from public.condominiums where manager_id='${id}'::uuid;
    commit;`);
}
