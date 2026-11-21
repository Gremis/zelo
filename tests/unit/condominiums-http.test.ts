import { afterEach, expect, test, vi } from "vitest";
import { confirmedIdentity } from "@/server/auth/identity";
import { handleCondominiums } from "@/server/condominiums/http";

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/identity", () => ({ confirmedIdentity: vi.fn() }));
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

const record = {
  id: "29000000-0000-4000-8000-000000000009",
  name: "Residencial São João",
  address: "Endereço sintético",
  slug: "sao-joao-ab12",
};

function identity() {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi
      .fn()
      .mockResolvedValue({ data: { is_sindico: true }, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: record, error: null }),
  };
  const created = {
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: record, error: null }),
  };
  const supabase = {
    from: vi.fn().mockReturnValue(query),
    rpc: vi.fn().mockReturnValue(created),
  };
  vi.mocked(confirmedIdentity).mockResolvedValue({
    user: { id: "synthetic-manager" },
    supabase,
  } as unknown as NonNullable<Awaited<ReturnType<typeof confirmedIdentity>>>);
  vi.stubEnv("PUBLIC_APP_ORIGIN", "http://127.0.0.1:3100");
  return { query, supabase };
}

test.each([record.name, record.name.normalize("NFD")])(
  "canonicalizes equivalent accented names before server-side slug generation: %s",
  async (name) => {
    const { supabase } = identity();
    const response = await handleCondominiums(
      new Request("http://127.0.0.1:3100/api/condominiums", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: ` ${name} `, address: record.address }),
      }),
    );
    expect(response.status).toBe(201);
    expect(supabase.rpc).toHaveBeenCalledWith("create_condominium", {
      p_name: record.name,
      p_address: record.address,
    });
    expect((await response.json()).condominium.url).toBe(
      `http://127.0.0.1:3100/c/${record.slug}`,
    );
  },
);

test("editing changes only name/address and keeps the existing slug in the configured public origin", async () => {
  const { query, supabase } = identity();
  vi.stubEnv("PUBLIC_APP_ORIGIN", "https://product.example.invalid");
  const response = await handleCondominiums(
    new Request("http://127.0.0.1:3100/api/condominiums", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Host: "untrusted.example.invalid",
      },
      body: JSON.stringify({
        name: record.name.normalize("NFD"),
        address: record.address,
      }),
    }),
    record.id,
  );
  expect(response.status).toBe(200);
  expect(query.update).toHaveBeenCalledWith({
    name: record.name,
    address: record.address,
  });
  expect(supabase.rpc).not.toHaveBeenCalled();
  expect((await response.json()).condominium).toMatchObject({
    slug: record.slug,
    url: `https://product.example.invalid/c/${record.slug}`,
  });
});

test.each([
  [
    {
      "Content-Type": "application/json",
      Origin: "https://untrusted.example.invalid",
    },
    403,
  ],
  [{ "Content-Type": "text/plain" }, 415],
] as const)(
  "rejects untrusted origins and non-JSON writes before mutations",
  async (headers, status) => {
    const { query, supabase } = identity();
    const response = await handleCondominiums(
      new Request("http://127.0.0.1:3100/api/condominiums", {
        method: "POST",
        headers,
        body: JSON.stringify({ name: record.name, address: record.address }),
      }),
    );
    expect(response.status).toBe(status);
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(query.update).not.toHaveBeenCalled();
  },
);

test("accepts the same browser origin when Next.js uses an internal request hostname", async () => {
  const { supabase } = identity();
  const response = await handleCondominiums(
    new Request("http://localhost:3100/api/condominiums", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Host: "127.0.0.1:3100",
        Origin: "http://127.0.0.1:3100",
      },
      body: JSON.stringify({ name: record.name, address: record.address }),
    }),
  );
  expect(response.status).toBe(201);
  expect(supabase.rpc).toHaveBeenCalledOnce();
});
