import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { delegateOccurrence } from "@/server/occurrences/delegation";
import { publicTaskOrigin } from "@/server/occurrences/task-origin";
import { commandBody } from "@/server/occurrences/commands";
import { parseOccurrenceDetail } from "@/server/occurrences/detail.contract";
import { occurrenceDetailFixture } from "../../fixtures/occurrence-detail";

const { rpc, createClient, getClaims } = vi.hoisted(() => ({
  rpc: vi.fn(),
  createClient: vi.fn(),
  getClaims: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
vi.mock("@/lib/supabase/config", () => ({
  getSupabaseConfig: () => ({ url: "http://127.0.0.1:54321" }),
}));
const code = "d".repeat(64);
const body = {
  key: "72000000-0000-4000-8000-000000000001",
  version: 0,
  payload: {
    employeeId: "72000000-0000-4000-8000-000000000002",
    message: "Mensagem sintética",
  },
};
const client = { auth: { getClaims } } as unknown as SupabaseClient<Database>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-server-key");
  getClaims.mockResolvedValue({
    data: { claims: { sub: "verified-actor", session_id: "verified-session" } },
    error: null,
  });
  createClient.mockReturnValue({ rpc });
  rpc.mockResolvedValue({ data: null, error: null });
});
afterEach(() => vi.unstubAllEnvs());

test.each([
  "http://127.0.0.1:3100",
  "https://tarefas.example.invalid",
  "https://tarefas.example.invalid/",
])("uses trusted configured origin %s", async (origin) => {
  vi.stubEnv("PUBLIC_APP_ORIGIN", origin);
  await delegateOccurrence(client, "synthetic-occurrence", body);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("delegate_occurrence", {
    target_occurrence: "synthetic-occurrence",
    command_key: body.key,
    expected_version: 0,
    payload: body.payload,
    public_origin: new URL(origin).origin,
    actor_profile: "verified-actor",
    actor_session: "verified-session",
  });
  expect(createClient.mock.calls[0][1]).toBe("synthetic-server-key");
});

test.each([
  "",
  "invalid",
  "javascript:alert(1)",
  "https://user:pass@example.invalid",
  "https://example.invalid/path",
  "https://example.invalid?x=1",
  "https://example.invalid#hash",
  " https://example.invalid",
  "https://example.invalid\\evil",
  "http://[",
])(
  "rejects invalid configuration %s without falling back to a domain",
  async (origin) => {
    vi.stubEnv("PUBLIC_APP_ORIGIN", origin);
    expect(publicTaskOrigin()).toBeNull();
    await delegateOccurrence(client, "synthetic-occurrence", body);
    expect(rpc.mock.calls[0][1].public_origin).toBeUndefined();
  },
);

test("rejects unverified claims before creating a privileged client", async () => {
  getClaims.mockResolvedValue({ data: null, error: new Error("invalid") });
  await expect(
    delegateOccurrence(client, "synthetic-occurrence", body),
  ).rejects.toThrow();
  expect(createClient).not.toHaveBeenCalled();
});

test.each(["origin", "publicOrigin", "public_origin", "url"])(
  "browser cannot provide %s",
  (field) => {
    expect(() =>
      commandBody({
        ...body,
        type: "delegate",
        payload: { ...body.payload, [field]: "https://untrusted.invalid" },
      }),
    ).toThrow();
  },
);

test.each(["http://127.0.0.1:3100", "https://tarefas.example.invalid"])(
  "receipt accepts absolute task URL from %s",
  (origin) => {
    const url = `${origin}/t/${code}`;
    const delegation = {
      code,
      url,
      message: `${body.payload.message}\nAbra o link para mandar recado ou concluir com foto: ${url}`,
    };
    expect(
      parseOccurrenceDetail({ ...occurrenceDetailFixture(), delegation })
        .delegation,
    ).toEqual(delegation);
  },
);

test.each([
  "https://example.invalid/t/wrong",
  `https://user:pass@example.invalid/t/${code}`,
  `javascript:alert(1)`,
  `/t/${code}`,
  `https://example.invalid/t/${code}?extra=1`,
])("receipt rejects invalid task URL %s", (url) => {
  expect(() =>
    parseOccurrenceDetail({
      ...occurrenceDetailFixture(),
      delegation: {
        code,
        url,
        message: `Mensagem\nAbra o link para mandar recado ou concluir com foto: ${url}`,
      },
    }),
  ).toThrow();
});
