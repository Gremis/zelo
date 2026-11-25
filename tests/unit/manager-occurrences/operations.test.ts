import { afterEach, expect, test, vi } from "vitest";
import type { ManagerRegistrationFields } from "@/lib/manager-occurrences/contract";
import { createManagerOccurrenceOperations } from "@/lib/manager-occurrences/operations";

const api = createManagerOccurrenceOperations();
const trackingCode = "a".repeat(64);
const fields: ManagerRegistrationFields = {
  condominiumId: "11111111-1111-4111-8111-111111111111",
  channel: "whatsapp",
  location: "Garagem",
  description: "Vazamento",
  reporterName: "",
  reporterPhone: "",
  reporterUnitOrRole: "",
};

afterEach(() => vi.unstubAllGlobals());

test("loadCondominiums projeta apenas id e nome", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        condominiums: [
          { id: "a", name: "Cond A", address: "x", slug: "s", url: "u" },
        ],
      }),
    ),
  );
  expect(await api.loadCondominiums()).toEqual({
    ok: true,
    data: [{ id: "a", name: "Cond A" }],
  });
});

test("loadCondominiums distingue 401 e indisponível", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({}, { status: 401 })),
  );
  expect(await api.loadCondominiums()).toEqual({
    ok: false,
    error: "unauthorized",
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({}, { status: 503 })),
  );
  expect(await api.loadCondominiums()).toEqual({
    ok: false,
    error: "unavailable",
  });
});

test("register faz POST autenticado em /api/occurrences e aceita só o recibo", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(Response.json({ number: 7, trackingCode }));
  vi.stubGlobal("fetch", fetcher);
  expect(await api.register(fields)).toEqual({
    ok: true,
    number: 7,
    trackingCode,
  });
  expect(fetcher).toHaveBeenCalledWith(
    "/api/occurrences",
    expect.objectContaining({ method: "POST", credentials: "same-origin" }),
  );
});

test.each([
  [401, "unauthorized"],
  [404, "not_found"],
] as const)("register mapeia HTTP %i", async (status, expected) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({}, { status })),
  );
  expect(await api.register(fields)).toEqual({ ok: false, error: expected });
});

test("register trata 400 como invalid_input", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ error: "x" }, { status: 400 })),
  );
  expect(await api.register(fields)).toEqual({
    ok: false,
    error: "invalid_input",
    fields: {},
  });
});

test("register vira 'uncertain' quando o recibo é inválido", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ number: 0, trackingCode: "bad" })),
  );
  expect(await api.register(fields)).toEqual({ ok: false, error: "uncertain" });
});
