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

test("task page separates invalid codes and applies privacy headers", async ({
  page,
}) => {
  const response = await page.goto("/t/codigoqualquer");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Não encontramos esta tarefa. Confira o link que você recebeu.",
  );
  await expect(page.getByRole("button")).toHaveCount(0);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
});

test("completed task summary is restricted and fits a 360px viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const code = "d".repeat(64);
  await page.route(`**/api/public/tasks/${code}`, async (route) => {
    await route.fulfill({
      json: {
        condominiumName: "Condomínio Sintético",
        number: 105,
        description: "Lâmpada do hall apagada",
        location: "Hall",
        reporterName: "Pessoa Sintética",
        reporterUnitOrRole: "101",
        registeredAt: "2026-11-25T10:00:00Z",
        startedAt: null,
        completedAt: "2026-11-25T12:00:00Z",
        status: "completed",
        reporterPhone: "private-phone",
        trackingCode: "private-tracking",
        events: ["private-note"],
      },
    });
  });
  await page.goto(`/t/${code}`);
  await expect(
    page.getByRole("heading", { name: "Tarefa concluída" }),
  ).toBeVisible();
  await expect(page.getByText("Pessoa Sintética · 101")).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(0);
  await expect(page.getByText(/private-/)).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
