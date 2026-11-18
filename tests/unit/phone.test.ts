import { expect, test } from "vitest";
import { formatPhone, formatPhoneEdit } from "@/lib/auth/phone";
import { validateSignup } from "@/lib/auth/signup";

test.each([
  ["", ""],
  ["3", "(3"],
  ["31", "(31)"],
  ["319", "(31) 9"],
  ["319832", "(31) 9832"],
  ["3198320", "(31) 9832-0"],
  ["3198320661", "(31) 9832-0661"],
  ["31983206614", "(31) 98320-6614"],
  ["2133206614", "(21) 3320-6614"],
  ["(85) 98320-6614", "(85) 98320-6614"],
])("formats %s progressively", (input, expected) => {
  expect(formatPhone(input)).toBe(expected);
});

test("preserves insertion and deletion positions instead of moving to the end", () => {
  expect(
    formatPhoneEdit("(21) 3320-6614", "(21) 3390-6614", 8, "insertText"),
  ).toEqual({ value: "(21) 3390-6614", cursor: 8 });
  expect(
    formatPhoneEdit(
      "(21) 3390-6614",
      "(21) 33906614",
      9,
      "deleteContentBackward",
    ),
  ).toEqual({ value: "(21) 3396-614", cursor: 8 });
  expect(
    formatPhoneEdit(
      "(21) 3390-6614",
      "(21) 33906614",
      9,
      "deleteContentForward",
    ),
  ).toEqual({ value: "(21) 3390-614", cursor: 9 });
});

test.each([
  "(11) 3320-6614",
  "(21) 98320-6614",
  "(45) 98320-6614",
  "(85) 3320-6614",
])(
  "accepts formatted ten- and eleven-digit numbers with different area codes: %s",
  (phone) => {
    expect(
      validateSignup({
        fullName: "Pessoa Exemplo",
        email: "person@example.invalid",
        phone,
        password: "Example123",
        acceptedTerms: true,
      }),
    ).toEqual({});
  },
);

test("does not silently truncate excess pasted digits into a valid number", () => {
  const phone = formatPhone("319832066140");
  expect(phone.replace(/\D/g, "")).toHaveLength(12);
  expect(
    validateSignup({
      fullName: "Pessoa Exemplo",
      email: "person@example.invalid",
      phone,
      password: "Example123",
      acceptedTerms: true,
    }),
  ).toHaveProperty("phone");
});
