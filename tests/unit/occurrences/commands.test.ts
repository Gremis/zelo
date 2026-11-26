import { expect, test, vi, beforeEach } from "vitest";
import {
  commandBody,
  runOccurrenceCommand,
} from "@/server/occurrences/commands";
import { POST } from "@/app/api/occurrences/[id]/commands/route";
import { occurrenceDetailFixture } from "../../fixtures/occurrence-detail";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
vi.mock("server-only", () => ({}));
const identity = vi.hoisted(() => vi.fn());
const delegate = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/identity", () => ({ confirmedIdentity: identity }));
vi.mock("@/server/occurrences/delegation", () => ({
  delegateOccurrence: delegate,
}));
const body = {
  key: "72000000-0000-4000-8000-000000000001",
  version: 0,
  type: "responsible",
  payload: { kind: "manager" },
};
const rpc = vi.fn();
const client = { rpc } as unknown as SupabaseClient<Database>;
beforeEach(() => {
  vi.resetAllMocks();
  identity.mockResolvedValue({ supabase: client, user: { id: "server-only" } });
  rpc.mockResolvedValue({ data: occurrenceDetailFixture(), error: null });
  delegate.mockResolvedValue({ data: occurrenceDetailFixture(), error: null });
});
test.each([
  null,
  {},
  { ...body, version: -1 },
  { ...body, key: "bad" },
  { ...body, payload: { kind: "manager", actorId: "spoof" } },
  { ...body, type: "complete", payload: { uploadKey: "missing-secret" } },
])("rejects malformed or forged command %#", (value) =>
  expect(() => commandBody(value)).toThrow(),
);
test.each([
  ["42501", 404],
  ["P0003", 409],
  ["22023", 400],
  ["22008", 400],
  ["XX000", 503],
])("sanitizes database failure %s", async (code, status) => {
  rpc.mockResolvedValue({ error: { code }, data: null });
  await expect(
    runOccurrenceCommand(client, occurrenceDetailFixture().id, body),
  ).rejects.toMatchObject({ status });
});
test("session actor is implicit and only validated command fields reach RPC", async () => {
  const id = occurrenceDetailFixture().id;
  await runOccurrenceCommand(client, id, body);
  expect(rpc).toHaveBeenCalledWith("occurrence_command", {
    target_occurrence: id,
    command_key: body.key,
    expected_version: 0,
    command_type: "responsible",
    payload: { kind: "manager" },
  });
});
test("delegation keeps the trusted server path instead of the generic command RPC", async () => {
  const id = occurrenceDetailFixture().id;
  const input = {
    ...body,
    type: "delegate",
    payload: { employeeId: id, message: "Mensagem sintética" },
  };
  await runOccurrenceCommand(client, id, input);
  expect(delegate).toHaveBeenCalledExactlyOnceWith(client, id, input);
  expect(rpc).not.toHaveBeenCalled();
});
test("unauthenticated route cannot invoke the command", async () => {
  identity.mockResolvedValue(null);
  expect(
    (
      await POST(
        new Request("http://localhost/api/occurrences/id/commands", {
          method: "POST",
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: occurrenceDetailFixture().id }) },
      )
    ).status,
  ).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
});
test("route rejects cross-origin writes", async () => {
  expect(
    (
      await POST(
        new Request("http://localhost/api/occurrences/id/commands", {
          method: "POST",
          headers: { Origin: "https://other.invalid" },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: occurrenceDetailFixture().id }) },
      )
    ).status,
  ).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});

test("reopening dispatches to its explicit authorized RPC without allowing actor fields", async () => {
  await runOccurrenceCommand(client, occurrenceDetailFixture().id, {
    ...body,
    type: "reopen",
    payload: { reason: "Internal recurrence" },
  });
  expect(rpc).toHaveBeenCalledWith("reopen_occurrence", {
    target_occurrence: occurrenceDetailFixture().id,
    command_key: body.key,
    expected_version: 0,
    reason: "Internal recurrence",
  });
  expect(delegate).not.toHaveBeenCalled();
  expect(() =>
    commandBody({
      ...body,
      type: "reopen",
      payload: { reason: "Private", actorId: "forged" },
    }),
  ).toThrow();
});
