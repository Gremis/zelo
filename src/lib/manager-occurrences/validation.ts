import {
  MANAGER_CHANNELS,
  type ManagerRegistrationErrors,
  type ManagerRegistrationFields,
} from "./contract";

export const MAX = {
  reporterName: 200,
  reporterUnitOrRole: 200,
  location: 200,
  description: 10000,
} as const;

const PHONE = /^[1-9][0-9]{9,10}$/;

export function emptyRegistration(): ManagerRegistrationFields {
  return {
    condominiumId: "",
    channel: "",
    location: "",
    description: "",
    reporterName: "",
    reporterPhone: "",
    reporterUnitOrRole: "",
  };
}

// Obrigatórios: condomínio, canal, onde e o que aconteceu.
// Quem relatou (nome, celular, unidade/função) é opcional.
export function validateRegistration(
  fields: ManagerRegistrationFields,
): ManagerRegistrationErrors {
  const errors: ManagerRegistrationErrors = {};
  if (!fields.condominiumId) errors.condominiumId = "Escolha o condomínio.";
  if (!MANAGER_CHANNELS.some((c) => c.value === fields.channel))
    errors.channel = "Escolha como a ocorrência chegou.";
  if (!fields.location.trim()) errors.location = "Informe onde aconteceu.";
  else if (fields.location.length > MAX.location)
    errors.location = `Use até ${MAX.location} caracteres.`;
  if (!fields.description.trim())
    errors.description = "Descreva o que aconteceu.";
  else if (fields.description.length > MAX.description)
    errors.description = `Use até ${MAX.description} caracteres.`;
  if (fields.reporterName && fields.reporterName.length > MAX.reporterName)
    errors.reporterName = `Use até ${MAX.reporterName} caracteres.`;
  // O PhoneInput devolve o valor formatado; validamos só os dígitos.
  const reporterPhoneDigits = fields.reporterPhone.replace(/\D/g, "");
  if (reporterPhoneDigits && !PHONE.test(reporterPhoneDigits))
    errors.reporterPhone = "Informe o celular com DDD (10 ou 11 dígitos).";
  if (
    fields.reporterUnitOrRole &&
    fields.reporterUnitOrRole.length > MAX.reporterUnitOrRole
  )
    errors.reporterUnitOrRole = `Use até ${MAX.reporterUnitOrRole} caracteres.`;
  return errors;
}

// Monta o corpo do POST: obrigatórios sempre; opcionais só quando preenchidos.
export function toRequestBody(
  fields: ManagerRegistrationFields,
): Record<string, string> {
  const body: Record<string, string> = {
    condominiumId: fields.condominiumId,
    channel: fields.channel,
    location: fields.location.trim(),
    description: fields.description.trim(),
  };
  if (fields.reporterName.trim())
    body.reporterName = fields.reporterName.trim();
  const reporterPhoneDigits = fields.reporterPhone.replace(/\D/g, "");
  if (reporterPhoneDigits) body.reporterPhone = reporterPhoneDigits;
  if (fields.reporterUnitOrRole.trim())
    body.reporterUnitOrRole = fields.reporterUnitOrRole.trim();
  return body;
}
