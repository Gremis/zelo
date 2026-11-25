import type { RegistrationErrors, RegistrationFields } from "./contract";

export const registrationFields = [
  {
    name: "reporterName",
    label: "Seu nome",
    limit: 200,
    required: "Digite seu nome.",
  },
  {
    name: "reporterUnitOrRole",
    label: "Sua unidade",
    limit: 200,
    required: "Diga sua unidade, ou sua função se trabalha no prédio.",
    placeholder: "Ex.: Bloco 1, apto 302",
  },
  {
    name: "reporterPhone",
    label: "Celular",
    limit: 11,
    required: "Digite o celular com DDD.",
    placeholder: "(31) 9____-____",
  },
  {
    name: "location",
    label: "Onde fica o problema",
    limit: 200,
    required: "Diga onde fica o problema.",
    placeholder: "Ex.: garagem, vaga 12",
  },
  {
    name: "description",
    label: "O que aconteceu",
    limit: 10000,
    required: "Conte o que aconteceu.",
    placeholder: "Descreva com o máximo de detalhe",
  },
] as const;

export function emptyRegistration(): RegistrationFields {
  return {
    reporterName: "",
    reporterUnitOrRole: "",
    reporterPhone: "",
    location: "",
    description: "",
  };
}

export function normalizeRegistration(
  fields: RegistrationFields,
): RegistrationFields {
  return {
    reporterName: fields.reporterName.trim(),
    reporterUnitOrRole: fields.reporterUnitOrRole.trim(),
    reporterPhone: fields.reporterPhone.replace(/\D/g, ""),
    location: fields.location.trim(),
    description: fields.description.trim(),
  };
}

export function validateRegistration(
  fields: RegistrationFields,
): RegistrationErrors {
  const normalized = normalizeRegistration(fields);
  const errors: RegistrationErrors = {};
  for (const field of registrationFields) {
    const value = normalized[field.name];
    if (!value) errors[field.name] = field.required;
    else if (value.length > field.limit || value.includes("\0"))
      errors[field.name] = `Use até ${field.limit} caracteres válidos.`;
  }
  if (
    !errors.reporterPhone &&
    !/^[1-9][0-9]9[0-9]{8}$/.test(normalized.reporterPhone)
  )
    errors.reporterPhone = "Digite o celular com DDD.";
  return errors;
}
