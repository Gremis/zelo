import {
  AuthSessionMissingError,
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { expect, expectTypeOf, test, vi } from "vitest";
import type {
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@/lib/supabase/database.types";

type GeneratedTable = Database["public"]["Tables"]["condominiums"];
type CreateInput = Pick<
  TablesInsert<"condominiums">,
  "name" | "address" | "manager_id"
> & {
  id?: never;
  slug?: never;
};
type UpdateInput = Pick<TablesUpdate<"condominiums">, "name" | "address"> & {
  id?: never;
  slug?: never;
  manager_id?: never;
};
type WriteDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: Omit<Database["public"]["Tables"], "condominiums"> & {
      condominiums: Omit<GeneratedTable, "Insert" | "Update"> & {
        Insert: CreateInput;
        Update: UpdateInput;
      };
    };
  };
};

async function createCondominium(
  client: SupabaseClient<WriteDatabase>,
  input: Pick<CreateInput, "name" | "address">,
) {
  const { data: identity, error } = await client.auth.getUser();
  if (error || !identity.user)
    throw error ?? new Error("Authenticated session required.");
  const payload: CreateInput = {
    name: input.name,
    address: input.address,
    manager_id: identity.user.id,
  };
  return client.from("condominiums").insert(payload).select().single();
}

const stored: Tables<"condominiums"> = {
  id: "29000000-0000-4000-8000-000000000099",
  name: "Synthetic condominium",
  address: "Synthetic street 100",
  manager_id: "29000000-0000-4000-8000-000000000001",
  slug: "synthetic-condominium-00000000000000000000000000000001",
};

function mockClient(response: Tables<"condominiums">) {
  const request = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(response), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }),
  );
  const client = createClient<WriteDatabase>(
    "http://127.0.0.1:54321",
    "synthetic-public-key",
    {
      global: { fetch: request },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  vi.spyOn(client.auth, "getUser").mockResolvedValue({
    data: {
      user: {
        id: stored.manager_id,
        aud: "authenticated",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-11-19T00:00:00.000Z",
      },
    },
    error: null,
  });
  return { client, request };
}

test("derives writable inputs without changing generated rows, relationships or other tables", () => {
  expectTypeOf<TablesInsert<"condominiums">["slug"]>().toEqualTypeOf<string>();
  expectTypeOf<CreateInput>().not.toExtend<TablesInsert<"condominiums">>();
  expectTypeOf<CreateInput["slug"]>().toEqualTypeOf<undefined>();
  expectTypeOf<CreateInput["id"]>().toEqualTypeOf<undefined>();
  expectTypeOf<UpdateInput["manager_id"]>().toEqualTypeOf<undefined>();
  expectTypeOf<
    WriteDatabase["public"]["Tables"]["condominiums"]["Row"]
  >().toEqualTypeOf<GeneratedTable["Row"]>();
  expectTypeOf<
    WriteDatabase["public"]["Tables"]["condominiums"]["Relationships"]
  >().toEqualTypeOf<GeneratedTable["Relationships"]>();
  expectTypeOf<WriteDatabase["public"]["Tables"]["profiles"]>().toEqualTypeOf<
    Database["public"]["Tables"]["profiles"]
  >();
});

test("the typed SDK sends creation without generated fields and returns the full row", async () => {
  const { client, request } = mockClient(stored);
  const result = await createCondominium(client, {
    name: stored.name,
    address: stored.address,
  });
  expect(request).toHaveBeenCalledOnce();
  expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({
    name: stored.name,
    address: stored.address,
    manager_id: stored.manager_id,
  });
  expect(result.error).toBeNull();
  expect(result.data).toEqual(stored);
  expectTypeOf(result.data).toEqualTypeOf<Tables<"condominiums"> | null>();
});

test("the typed SDK edits only the permitted fields", async () => {
  const { client, request } = mockClient({
    ...stored,
    name: "Renamed condominium",
  });
  const patch: UpdateInput = { name: "Renamed condominium" };
  const result = await client
    .from("condominiums")
    .update(patch)
    .eq("id", stored.id)
    .select()
    .single();
  expect(request.mock.calls[0][1]?.method).toBe("PATCH");
  expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual(patch);
  expect(result.error).toBeNull();
  expect(result.data?.slug).toBe(stored.slug);
});

test("creation requires an authenticated identity before sending a write", async () => {
  const { client, request } = mockClient(stored);
  vi.mocked(client.auth.getUser).mockResolvedValue({
    data: { user: null },
    error: new AuthSessionMissingError(),
  });
  await expect(
    createCondominium(client, { name: stored.name, address: stored.address }),
  ).rejects.toBeInstanceOf(AuthSessionMissingError);
  expect(request).not.toHaveBeenCalled();
});
