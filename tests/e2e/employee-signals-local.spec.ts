import { randomUUID } from "node:crypto";
import { test, expect } from "./local-auth";
import { localSql } from "./local-database";

test.skip(
  process.env.ORI107_LOCAL_TESTS !== "enabled",
  "Local employee signals opt-in required.",
);
for (const width of [360, 1280]) {
  test(`employee queue signals and persisted displayed-message reading at ${width}px`, async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 900 });
    const created = await page.request.post("/api/condominiums", {
      data: {
        name: "Condomínio Sintético ORI107",
        address: "Endereço sintético",
      },
    });
    expect(created.status()).toBe(201);
    const condo = (await created.json()).condominium;
    const employeeResponse = await page.request.post("/api/funcionarios", {
      data: {
        nome: "Funcionário Sintético ORI107",
        celular: "11900000009",
        condominioId: condo.id,
        funcaoNome: "Função Sintética",
        horarioTrabalho: "00:00 às 00:01",
      },
    });
    expect(employeeResponse.status()).toBe(201);
    const employee = (await employeeResponse.json()).funcionario;
    const id = randomUUID();
    localSql(
      `insert into public.occurrences(id,condominium_id,origin,channel,description,location) values('${id}','${condo.id}','manager_panel','web','Ocorrência sintética ORI107','Hall sintético');`,
    );
    const delegated = await page.request.post(
      `/api/occurrences/${id}/commands`,
      {
        data: {
          key: randomUUID(),
          version: 0,
          type: "delegate",
          payload: {
            employeeId: employee.id,
            message: "Synthetic signals delegation",
          },
        },
      },
    );
    expect(delegated.status()).toBe(200);
    const code = (await delegated.json()).delegation.code;
    await page.goto("/fila");
    if (width === 360)
      await page.getByRole("tab", { name: /^Delegado / }).click();
    const card = page
      .getByRole("article")
      .filter({ hasText: "Ocorrência sintética ORI107" });
    await expect(card).toBeVisible();
    const context = await browser.newContext({
      viewport: { width: 360, height: 900 },
    });
    const worker = await context.newPage();
    let releaseRefresh = () => {};
    try {
      await worker.goto(`/t/${code}`);
      await worker
        .getByRole("button", { name: "Comecei", exact: true })
        .click();
      await expect(worker.getByText(/Você começou às/)).toBeVisible();
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(
        card.getByText("Em execução", { exact: true }),
      ).toBeVisible();
      await expect(card.getByText("Recado novo", { exact: true })).toHaveCount(
        0,
      );
      await page.screenshot({
        path: testInfo.outputPath("execution.png"),
        fullPage: true,
      });
      await worker
        .getByRole("button", { name: "Mandar recado ao síndico" })
        .click();
      await worker
        .getByLabel("Recado", { exact: true })
        .fill("Recado sintético ORI107 primeiro");
      await worker.getByRole("button", { name: "Enviar", exact: true }).click();
      await expect(
        worker.getByText("Recado enviado ao síndico."),
      ).toBeVisible();
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(
        card.getByText("Em execução", { exact: true }),
      ).toBeVisible();
      await expect(
        card.getByText("Recado novo", { exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath("combined-signals.png"),
        fullPage: true,
      });
      await expect
        .poll(() =>
          localSql(
            `select count(*) from private.occurrence_employee_message_reads where occurrence_id='${id}'`,
          ),
        )
        .toBe("0");
      await card.hover();
      expect(
        localSql(
          `select count(*) from private.occurrence_employee_message_reads where occurrence_id='${id}'`,
        ),
      ).toBe("0");
      await page.route(`**/api/occurrences/${id}`, (route) =>
        route.fulfill({
          status: 503,
          json: { error: "Synthetic detail unavailable" },
        }),
      );
      await card.getByRole("button", { name: /Abrir ocorrência/ }).click();
      await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
      expect(
        localSql(
          `select count(*) from private.occurrence_employee_message_reads where occurrence_id='${id}'`,
        ),
      ).toBe("0");
      await page.getByRole("button", { name: "Fechar", exact: true }).click();
      await page.unroute(`**/api/occurrences/${id}`);
      const refreshGate = new Promise<void>((resolve) => {
        releaseRefresh = resolve;
      });
      let first = true;
      await page.route(`**/api/occurrences/${id}`, async (route) => {
        if (first) {
          first = false;
          const original = await route.fetch();
          expect(
            (
              await worker.request.post(`/api/public/tasks/${code}/commands`, {
                data: {
                  key: randomUUID(),
                  type: "message",
                  payload: { comment: "Recado sintético ORI107 concorrente" },
                },
              })
            ).status(),
          ).toBe(200);
          await route.fulfill({ response: original });
        } else {
          await refreshGate;
          await route.continue();
        }
      });
      await card.getByRole("button", { name: /Abrir ocorrência/ }).click();
      const dialog = page.getByRole("dialog");
      await expect(
        dialog.getByText(/Recado de.*Recado sintético ORI107 primeiro/),
      ).toBeVisible();
      await expect
        .poll(() =>
          localSql(
            `select count(*) from private.occurrence_employee_message_reads where occurrence_id='${id}'`,
          ),
        )
        .toBe("1");
      expect(
        localSql(
          `select count(*) from public.occurrence_events e join private.occurrence_employee_message_reads r on r.occurrence_id=e.occurrence_id where e.occurrence_id='${id}' and e.event_type='employee_message' and e.id>r.through_event_id`,
        ),
      ).toBe("1");
      const unreadQueue = await (
        await page.request.get("/api/occurrences/queue")
      ).json();
      expect(
        unreadQueue.columns.delegated.items.find(
          (item: { id: string }) => item.id === id,
        ).hasNewEmployeeMessage,
      ).toBe(true);
      if (width === 1280)
        await expect(
          card.getByText("Recado novo", { exact: true }),
        ).toBeVisible();
      expect(
        await dialog
          .getByText(/Recado de.*Recado sintético ORI107 concorrente/)
          .count(),
      ).toBe(0);
      releaseRefresh();
      await expect(
        dialog.getByText(/Recado de.*Recado sintético ORI107 concorrente/),
      ).toBeVisible();
      await expect
        .poll(async () => {
          const queue = await (
            await page.request.get("/api/occurrences/queue")
          ).json();
          return queue.columns.delegated.items.find(
            (item: { id: string }) => item.id === id,
          ).hasNewEmployeeMessage;
        })
        .toBe(false);
      if (width === 1280)
        await expect(
          card.getByText("Recado novo", { exact: true }),
        ).toHaveCount(0);
      await page.screenshot({
        path: testInfo.outputPath("detail-read.png"),
        fullPage: true,
      });
      await page.unroute(`**/api/occurrences/${id}`);
      await page.getByRole("button", { name: "Fechar", exact: true }).click();
      await page.reload();
      if (width === 360)
        await page.getByRole("tab", { name: /^Delegado / }).click();
      await expect(card).toBeVisible();
      await expect(card.getByText("Recado novo", { exact: true })).toHaveCount(
        0,
      );
      await expect(
        card.getByText("Em execução", { exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("read-cleared.png"),
        fullPage: true,
      });
      await worker
        .getByRole("button", { name: "Concluir tarefa", exact: true })
        .click();
      await worker
        .getByRole("button", { name: "Concluir", exact: true })
        .click();
      await expect(
        worker.getByRole("heading", { name: "Tarefa concluída" }),
      ).toBeVisible();
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      if (width === 360)
        await page.getByRole("tab", { name: /^Concluído / }).click();
      await expect(
        card.getByText(
          "Concluída por Funcionário Sintético ORI107 (Função Sintética)",
          { exact: true },
        ),
      ).toBeVisible();
      expect(await card.getByText("Em execução", { exact: true }).count()).toBe(
        0,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath("completed.png"),
        fullPage: true,
      });
      const detail = await (
        await page.request.get(`/api/occurrences/${id}`)
      ).json();
      const resident = await context.newPage();
      await resident.setViewportSize({ width, height: 900 });
      const residentResponse = await resident.goto(`/o/${detail.trackingCode}`);
      expect(residentResponse?.status()).toBe(200);
      await expect(
        resident.getByRole("heading", { name: "Ocorrência sintética ORI107" }),
      ).toBeVisible();
      const residentBody = await resident.locator("body").innerText();
      expect(residentBody).not.toContain("Recado sintético ORI107 primeiro");
      expect(residentBody).not.toContain("Recado sintético ORI107 concorrente");
      expect(residentBody).not.toContain("Funcionário Sintético ORI107");
      const residentHtml = await residentResponse!.text();
      expect(residentHtml).not.toContain("Recado sintético ORI107");
      await resident.screenshot({
        path: testInfo.outputPath("resident-private.png"),
        fullPage: true,
      });
      await resident.close();
      const pendingId = randomUUID();
      localSql(
        `insert into public.occurrences(id,condominium_id,origin,channel,description,location) values('${pendingId}','${condo.id}','manager_panel','web','Recado antes do início ORI107','Portão sintético');`,
      );
      const pendingDelegation = await page.request.post(
        `/api/occurrences/${pendingId}/commands`,
        {
          data: {
            key: randomUUID(),
            version: 0,
            type: "delegate",
            payload: {
              employeeId: employee.id,
              message: "Synthetic pending delegation",
            },
          },
        },
      );
      expect(pendingDelegation.status()).toBe(200);
      const pendingCode = (await pendingDelegation.json()).delegation.code;
      await worker.goto(`/t/${pendingCode}`);
      await worker
        .getByRole("button", { name: "Mandar recado ao síndico" })
        .click();
      await worker
        .getByLabel("Recado", { exact: true })
        .fill("Recado sintético sem início ORI107");
      await worker.getByRole("button", { name: "Enviar", exact: true }).click();
      await expect(
        worker.getByText("Recado enviado ao síndico."),
      ).toBeVisible();
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      if (width === 360)
        await page.getByRole("tab", { name: /^Delegado / }).click();
      const pendingCard = page
        .getByRole("article")
        .filter({ hasText: "Recado antes do início ORI107" });
      await expect(
        pendingCard.getByText("Recado novo", { exact: true }),
      ).toBeVisible();
      await expect(
        pendingCard.getByText("Em execução", { exact: true }),
      ).toHaveCount(0);
      await page.screenshot({
        path: testInfo.outputPath("message-only.png"),
        fullPage: true,
      });
      const pendingDetail = await (
        await page.request.get(`/api/occurrences/${pendingId}`)
      ).json();
      const pendingResident = await context.newPage();
      await pendingResident.goto(`/o/${pendingDetail.trackingCode}`);
      await expect(
        pendingResident.getByText("Recado antes do início ORI107", {
          exact: true,
        }),
      ).toBeVisible();
      expect(await pendingResident.locator("body").innerText()).not.toContain(
        "Recado sintético sem início ORI107",
      );
      await pendingResident.close();
    } finally {
      releaseRefresh();
      await context.close();
    }
  });
}
