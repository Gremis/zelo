export type PublicCondominium = { name: string; address: string };

export type RegistrationFields = {
  reporterName: string;
  reporterUnitOrRole: string;
  reporterPhone: string;
  location: string;
  description: string;
};

export type RegistrationErrors = Partial<
  Record<keyof RegistrationFields, string>
>;
export type RegistrationAttempt = { key: string; fields: RegistrationFields };

export type CondominiumResult =
  | { ok: true; data: PublicCondominium }
  | { ok: false; error: "not_found" | "unavailable" };

export type RegistrationResult =
  | { ok: true; number: number }
  | { ok: false; error: "invalid_input"; fields: RegistrationErrors }
  | { ok: false; error: "not_found" | "conflict" | "uncertain" };

export type PublicOccurrenceOperations = {
  load: (slug: string, signal?: AbortSignal) => Promise<CondominiumResult>;
  register: (
    slug: string,
    attempt: RegistrationAttempt,
  ) => Promise<RegistrationResult>;
};
