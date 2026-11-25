import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { test, expect } from "./local-auth";
import { localSql } from "./local-database";

test.skip(
  process.env.ORI105_LOCAL_TESTS !== "enabled",
  "Local employee task opt-in required.",
);

for (const width of [360, 1280]) {
  test(`real employee start, upload, completion recovery and reopened link at ${width}px`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(120000);
    const condominiumResponse = await page.request.post("/api/condominiums", {
      data: {
        name: "Condomínio Sintético ORI105",
        address: "Endereço sintético",
      },
    });
    expect(condominiumResponse.status()).toBe(201);
    const condo = (await condominiumResponse.json()).condominium;
    const employeeResponse = await page.request.post("/api/funcionarios", {
      data: {
        nome: "Funcionário Sintético ORI105",
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
      `insert into public.occurrences(id,condominium_id,origin,channel,description,location,reporter_name,reporter_unit_or_role,reporter_phone) values('${id}','${condo.id}','manager_panel','web','Ocorrência sintética ORI105','Hall sintético','Relator Sintético','101','11900000008');`,
    );
    const delegation = await page.request.post(
      `/api/occurrences/${id}/commands`,
      {
        data: {
          key: randomUUID(),
          version: 0,
          type: "delegate",
          payload: { employeeId: employee.id, message: "Synthetic delegation" },
        },
      },
    );
    expect(delegation.status()).toBe(200);
    const code = (await delegation.json()).delegation.code;
    await page.goto("/fila");
    await expect(
      page
        .getByRole("article")
        .filter({ hasText: "Ocorrência sintética ORI105" }),
    ).toBeVisible();
    const context = await browser.newContext({
      viewport: { width, height: 900 },
    });
    const employeePage = await context.newPage();
    try {
      await employeePage.goto(`/t/${code}`);
      await expect(
        employeePage.getByRole("button", { name: "Comecei", exact: true }),
      ).toBeVisible();
      await expect(
        employeePage.getByText("Relator Sintético · 101"),
      ).toBeVisible();
      expect(
        await employeePage.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      let lostStart = true;
      await employeePage.route(
        `**/api/public/tasks/${code}/commands`,
        async (route) => {
          const body = route.request().postDataJSON();
          if (body.type === "start" && lostStart) {
            lostStart = false;
            await route.fetch();
            await route.abort("failed");
          } else await route.continue();
        },
      );
      await employeePage
        .getByRole("button", { name: "Comecei", exact: true })
        .click();
      await employeePage
        .getByRole("button", { name: "Recuperar operação" })
        .click();
      await expect(employeePage.getByText(/Você começou às/)).toBeVisible();
      let detail = await (
        await page.request.get(`/api/occurrences/${id}`)
      ).json();
      expect(detail.status).toBe("delegated");
      await page.goto("/fila");
      await expect(
        page
          .getByRole("article")
          .filter({ hasText: "Ocorrência sintética ORI105" })
          .getByText("Em execução", { exact: true }),
      ).toBeVisible();
      await employeePage.bringToFront();
      expect(
        detail.events.filter(
          (event: { type: string }) => event.type === "employee_started",
        ),
      ).toHaveLength(1);
      await employeePage
        .getByRole("button", { name: "Concluir tarefa", exact: true })
        .click();
      await expect(
        employeePage.getByRole("heading", {
          name: "Concluir tarefa",
          exact: true,
        }),
      ).toBeFocused();
      await employeePage
        .getByLabel("Comentário (opcional)")
        .fill("Comentário preservado");
      await employeePage
        .getByRole("button", { name: "Cancelar", exact: true })
        .click();
      await expect(
        employeePage.getByRole("button", {
          name: "Concluir tarefa",
          exact: true,
        }),
      ).toBeFocused();
      expect(
        (await (await page.request.get(`/api/occurrences/${id}`)).json())
          .status,
      ).toBe("delegated");
      await employeePage
        .getByRole("button", { name: "Concluir tarefa", exact: true })
        .press("Enter");
      const bytes = await sharp({
        create: { width: 5, height: 5, channels: 3, background: "#0f766e" },
      })
        .png()
        .toBuffer();
      await employeePage
        .getByLabel("Anexar foto, vídeo ou PDF", { exact: true })
        .setInputFiles({
          name: "synthetic-task.png",
          mimeType: "image/png",
          buffer: bytes,
        });
      await employeePage
        .getByLabel("Comentário (opcional)")
        .fill("Lâmpada sintética trocada");
      let uploadFailed = false;
      await employeePage.route(
        `**/api/public/tasks/${code}/uploads/**/authorize`,
        async (route) => {
          if (!uploadFailed) {
            uploadFailed = true;
            await route.fulfill({
              status: 503,
              json: { error: "Synthetic transfer failure" },
            });
          } else await route.continue();
        },
      );
      let lostCompletion = true;
      await employeePage.unroute(`**/api/public/tasks/${code}/commands`);
      await employeePage.route(
        `**/api/public/tasks/${code}/commands`,
        async (route) => {
          if (lostCompletion) {
            lostCompletion = false;
            await route.fetch();
            await route.abort("failed");
          } else await route.continue();
        },
      );
      await employeePage
        .getByRole("button", { name: "Concluir", exact: true })
        .click();
      await expect(
        employeePage.getByRole("main").getByRole("alert"),
      ).toBeVisible();
      await expect(
        employeePage.getByLabel("Comentário (opcional)"),
      ).toHaveValue("Lâmpada sintética trocada");
      await expect(
        employeePage.getByRole("button", {
          name: "Remover synthetic-task.png",
        }),
      ).toBeVisible();
      await employeePage
        .getByRole("button", { name: "Concluir", exact: true })
        .click();
      await employeePage
        .getByRole("button", { name: "Recuperar operação" })
        .click();
      await expect(
        employeePage.getByRole("heading", {
          name: "Tarefa concluída",
          exact: true,
        }),
      ).toBeVisible();
      await expect(employeePage.getByRole("button")).toHaveCount(0);
      detail = await (await page.request.get(`/api/occurrences/${id}`)).json();
      expect(detail.status).toBe("completed");
      const completed = detail.events.filter(
        (event: { type: string }) => event.type === "completed",
      );
      expect(completed).toHaveLength(1);
      expect(completed[0].authorType).toBe("employee");
      expect(completed[0].attachments).toHaveLength(1);
      await page.goto("/fila");
      await expect(
        page.getByText(
          "Concluída por Funcionário Sintético ORI105 (Função Sintética)",
          { exact: true },
        ),
      ).toBeVisible();
      const reopened = await page.request.post(
        `/api/occurrences/${id}/commands`,
        {
          data: {
            key: randomUUID(),
            version: detail.version,
            type: "reopen",
            payload: {},
          },
        },
      );
      expect(reopened.status()).toBe(200);
      await employeePage.reload();
      await expect(
        employeePage.getByRole("heading", {
          name: "Tarefa concluída",
          exact: true,
        }),
      ).toBeVisible();
      await expect(employeePage.getByRole("button")).toHaveCount(0);
    } finally {
      const paths = JSON.parse(
        localSql(
          `select coalesce(json_agg(path),'[]') from (select f.source_path path from private.occurrence_upload_files f join private.occurrence_upload_sessions s on s.id=f.session_id where s.target_occurrence_id='${id}' union all select f.evidence_path from private.occurrence_upload_files f join private.occurrence_upload_sessions s on s.id=f.session_id where s.target_occurrence_id='${id}') p;`,
        ),
      ) as string[];
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
      await context.close();
    }
  });
}
