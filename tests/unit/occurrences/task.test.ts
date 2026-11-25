import { beforeEach, expect, test, vi } from "vitest";
import { parseEmployeeTask } from "@/server/occurrences/task.contract";
import { loadEmployeeTask } from "@/server/occurrences/task.service";
import { GET } from "@/app/api/public/tasks/[code]/route";

const { rpc, createClient, config } = vi.hoisted(() => ({
  rpc: vi.fn(),
  createClient: vi.fn(),
  config: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
vi.mock("@/lib/supabase/config", () => ({ getSupabaseConfig: config }));
const code = "d".repeat(64);
const fixture = {
  condominiumName: "Condomínio Sintético",
  number: 104,
  description: "Relato sintético",
  location: "Hall",
  reporterName: "Pessoa Sintética",
  reporterUnitOrRole: "101",
  registeredAt: "2026-11-25T10:00:00Z",
  startedAt: null,
  completedAt: null,
  status: "pending",
};
beforeEach(() => {
  vi.resetAllMocks();
  config.mockReturnValue({
    url: "http://127.0.0.1:54321",
    anonKey: "synthetic-public-key",
  });
  createClient.mockReturnValue({ rpc });
  rpc.mockResolvedValue({ data: fixture, error: null });
});
test("lookup passes only the task code and strips internal fields", async () => {
  rpc.mockResolvedValue({
    data: {
      ...fixture,
      reporterPhone: "private",
      events: ["internal"],
      trackingCode: "a".repeat(64),
    },
    error: null,
  });
  expect(await loadEmployeeTask(code)).toEqual(fixture);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("employee_task", {
    p_code: code,
  });
  const clientOptions = createClient.mock.calls[0][2];
  expect(clientOptions.auth.persistSession).toBe(false);
});
test("malformed and unknown codes return the same generic response", async () => {
  const invalid = await GET(new Request("http://localhost"), {
    params: Promise.resolve({ code: "invalid" }),
  });
  expect(createClient).not.toHaveBeenCalled();
  rpc.mockResolvedValue({ data: null, error: null });
  const unknown = await GET(new Request("http://localhost"), {
    params: Promise.resolve({ code }),
  });
  expect(invalid.status).toBe(404);
  expect(unknown.status).toBe(404);
  expect(await invalid.json()).toEqual(await unknown.json());
  expect(unknown.headers.get("Cache-Control")).toContain("no-store");
});
test("provider diagnostics never reach the public response", async () => {
  rpc.mockResolvedValue({
    data: null,
    error: { message: "private diagnostics" },
  });
  const response = await GET(new Request("http://localhost"), {
    params: Promise.resolve({ code }),
  });
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private diagnostics");
});
test("task start and completion state follow task timestamps", () => {
  const startedAt = "2026-11-25T11:00:00Z",
    completedAt = "2026-11-25T12:00:00Z";
  expect(
    parseEmployeeTask({ ...fixture, startedAt, status: "started" }).status,
  ).toBe("started");
  expect(
    parseEmployeeTask({ ...fixture, completedAt, status: "completed" }).status,
  ).toBe("completed");
  expect(() => parseEmployeeTask({ ...fixture, completedAt })).toThrow();
});
