import { afterEach, expect, test, vi } from "vitest";
import { prepareAccountDemo } from "@/server/demo/prepare";
import data from "@/lib/demo/data.json";
import { detectRisk } from "@/lib/occurrences/risk-rules";

vi.mock("server-only", () => ({}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function enable() {
  vi.stubEnv("ACCOUNT_DEMO_ENABLED", "true");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-public");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-server");
}

test.each([undefined, "false", "TRUE", "1"])(
  "disabled configuration %s never touches the database",
  async (value) => {
    vi.stubEnv("ACCOUNT_DEMO_ENABLED", value);
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    expect(await prepareAccountDemo("synthetic-manager")).toEqual({
      status: "disabled",
    });
    expect(request).not.toHaveBeenCalled();
  },
);

test("unexpected ineligible responses surface a failure instead of an empty portfolio", async () => {
  enable();
  const request = vi.fn().mockResolvedValue(Response.json({ eligible: false }));
  vi.stubGlobal("fetch", request);
  await expect(prepareAccountDemo("synthetic-manager")).rejects.toThrow(
    "Demo preparation unavailable.",
  );
  expect(request).toHaveBeenCalledTimes(1);
});

test("shared examples use the real registration service and risk engine", async () => {
  enable();
  const registrations: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      const body = JSON.parse(options.body);
      if (body.fixtures)
        return Response.json({
          eligible: true,
          condominiums: [
            { key: "a", slug: "synthetic-a-ab12" },
            { key: "b", slug: "synthetic-b-cd34" },
          ],
        });
      registrations.push(body);
      return Response.json([
        { occurrence_id: "synthetic", number: 1, tracking_code: "synthetic" },
      ]);
    }),
  );
  expect(await prepareAccountDemo("synthetic-manager")).toEqual({
    status: "ready",
  });
  expect(registrations).toHaveLength(4);
  for (let index = 0; index < registrations.length; index++) {
    const input = registrations[index].registration as Record<string, unknown>;
    const fixture = data.DEMO_OCCURRENCES[index];
    const risk = detectRisk(fixture.location, fixture.description);
    expect(input).toMatchObject({
      location: fixture.location,
      description: fixture.description,
      suggestedPriority: risk.hasRisk ? "urgent" : "normal",
      suggestionReason: risk.hasRisk
        ? `Menciona ${risk.term}: risco à segurança.`
        : "Sem sinal de risco no relato.",
      suggestionSource: "rules",
    });
  }
});

test("a partial failure stops without reporting ready", async () => {
  enable();
  let calls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      calls++;
      if (calls === 1)
        return Response.json({
          eligible: true,
          condominiums: [
            { key: "a", slug: "synthetic-a-ab12" },
            { key: "b", slug: "synthetic-b-cd34" },
          ],
        });
      if (calls === 3) return new Response(null, { status: 503 });
      return Response.json([
        { occurrence_id: "synthetic", number: 1, tracking_code: "synthetic" },
      ]);
    }),
  );
  await expect(prepareAccountDemo("synthetic-manager")).rejects.toThrow(
    "Demo preparation unavailable.",
  );
  expect(calls).toBe(3);
});
