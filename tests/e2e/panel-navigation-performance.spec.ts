import { test, expect } from "./local-auth";

test.skip(
  process.env.PANEL_NAVIGATION_BENCHMARK !== "enabled",
  "Explicit local navigation benchmark opt-in required.",
);

test("measures authenticated menu transitions in a production build", async ({
  page,
}, info) => {
  const destinations = {
    "/fila": ["Fila de ocorrências", "Abertas por prioridade"],
    "/condominios": ["Condomínios", "Nenhum condomínio por enquanto"],
    "/funcionarios": [
      "Funcionários",
      "Nenhum funcionário cadastrado nesta carteira.",
    ],
  } as const;
  const results = [];
  const content = (target: keyof typeof destinations) =>
    target === "/fila"
      ? page.locator('[aria-label="Ocorrências abertas por prioridade"]')
      : target === "/condominios"
        ? page
            .getByRole("article", { name: "Condomínio Sintético Demo A" })
            .or(page.getByText(destinations[target][1]))
        : page.getByText(destinations[target][1]);
  await page.goto("/fila");
  await expect(content("/fila")).toBeVisible();
  await expect(page.getByTitle("Pessoa Sintética").first()).toBeVisible();
  for (let round = 0; round < 3; round++) {
    for (const target of [
      "/condominios",
      "/funcionarios",
      "/fila",
      "/funcionarios",
      "/condominios",
      "/fila",
    ] as const) {
      await page.getByRole("button", { name: "Abrir menu" }).click();
      const source = new URL(page.url()).pathname;
      const requests: string[] = [];
      const track = (request: import("@playwright/test").Request) => {
        const url = new URL(request.url());
        if (request.resourceType() === "fetch") requests.push(url.pathname);
      };
      page.on("request", track);
      await page.evaluate(
        ({ target, text }) => {
          const measurement = { milliseconds: null as number | null };
          Object.assign(window, { navigationMeasurement: measurement });
          document.addEventListener("click", function start(event) {
            if (!(event.target instanceof Element)) return;
            if (event.target.closest("a")?.getAttribute("href") !== target)
              return;
            document.removeEventListener("click", start);
            const began = performance.now();
            const observer = new MutationObserver(check);
            function check() {
              const ready =
                location.pathname === target &&
                (target === "/fila"
                  ? document.querySelector(
                      '[aria-label="Ocorrências abertas por prioridade"]',
                    )
                  : document
                      .querySelector("main")
                      ?.textContent?.includes(text) ||
                    (target === "/condominios" &&
                      document.querySelector(
                        'article[aria-label="Condomínio Sintético Demo A"]',
                      )));
              if (!ready) return;
              observer.disconnect();
              requestAnimationFrame(() => {
                measurement.milliseconds = performance.now() - began;
              });
            }
            observer.observe(document.body, {
              childList: true,
              characterData: true,
              subtree: true,
            });
            check();
          });
        },
        { target, text: destinations[target][1] },
      );
      await page
        .getByRole("link", { name: destinations[target][0], exact: true })
        .click();
      await expect(content(target)).toBeVisible();
      await page.waitForFunction(
        () =>
          (
            window as unknown as {
              navigationMeasurement: { milliseconds: number | null };
            }
          ).navigationMeasurement.milliseconds !== null,
      );
      const milliseconds = await page.evaluate(
        () =>
          (
            window as unknown as {
              navigationMeasurement: { milliseconds: number };
            }
          ).navigationMeasurement.milliseconds,
      );
      await expect(page.getByTitle("Pessoa Sintética").first()).toBeVisible();
      page.off("request", track);
      results.push({
        source,
        target,
        round,
        milliseconds: Math.round(milliseconds),
        requests,
      });
    }
  }
  await info.attach("navigation-measurements", {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });
  console.log(JSON.stringify({ navigationMeasurements: results }));
});
