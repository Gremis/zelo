import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { TASK_CODE_PATTERN } from "@/lib/occurrences/task-link";
import { parseEmployeeTask, type EmployeeTask } from "./task.contract";

export class TaskLookupError extends Error {
  constructor() {
    super("Employee task could not be loaded.");
    this.name = "TaskLookupError";
  }
}

export async function loadEmployeeTask(
  code: string,
): Promise<EmployeeTask | null> {
  if (!TASK_CODE_PATTERN.test(code)) return null;
  try {
    const { url, anonKey } = getSupabaseConfig();
    const client = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            cache: "no-store",
            signal: AbortSignal.timeout(15000),
          }),
      },
    });
    const { data, error } = await client.rpc("employee_task", {
      p_code: code,
    });
    if (error) throw new TaskLookupError();
    if (data === null) return null;
    return parseEmployeeTask(data);
  } catch (error) {
    if (error instanceof TaskLookupError) throw error;
    throw new TaskLookupError();
  }
}
