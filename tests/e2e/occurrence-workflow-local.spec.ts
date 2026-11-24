import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { test, expect } from "./local-auth";
import { localSql } from "./local-database";

test.skip(
  process.env.ORI72_LOCAL_TESTS !== "enabled",
  "Local workflow opt-in required.",
);
for (const width of [360, 1280]) {
  test(`complete responsibility, deadline, WhatsApp and private completion at ${width}px`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 900 });
    const created = await page.request.post("/api/condominiums", {
      data: {
        name: "Condomínio Sintético ORI72",
        address: "Endereço sintético",
      },
    });
    expect(created.status()).toBe(201);
    const condo = (await created.json()).condominium;
    const employeeResponse = await page.request.post("/api/funcionarios", {
      data: {
        nome: "Funcionário Sintético ORI72",
        celular: "11900000009",
        condominioId: condo.id,
        funcaoNome: "Função Sintética",
        horarioTrabalho: "00:00 às 00:01",
      },
    });
    expect(employeeResponse.status()).toBe(201);
    const employee = (await employeeResponse.json()).funcionario;
    const occurrence = randomUUID();
    localSql(
      `insert into public.occurrences(id,condominium_id,origin,channel,description,location,suggested_priority,suggestion_source,suggestion_at,suggestion_reason) values('${occurrence}','${condo.id}','manager_panel','web','Ocorrência sintética ORI72','Hall sintético','normal','rules',now(),'Sem sinal de risco.');`,
    );
    const paths: string[] = [];
    try {
      await page.goto("/fila");
      const card = page
        .getByRole("article")
        .filter({ hasText: "Ocorrência sintética ORI72" });
      await card.getByRole("button", { name: /Abrir ocorrência/ }).click();
      let dialog = page.getByRole("dialog");
      await expect(
        dialog.getByRole("button", { name: "Concluir ocorrência" }),
      ).toHaveCount(0);
      await dialog
        .getByLabel("Responsável", { exact: true })
        .selectOption("manager");
      await expect(dialog.getByText(/Responsável salvo:/)).toBeVisible();
      await expect(
        dialog.getByLabel("Previsão", { exact: true }),
      ).toBeVisible();
      await dialog
        .getByLabel("Responsável", { exact: true })
        .selectOption("provider");
      await dialog
        .getByLabel("Nome do prestador ou administradora")
        .fill("Prestador Sintético ORI72");
      await dialog
        .getByLabel("Nome do prestador ou administradora")
        .press("Tab");
      await expect(
        dialog.getByText("Responsável salvo: Prestador Sintético ORI72"),
      ).toBeVisible();
      await dialog.getByLabel("Previsão", { exact: true }).fill("2027-05-12");
      await dialog.getByLabel("Previsão", { exact: true }).press("Tab");
      await dialog.getByLabel("Responsável", { exact: true }).focus();
      await expect
        .poll(
          async () =>
            (
              await (
                await page.request.get(`/api/occurrences/${occurrence}`)
              ).json()
            ).dueDate,
        )
        .toBe("2027-05-12");
      await dialog.getByLabel("Previsão", { exact: true }).fill("2027-05-13");
      await dialog.getByLabel("Previsão", { exact: true }).press("Tab");
      await dialog.getByLabel("Responsável", { exact: true }).focus();
      await expect
        .poll(
          async () =>
            (
              await (
                await page.request.get(`/api/occurrences/${occurrence}`)
              ).json()
            ).dueDate,
        )
        .toBe("2027-05-13");
      await dialog.getByRole("button", { name: "Remover previsão" }).click();
      await expect(dialog.getByLabel("Previsão", { exact: true })).toHaveValue(
        "",
      );
      await dialog.getByLabel("Previsão", { exact: true }).fill("2027-05-14");
      await dialog.getByLabel("Previsão", { exact: true }).press("Tab");
      await dialog.getByLabel("Responsável", { exact: true }).focus();
      await expect
        .poll(
          async () =>
            (
              await (
                await page.request.get(`/api/occurrences/${occurrence}`)
              ).json()
            ).dueDate,
        )
        .toBe("2027-05-14");
      await dialog
        .getByLabel("Responsável", { exact: true })
        .selectOption(employee.id);
      await dialog.getByRole("button", { name: "Cancelar seleção" }).click();
      await expect(
        dialog.getByText("Responsável salvo: Prestador Sintético ORI72"),
      ).toBeVisible();
      await page.evaluate(() => {
        Object.assign(window, { workflowOpens: [] });
        window.open = ((...args: unknown[]) => {
          (
            window as unknown as { workflowOpens: unknown[] }
          ).workflowOpens.push(args);
          return null;
        }) as typeof window.open;
      });
      await dialog
        .getByLabel("Responsável", { exact: true })
        .selectOption(employee.id);
      await dialog
        .getByLabel("Mensagem de delegação")
        .fill("Mensagem sintética editada & controlada");
      await dialog
        .getByRole("button", { name: "Enviar pelo WhatsApp" })
        .click();
      await expect(
        dialog.getByRole("link", { name: "Abrir WhatsApp" }),
      ).toHaveAttribute(
        "href",
        `https://wa.me/5511900000009?text=${encodeURIComponent("Mensagem sintética editada & controlada")}`,
      );
      expect(
        await page.evaluate(
          () =>
            (window as unknown as { workflowOpens: unknown[] }).workflowOpens,
        ),
      ).toEqual([["about:blank", "_blank"]]);
      await expect(dialog.getByLabel("Previsão", { exact: true })).toHaveCount(
        0,
      );
      const delegated = await (
        await page.request.get(`/api/occurrences/${occurrence}`)
      ).json();
      expect(delegated.status).toBe("delegated");
      expect(delegated.dueDate).toBeNull();
      expect(
        delegated.events.some((event: { text: string }) =>
          event.text.includes("Previsão removida ao delegar"),
        ),
      ).toBe(true);
      expect(
        (
          await page.request.patch(`/api/funcionarios/${employee.id}`, {
            data: { ativo: false },
          })
        ).status(),
      ).toBe(200);
      const released = await (
        await page.request.get(`/api/occurrences/${occurrence}`)
      ).json();
      expect(released.status).toBe("new");
      expect(
        (
          await page.request.patch(`/api/funcionarios/${employee.id}`, {
            data: { ativo: true },
          })
        ).status(),
      ).toBe(200);
      expect(
        (
          await (
            await page.request.get(`/api/occurrences/${occurrence}`)
          ).json()
        ).status,
      ).toBe("new");
      await page.reload();
      await page
        .getByRole("article")
        .filter({ hasText: "Ocorrência sintética ORI72" })
        .getByRole("button", { name: /Abrir ocorrência/ })
        .click();
      dialog = page.getByRole("dialog");
      await dialog
        .getByLabel("Responsável", { exact: true })
        .selectOption("manager");
      await expect(
        dialog.getByLabel("Previsão", { exact: true }),
      ).toBeVisible();
      const first = await (
        await page.request.get(`/api/occurrences/${occurrence}`)
      ).json();
      expect(first.firstResponsibleAt).toBe(delegated.firstResponsibleAt);
      await dialog.getByRole("button", { name: "Concluir ocorrência" }).click();
      await dialog
        .getByLabel("Comentário (opcional)")
        .fill("Resolução sintética revisada");
      await dialog.getByLabel("Anexos (opcional)").setInputFiles({
        name: "synthetic.png",
        mimeType: "image/png",
        buffer: await sharp({
          create: { width: 4, height: 4, channels: 3, background: "white" },
        })
          .png()
          .toBuffer(),
      });
      await dialog
        .getByRole("button", { name: "Enviar e verificar anexos" })
        .click();
      await expect(
        dialog.getByText(
          "Arquivos verificados. A ocorrência ainda não foi concluída.",
        ),
      ).toBeVisible({ timeout: 60000 });
      await dialog.getByRole("button", { name: "Confirmar conclusão" }).click();
      await expect(
        dialog.getByText("Resolução sintética revisada", { exact: false }),
      ).toBeVisible();
      await expect(
        dialog.getByLabel("Responsável", { exact: true }),
      ).toHaveCount(0);
      await expect(
        dialog.getByRole("button", { name: "Adicionar", exact: true }),
      ).toHaveCount(0);
      const evidence = dialog.getByRole("link", {
        name: "synthetic.png (interno)",
      });
      await expect(evidence).toBeVisible();
      const fileResponse = await page.request.get(
        (await evidence.getAttribute("href"))!,
        { maxRedirects: 0 },
      );
      expect(fileResponse.status()).toBe(302);
      expect(fileResponse.headers()["location"]).toContain(
        "/storage/v1/object/sign/occurrence-evidence/",
      );
      const final = await (
        await page.request.get(`/api/occurrences/${occurrence}`)
      ).json();
      expect(final.status).toBe("completed");
      expect(
        final.events.filter(
          (event: { type: string }) => event.type === "completed",
        ),
      ).toHaveLength(1);
      const queue = await (
        await page.request.get("/api/occurrences/queue")
      ).json();
      expect(
        queue.columns.completed.items.some(
          (item: { id: string }) => item.id === occurrence,
        ),
      ).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await testInfo.attach(`ori72-${width}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
    } finally {
      const data = JSON.parse(
        localSql(
          `select coalesce(json_agg(path),'[]') from (select f.source_path path from private.occurrence_upload_files f join private.occurrence_upload_sessions s on s.id=f.session_id where s.target_occurrence_id='${occurrence}' union all select f.evidence_path from private.occurrence_upload_files f join private.occurrence_upload_sessions s on s.id=f.session_id where s.target_occurrence_id='${occurrence}') p;`,
        ),
      ) as string[];
      paths.push(...data);
      if (paths.length) {
        const admin = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        expect(
          (await admin.storage.from("occurrence-evidence").remove(paths)).error,
        ).toBeNull();
      }
    }
  });
}

test("lost completion response recovers once without preparing any upload", async ({
  page,
}) => {
  const created = await page.request.post("/api/condominiums", {
    data: {
      name: "Condomínio Sintético Recuperação",
      address: "Endereço sintético",
    },
  });
  expect(created.status()).toBe(201);
  const condo = (await created.json()).condominium;
  const id = randomUUID();
  localSql(
    `insert into public.occurrences(id,condominium_id,origin,channel,description) values('${id}','${condo.id}','manager_panel','web','Ocorrência sintética recuperação');`,
  );
  const before = await (
    await page.request.get(`/api/occurrences/${id}`)
  ).json();
  expect(
    (
      await page.request.post(`/api/occurrences/${id}/commands`, {
        data: {
          key: randomUUID(),
          version: before.version,
          type: "responsible",
          payload: { kind: "manager" },
        },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/fila");
  if (await page.getByRole("tab", { name: /Andamento/ }).isVisible())
    await page.getByRole("tab", { name: /Andamento/ }).click();
  await page
    .getByRole("article")
    .filter({ hasText: "Ocorrência sintética recuperação" })
    .getByRole("button", { name: /Abrir ocorrência/ })
    .click();
  let lost = false;
  const keys: string[] = [];
  const uploadRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/uploads")) uploadRequests.push(request.url());
  });
  await page.route(`**/api/occurrences/${id}/commands`, async (route) => {
    const body = route.request().postDataJSON();
    keys.push(body.key);
    if (!lost) {
      lost = true;
      const committed = await route.fetch();
      expect(committed.status()).toBe(200);
      return route.abort("connectionreset");
    }
    return route.continue();
  });
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Concluir ocorrência" }).click();
  await dialog.getByLabel("Anexos (opcional)").setInputFiles({
    name: "unsupported.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("invalid"),
  });
  await expect(
    dialog.getByRole("button", { name: "Confirmar conclusão" }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Remover seleção de arquivos" })
    .click();
  await dialog.getByRole("button", { name: "Confirmar conclusão" }).click();
  await expect(
    dialog.getByRole("button", { name: "Recuperar operação" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Recuperar operação" }).click();
  await expect(dialog.getByText("Concluído", { exact: true })).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  expect(uploadRequests).toHaveLength(0);
  const final = await (await page.request.get(`/api/occurrences/${id}`)).json();
  expect(
    final.events.filter(
      (event: { type: string }) => event.type === "completed",
    ),
  ).toHaveLength(1);
  const stale = await page.request.post(`/api/occurrences/${id}/commands`, {
    data: {
      key: randomUUID(),
      version: final.version,
      type: "responsible",
      payload: { kind: "manager" },
    },
  });
  expect(stale.status()).toBe(409);
});
