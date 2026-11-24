import { parseOccurrenceDetail } from "@/server/occurrences/detail.contract";
import { OccurrenceRequestError } from "./detail-request";

export type WorkflowCommand = {
  key: string;
  version: number;
  type: "responsible" | "delegate" | "deadline" | "complete";
  payload: Record<string, string | null>;
};
export type EligibleEmployee = {
  id: string;
  nome: string;
  celular: string;
  funcao: { nome: string } | null;
};
export async function workflowRequest(path: string, init: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new OccurrenceRequestError(503);
  }
  if (!response.ok)
    throw new OccurrenceRequestError(
      [400, 401, 403, 404, 409].includes(response.status)
        ? (response.status as 400 | 401 | 403 | 404 | 409)
        : 503,
    );
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new OccurrenceRequestError(503);
  }
}
export async function sendWorkflowCommand(
  id: string,
  command: WorkflowCommand,
) {
  return parseOccurrenceDetail(
    await workflowRequest(
      `/api/occurrences/${encodeURIComponent(id)}/commands`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      },
    ),
  );
}
export function whatsappUrl(phone: string, message: string) {
  const digits = phone.replace(/\D/g, "");
  const normalized =
    digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  if (!/^55\d{10,11}$/.test(normalized))
    throw new Error("Invalid employee phone.");
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
