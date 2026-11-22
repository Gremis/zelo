import { beforeEach, expect, test, vi } from "vitest";
import { GET } from "@/app/api/occurrences/queue/route";
import { loadPortfolioQueue } from "@/server/occurrences/queue.service";
import {
  parsePortfolioQueue,
  type PortfolioQueue,
  type QueueCard,
} from "@/server/occurrences/queue.contract";

const identity = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/identity", () => ({ confirmedIdentity: identity }));
const rpc = vi.fn();
const empty = (): PortfolioQueue => ({
  columns: {
    new: { count: 0, items: [] },
    in_progress: { count: 0, items: [] },
    delegated: { count: 0, items: [] },
    completed: { count: 0, items: [] },
  },
  openByPriority: { urgent: 0, normal: 0, low: 0, unclassified: 0 },
});
const card: QueueCard = {
  id: "75000000-0000-4000-8000-000000000001",
  number: 1,
  status: "new",
  condominium: {
    id: "75000000-0000-4000-8000-000000000002",
    name: "Synthetic condominium",
  },
  reporterUnitOrRole: "Synthetic unit",
  description: "Synthetic report",
  location: null,
  suggestedPriority: "urgent",
  finalPriority: "low",
  effectivePriority: "low",
  suggestionReason: "Menciona gás: risco à segurança.",
  suggestionSource: "rules",
  suggestionPending: false,
  reporterName: "Synthetic reporter",
  registeredAt: "2026-01-01T00:00:00Z",
  completedAt: null,
};
const filled = () => {
  const value = empty();
  value.columns.new = { count: 1, items: [{ ...card }] };
  value.openByPriority.low = 1;
  return value;
};

beforeEach(() => {
  vi.resetAllMocks();
  identity.mockResolvedValue({
    supabase: { rpc },
    user: { id: "server-user" },
  });
  rpc.mockResolvedValue({ data: empty(), error: null });
});

test("reads exactly one parameterless RPC through the supplied session client", async () => {
  expect(await loadPortfolioQueue({ rpc })).toEqual(empty());
  expect(rpc).toHaveBeenCalledExactlyOnceWith("portfolio_occurrence_queue");
});

test("keeps final priority, original suggestion and explicitly unclassified legacy rows", () => {
  expect(parsePortfolioQueue(filled()).columns.new.items[0]).toEqual(card);
  const legacy = filled();
  Object.assign(legacy.columns.new.items[0], {
    suggestedPriority: null,
    finalPriority: null,
    effectivePriority: null,
    suggestionReason: null,
    suggestionSource: null,
    suggestionPending: false,
  });
  legacy.openByPriority = { urgent: 0, normal: 0, low: 0, unclassified: 1 };
  expect(parsePortfolioQueue(legacy)).toEqual(legacy);
});

test("projects away unexpected sensitive fields instead of echoing database payloads", () => {
  const data = filled();
  Object.assign(data.columns.new.items[0], {
    tracking_code: "secret",
    reporterPhone: "secret",
    internal_note: "secret",
    events: ["secret"],
  });
  Object.assign(data.columns.new.items[0].condominium, {
    manager_id: "secret",
  });
  expect(JSON.stringify(parsePortfolioQueue(data))).not.toContain("secret");
});

test.each([
  null,
  {},
  { ...empty(), columns: {} },
  { ...empty(), openByPriority: { urgent: -1 } },
  { ...empty(), columns: { ...empty().columns, new: { count: 1, items: [] } } },
  {
    ...filled(),
    openByPriority: { urgent: 1, normal: 0, low: 0, unclassified: 0 },
  },
])(
  "rejects malformed, incomplete or inconsistent queue payload %#",
  (value) => {
    expect(() => parsePortfolioQueue(value)).toThrow();
  },
);

test.each([
  { effectivePriority: "normal" },
  { status: "completed" },
  { number: Number.MAX_SAFE_INTEGER + 1 },
  { registeredAt: "invalid" },
  { suggestionSource: "unknown" },
  { suggestionPending: null },
])("rejects invalid card fields %#", (fields) => {
  const data = filled();
  Object.assign(data.columns.new.items[0], fields);
  expect(() => parsePortfolioQueue(data)).toThrow();
});

test("HTTP success and every error response are private and never cached", async () => {
  const response = await GET(
    new Request("http://localhost/api/occurrences/queue"),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(empty());
  expect(response.headers.get("cache-control")).toBe(
    "private, no-store, max-age=0",
  );
  expect(response.headers.get("pragma")).toBe("no-cache");
});

test("does not accept a client-selected portfolio or any unsupported query parameter", async () => {
  const response = await GET(
    new Request("http://localhost/api/occurrences/queue?manager_id=other"),
  );
  expect(response.status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});

test("unauthenticated requests never reach the queue RPC", async () => {
  identity.mockResolvedValue(null);
  const response = await GET(
    new Request("http://localhost/api/occurrences/queue"),
  );
  expect(response.status).toBe(401);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(rpc).not.toHaveBeenCalled();
});

test.each([
  ["28000", 401],
  ["42501", 403],
  ["XX000", 503],
])(
  "maps database %s to HTTP %s without provider details",
  async (code, status) => {
    rpc.mockResolvedValue({
      data: null,
      error: { code, message: "secret database details" },
    });
    const response = await GET(
      new Request("http://localhost/api/occurrences/queue"),
    );
    expect(response.status).toBe(status);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
    expect(response.headers.get("cache-control")).toContain("no-store");
  },
);

test("infrastructure and invalid payloads yield a sanitized 503", async () => {
  rpc.mockRejectedValue(new Error("secret transport error"));
  await expect(loadPortfolioQueue({ rpc })).rejects.toMatchObject({
    status: 503,
    message: "Portfolio queue unavailable.",
  });
  identity.mockRejectedValue(new Error("secret identity infrastructure"));
  const response = await GET(
    new Request("http://localhost/api/occurrences/queue"),
  );
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain("secret");
});
