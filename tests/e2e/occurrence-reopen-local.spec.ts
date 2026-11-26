import { randomUUID } from "node:crypto";
import { test, expect } from "./local-auth";
import { localSql } from "./local-database";

test.skip(
  process.env.ORI91_LOCAL_TESTS !== "enabled",
  "Local reopening opt-in required.",
);
for (const width of [360, 1280])
  for (const withReason of [false, true]) {
    test(`reopening ${withReason ? "with" : "without"} reason at ${width}px preserves history and supports a new completion`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const condoResponse = await page.request.post("/api/condominiums", {
        data: {
          name: "Condomínio Sintético ORI91",
          address: "Endereço sintético",
        },
      });
      expect(condoResponse.status()).toBe(201);
      const condo = (await condoResponse.json()).condominium;
      const id = randomUUID();
      localSql(
        `insert into public.occurrences(id,condominium_id,origin,channel,description,suggested_priority,suggestion_source,suggestion_at,suggestion_reason) values('${id}','${condo.id}','manager_panel','web','Ocorrência sintética reabertura','normal','rules',now(),'Synthetic priority');`,
      );
      const detail = async () =>
        await (await page.request.get(`/api/occurrences/${id}`)).json();
      for (const [type, payload] of [
        ["responsible", { kind: "manager" }],
        ["deadline", { date: "2027-05-12" }],
        ["complete", { comment: "Conclusão sintética anterior" }],
      ] as const) {
        const current = await detail();
        const response = await page.request.post(
          `/api/occurrences/${id}/commands`,
          {
            data: {
              key: randomUUID(),
              version: current.version,
              type,
              payload,
            },
          },
        );
        expect(response.status()).toBe(200);
      }
      const before = await detail();
      let writes = 0;
      await page.route(`**/api/occurrences/${id}/commands`, (route) => {
        writes++;
        return route.continue();
      });
      await page.goto("/fila");
      const completedTab = page.getByRole("tab", { name: /Concluído/ });
      if (width <= 1000) {
        await expect(completedTab).toBeVisible();
        await completedTab.click();
      }
      await page
        .getByRole("button", { name: `Abrir ocorrência #${before.number}` })
        .click();
      const card = page.getByRole("dialog", {
        name: "Ocorrência sintética reabertura",
        exact: true,
      });
      const trigger = card.getByRole("button", {
        name: "Reabrir",
        exact: true,
      });
      await expect(trigger).toBeVisible();
      const actionBox = await trigger.boundingBox();
      const closeBox = await card
        .getByRole("button", { name: "Fechar", exact: true })
        .boundingBox();
      expect(Math.abs(actionBox!.y - closeBox!.y)).toBeLessThan(2);
      expect(actionBox!.x + actionBox!.width).toBeLessThan(closeBox!.x);

      await expect(
        card.getByRole("button", { name: "Concluir ocorrência", exact: true }),
      ).toHaveCount(0);
      await trigger.click();
      let confirmation = page.getByRole("dialog", {
        name: `Reabrir #${before.number}?`,
        exact: true,
      });
      await expect(confirmation.getByLabel("Motivo (opcional)")).toBeFocused();
      await confirmation
        .getByLabel("Motivo (opcional)")
        .fill("Rascunho interno cancelado");
      await confirmation.getByRole("button", { name: "Cancelar" }).click();
      await expect(trigger).toBeFocused();
      expect(writes).toBe(0);
      expect((await detail()).version).toBe(before.version);
      await trigger.click();
      confirmation = page.getByRole("dialog", {
        name: `Reabrir #${before.number}?`,
        exact: true,
      });
      await confirmation.getByLabel("Motivo (opcional)").press("Escape");
      await expect(confirmation).toHaveCount(0);
      await expect(card).toBeVisible();
      await expect(trigger).toBeFocused();
      expect(writes).toBe(0);
      await trigger.click();
      confirmation = page.getByRole("dialog", {
        name: `Reabrir #${before.number}?`,
        exact: true,
      });
      if (withReason)
        await confirmation
          .getByLabel("Motivo (opcional)")
          .fill("  O morador avisou que voltou a vazar  ");
      await confirmation
        .getByRole("button", { name: "Reabrir", exact: true })
        .click();
      await expect(confirmation).toHaveCount(0);
      await expect(card.getByLabel("Responsável", { exact: true })).toHaveValue(
        "",
      );
      const reopened = await detail();
      expect(reopened.status).toBe("new");
      expect(reopened.completedAt).toBeNull();
      expect(reopened.responsibleName).toBeNull();
      expect(reopened.dueDate).toBeNull();
      expect(reopened.finalPriority).toBe(before.finalPriority);
      expect(reopened.firstResponsibleAt).toBe(before.firstResponsibleAt);
      expect(reopened.events[0].text).toBe(
        withReason
          ? "Reabriu a ocorrência. O morador avisou que voltou a vazar"
          : "Reabriu a ocorrência",
      );
      expect(reopened.events.slice(1)).toEqual(before.events);
      expect(writes).toBe(1);
      await card
        .getByLabel("Responsável", { exact: true })
        .selectOption("manager");
      await expect(
        card.getByRole("button", { name: "Concluir ocorrência", exact: true }),
      ).toBeVisible();
      await card
        .getByRole("button", { name: "Concluir ocorrência", exact: true })
        .click();
      await card.getByRole("button", { name: "Confirmar conclusão" }).click();
      await expect(
        card.getByRole("button", { name: "Reabrir", exact: true }),
      ).toBeVisible();
      const after = await detail();
      expect(after.status).toBe("completed");
      expect(after.completedAt).not.toBe(before.completedAt);
      expect(
        after.events.filter(
          (event: { type: string }) => event.type === "completed",
        ),
      ).toHaveLength(2);
      const completions = JSON.parse(
        localSql(
          `select json_agg(completed_at order by completed_at) from public.occurrence_completions where occurrence_id='${id}'`,
        ),
      ) as string[];
      expect(completions).toHaveLength(2);
      expect(Date.parse(completions[0])).toBe(Date.parse(before.completedAt));
      expect(Date.parse(completions[1])).toBe(Date.parse(after.completedAt));
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
  }

test("a lost reopening response preserves the reason and retries one idempotent command", async ({
  page,
}) => {
  const created = await page.request.post("/api/condominiums", {
    data: {
      name: "Condomínio Sintético Recuperação ORI91",
      address: "Endereço sintético",
    },
  });
  expect(created.status()).toBe(201);
  const condo = (await created.json()).condominium;
  const id = randomUUID();
  localSql(
    `insert into public.occurrences(id,condominium_id,origin,channel,description) values('${id}','${condo.id}','manager_panel','web','Reabertura sintética recuperável');`,
  );
  const read = async () =>
    await (await page.request.get(`/api/occurrences/${id}`)).json();
  for (const [type, payload] of [
    ["responsible", { kind: "manager" }],
    ["complete", {}],
  ] as const) {
    const detail = await read();
    expect(
      (
        await page.request.post(`/api/occurrences/${id}/commands`, {
          data: { key: randomUUID(), version: detail.version, type, payload },
        })
      ).status(),
    ).toBe(200);
  }
  const completed = await read();
  await page.goto("/fila");
  await page
    .getByRole("button", { name: `Abrir ocorrência #${completed.number}` })
    .click();
  const card = page.getByRole("dialog", {
    name: "Reabertura sintética recuperável",
    exact: true,
  });
  await card.getByRole("button", { name: "Reabrir", exact: true }).click();
  const confirmation = page.getByRole("dialog", {
    name: `Reabrir #${completed.number}?`,
    exact: true,
  });
  await confirmation
    .getByLabel("Motivo (opcional)")
    .fill("Motivo interno preservado");
  const attempts: unknown[] = [];
  await page.route(`**/api/occurrences/${id}/commands`, async (route) => {
    attempts.push(route.request().postDataJSON());
    if (attempts.length === 1) {
      expect((await route.fetch()).status()).toBe(200);
      return route.abort("connectionreset");
    }
    return route.continue();
  });
  await confirmation
    .getByRole("button", { name: "Reabrir", exact: true })
    .click();
  await expect(confirmation.getByRole("alert")).toContainText(
    "Não foi possível confirmar",
  );
  await expect(confirmation.getByLabel("Motivo (opcional)")).toHaveValue(
    "Motivo interno preservado",
  );
  await confirmation
    .getByRole("button", { name: "Reabrir", exact: true })
    .click();
  await expect(confirmation).toHaveCount(0);
  expect(attempts).toHaveLength(2);
  expect(attempts[0]).toEqual(attempts[1]);
  const reopened = await read();
  expect(reopened.status).toBe("new");
  expect(
    reopened.events.filter(
      (event: { type: string }) => event.type === "reopened",
    ),
  ).toHaveLength(1);
});
