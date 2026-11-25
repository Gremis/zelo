import { expect, test } from "vitest";
import type { ManagerRegistrationFields } from "@/lib/manager-occurrences/contract";
import {
  emptyRegistration,
  toRequestBody,
  validateRegistration,
} from "@/lib/manager-occurrences/validation";

const valid: ManagerRegistrationFields = {
  condominiumId: "11111111-1111-4111-8111-111111111111",
  channel: "whatsapp",
  location: "Garagem",
  description: "Vazamento",
  reporterName: "",
  reporterPhone: "",
  reporterUnitOrRole: "",
};

test("aceita obrigatórios com quem relatou vazio", () => {
  expect(validateRegistration(valid)).toEqual({});
});

test("exige condomínio, canal, onde e o que aconteceu", () => {
  const errors = validateRegistration(emptyRegistration());
  expect(errors.condominiumId).toBeTruthy();
  expect(errors.channel).toBeTruthy();
  expect(errors.location).toBeTruthy();
  expect(errors.description).toBeTruthy();
});

test("rejeita canal fora da lista", () => {
  expect(
    validateRegistration({ ...valid, channel: "web" as never }).channel,
  ).toBeTruthy();
});

test("valida o celular só quando preenchido", () => {
  expect(validateRegistration({ ...valid, reporterPhone: "" })).toEqual({});
  expect(
    validateRegistration({ ...valid, reporterPhone: "123" }).reporterPhone,
  ).toBeTruthy();
  expect(
    validateRegistration({ ...valid, reporterPhone: "11900000000" })
      .reporterPhone,
  ).toBeUndefined();
});

test("aceita celular formatado e normaliza para dígitos", () => {
  const formatted = "(81) 98836-9141";
  expect(
    validateRegistration({ ...valid, reporterPhone: formatted }).reporterPhone,
  ).toBeUndefined();
  expect(toRequestBody({ ...valid, reporterPhone: formatted }).reporterPhone).toBe(
    "81988369141",
  );
});

test("toRequestBody manda obrigatórios aparados e só opcionais preenchidos", () => {
  expect(
    toRequestBody({ ...valid, location: "  Hall  ", description: "  X  " }),
  ).toEqual({
    condominiumId: valid.condominiumId,
    channel: "whatsapp",
    location: "Hall",
    description: "X",
  });
  expect(
    toRequestBody({
      ...valid,
      reporterName: " Ana ",
      reporterPhone: " 11900000000 ",
      reporterUnitOrRole: " 101 ",
    }),
  ).toEqual({
    condominiumId: valid.condominiumId,
    channel: "whatsapp",
    location: "Garagem",
    description: "Vazamento",
    reporterName: "Ana",
    reporterPhone: "11900000000",
    reporterUnitOrRole: "101",
  });
});
