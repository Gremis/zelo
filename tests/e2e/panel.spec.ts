import { expect, test } from "@playwright/test";

for (const width of [360, 1440]) {
  test(`panel navigation and modal accessibility at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/fila");
    const trigger = page.getByRole("button", { name: "Abrir menu" });
    await expect(trigger).toHaveCSS("cursor", "pointer");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await page.screenshot({ path: `test-results/panel-closed-${width}.png` });
    await trigger.click();
    const menu = page.getByRole("dialog");
    await expect(menu).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Fechar", exact: true }),
    ).toBeFocused();
    await expect(
      page.getByRole("button", { name: "Fechar menu" }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
    await expect(
      menu.getByRole("link", { name: "Fila de ocorrências" }),
    ).toHaveAttribute("aria-current", "page");
    for (const name of [
      "Histórico de ocorrências",
      "Condomínios",
      "Funcionários",
    ]) {
      const item = menu.getByRole("button", { name, exact: true });
      await expect(item).toBeDisabled();
      await expect(item).toHaveCSS("cursor", "not-allowed");
      await expect(item).toHaveAccessibleDescription(
        "Esta tela ainda não está disponível.",
      );
    }
    const mockEnabled =
      ["local", "development"].includes(
        process.env.NEXT_PUBLIC_APP_ENV ?? "",
      ) && process.env.NEXT_PUBLIC_FIRST_STEPS_MOCK === "enabled";
    if (mockEnabled) {
      await expect(menu.getByText("Alex Exemplo")).toBeVisible();
      await expect(
        menu.getByText("Síndico profissional · 0 condomínios"),
      ).toBeVisible();
    } else {
      await expect(menu.getByRole("alert")).toContainText(
        "Não foi possível carregar",
      );
      await expect(menu.getByRole("button", { name: "Sair" })).toBeDisabled();
    }
    await page.screenshot({ path: `test-results/panel-open-${width}.png` });
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      expect(
        await menu.evaluate((node) => node.contains(document.activeElement)),
      ).toBe(true);
    }
    await menu.getByRole("button", { name: "Fechar", exact: true }).focus();
    await page.keyboard.press("Shift+Tab");
    expect(
      await menu.evaluate((node) => node.contains(document.activeElement)),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(menu).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
    await trigger.click();
    await page.mouse.click(width - 8, 400);
    await expect(menu).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await menu.getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(trigger).toBeFocused();
    if (mockEnabled) {
      await expect(page.getByRole("button", { name: "Dispensar" })).toHaveCSS(
        "cursor",
        "pointer",
      );
      await trigger.click();
      await expect(menu.getByRole("button", { name: "Sair" })).toHaveCSS(
        "cursor",
        "pointer",
      );
      await menu.getByRole("button", { name: "Sair" }).click();
      await expect(page).toHaveURL("/login");
      await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
      expect(await context.cookies()).toEqual([]);
      expect(
        await page.evaluate(() => [localStorage.length, sessionStorage.length]),
      ).toEqual([0, 0]);
    }
  });
}
