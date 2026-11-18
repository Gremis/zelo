import { expect, test } from "@playwright/test";

test("phone supports progressive typing, selection and deletion in the middle", async ({
  page,
}) => {
  await page.goto("/criar-conta");
  const phone = page.getByRole("textbox", { name: "Celular" });
  await expect(phone).toHaveValue("");
  await expect(phone).toHaveAttribute("placeholder", "(31) 9____-____");
  await expect(phone).toHaveAttribute("type", "tel");
  await expect(phone).toHaveAttribute("inputmode", "tel");
  await expect(phone).toHaveAttribute("autocomplete", "tel");
  const expected = [
    "(3",
    "(31)",
    "(31) 9",
    "(31) 98",
    "(31) 983",
    "(31) 9832",
    "(31) 9832-0",
    "(31) 9832-06",
    "(31) 9832-066",
    "(31) 9832-0661",
    "(31) 98320-6614",
  ];
  for (const [index, digit] of [..."31983206614"].entries()) {
    await phone.pressSequentially(digit);
    await expect(phone).toHaveValue(expected[index]);
  }
  await phone.fill("2133206614");
  await expect(phone).toHaveValue("(21) 3320-6614");
  await phone.evaluate((el: HTMLInputElement) => el.setSelectionRange(7, 8));
  await phone.pressSequentially("9");
  await expect(phone).toHaveValue("(21) 3390-6614");
  expect(
    await phone.evaluate((el: HTMLInputElement) => el.selectionStart),
  ).toBe(8);
  await phone.evaluate((el: HTMLInputElement) => el.setSelectionRange(10, 10));
  await phone.press("Backspace");
  await expect(phone).toHaveValue("(21) 3396-614");
  expect(
    await phone.evaluate((el: HTMLInputElement) => el.selectionStart),
  ).toBe(8);
  await phone.pressSequentially("0");
  await expect(phone).toHaveValue("(21) 3390-6614");
  expect(
    await phone.evaluate((el: HTMLInputElement) => el.selectionStart),
  ).toBe(9);
  await phone.press("Delete");
  await expect(phone).toHaveValue("(21) 3390-614");
  await phone.selectText();
  await phone.press("Backspace");
  await expect(phone).toHaveValue("");
});

test("phone accepts pasted text with or without formatting", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:3100",
  });
  await page.goto("/criar-conta");
  const phone = page.getByRole("textbox", { name: "Celular" });
  for (const [pasted, expected] of [
    ["85983206614", "(85) 98320-6614"],
    ["(11) 3320-6614", "(11) 3320-6614"],
  ]) {
    await phone.fill("");
    await phone.focus();
    await page.evaluate((text) => navigator.clipboard.writeText(text), pasted);
    await phone.press(process.platform === "darwin" ? "Meta+V" : "Control+V");
    await expect(phone).toHaveValue(expected);
  }
});
