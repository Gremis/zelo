import { expect, test } from "@playwright/test";

test("invalid task code returns a generic uncached response without authentication", async ({
  request,
}) => {
  const response = await request.get("/api/public/tasks/codigoqualquer");
  expect(response.status()).toBe(404);
  expect(await response.json()).toEqual({
    error: "Não encontramos esta tarefa. Confira o link que você recebeu.",
  });
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");
});
