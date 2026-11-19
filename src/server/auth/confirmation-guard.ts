import "server-only";

import { getSupabaseConfig } from "@/lib/supabase/config";

export type GuardStatus =
  "ok" | "missing" | "blocked" | "expired" | "rate_limited";
export type GuardResult = { status: GuardStatus; id?: string; lease?: string };
export type GuardInput = {
  operation: "send" | "sent" | "reserve" | "settle";
  email: string;
  registrationId?: string;
  lease?: string;
  outcome?: "ok" | "invalid" | "error";
};
export type ConfirmationGuard = (input: GuardInput) => Promise<GuardResult>;

export const confirmationGuard: ConfirmationGuard = async (input) => {
  const { url } = getSupabaseConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Confirmation guard is not configured.");
  const response = await fetch(
    new URL("/rest/v1/rpc/email_confirmation_guard", url),
    {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        operation: input.operation,
        email_address: input.email,
        registration_id: input.registrationId,
        lease_id: input.lease,
        outcome: input.outcome,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) throw new Error("Confirmation guard is unavailable.");
  const result: unknown = await response.json();
  if (
    typeof result !== "object" ||
    result === null ||
    !("status" in result) ||
    !["ok", "missing", "blocked", "expired", "rate_limited"].includes(
      String(result.status),
    )
  )
    throw new Error("Invalid confirmation guard response.");
  return {
    status: result.status as GuardStatus,
    id: "id" in result && typeof result.id === "string" ? result.id : undefined,
    lease:
      "lease" in result && typeof result.lease === "string"
        ? result.lease
        : undefined,
  };
};
