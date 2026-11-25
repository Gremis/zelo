// ORI-97: registro de ocorrência pelo síndico (painel).

export const MANAGER_CHANNELS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "phone", label: "Telefone" },
  { value: "in_person", label: "Pessoalmente" },
  { value: "email", label: "E-mail" },
  { value: "inspection", label: "Vistoria" },
] as const;
export type ManagerChannelValue = (typeof MANAGER_CHANNELS)[number]["value"];

export type ManagerCondominium = { id: string; name: string };

export type ManagerRegistrationFields = {
  condominiumId: string;
  channel: ManagerChannelValue | "";
  location: string;
  description: string;
  reporterName: string;
  reporterPhone: string;
  reporterUnitOrRole: string;
};

export type ManagerRegistrationErrors = Partial<
  Record<keyof ManagerRegistrationFields, string>
>;

export type CondominiumsResult =
  | { ok: true; data: ManagerCondominium[] }
  | { ok: false; error: "unauthorized" | "unavailable" };

export type ManagerRegistrationResult =
  | { ok: true; number: number; trackingCode: string }
  | { ok: false; error: "invalid_input"; fields: ManagerRegistrationErrors }
  | { ok: false; error: "unauthorized" | "not_found" | "uncertain" };

export type ManagerOccurrenceOperations = {
  loadCondominiums: (signal?: AbortSignal) => Promise<CondominiumsResult>;
  register: (
    fields: ManagerRegistrationFields,
  ) => Promise<ManagerRegistrationResult>;
};
