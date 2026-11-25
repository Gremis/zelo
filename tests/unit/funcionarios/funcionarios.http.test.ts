import { describe, expect, it } from "vitest";
import {
  handleJson,
  toResponse,
} from "@/server/funcionarios/funcionarios.http";
import {
  type FuncionarioErrorCode,
  failure,
  success,
} from "@/server/funcionarios/funcionarios.result";

function postJson(body: string): Request {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("funcionarios http toResponse", () => {
  it("returns the data with the success status", async () => {
    const res = toResponse(success({ ok: 1 }), 201);

    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(res.headers.get("pragma")).toBe("no-cache");
    expect(res.headers.get("expires")).toBe("0");
    expect(await res.json()).toEqual({ ok: 1 });
  });

  const cases: [FuncionarioErrorCode, number][] = [
    ["invalid_body", 400],
    ["invalid_input", 400],
    ["not_authenticated", 401],
    ["forbidden", 403],
    ["funcionario_not_found", 404],
    ["celular_already_registered", 409],
    ["unknown", 500],
  ];

  it.each(cases)("maps %s to HTTP %i", async (code, status) => {
    const res = toResponse(failure({ code, message: "mensagem" }));

    expect(res.status).toBe(status);
    expect(res.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect((await res.json()).error).toBe("mensagem");
  });
});

describe("funcionarios http handleJson", () => {
  it("returns 400 when the body is not valid JSON", async () => {
    const res = await handleJson(postJson("{nope"), async () => success({}));

    expect(res.status).toBe(400);
  });

  it("returns 500 unknown when the handler throws", async () => {
    const res = await handleJson(postJson("{}"), async () => {
      throw new Error("boom");
    });

    expect(res.status).toBe(500);
  });

  it("passes the parsed body and honors the success status", async () => {
    let received: unknown;

    const res = await handleJson(
      postJson('{"a":1}'),
      async (body) => {
        received = body;
        return success({ done: true });
      },
      201,
    );

    expect(received).toEqual({ a: 1 });
    expect(res.status).toBe(201);
  });
});
