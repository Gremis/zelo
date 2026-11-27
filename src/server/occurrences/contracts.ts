export type PublicRegistration = {
  type: "registered";
  attemptKey?: string;
  condominiumSlug: string;
  reporterName: string;
  reporterPhone: string;
  reporterUnitOrRole: string;
  location: string;
  description: string;
};

export type InternalNote = {
  type: "manager_update";
  occurrenceId: string;
  note: string;
};

export type RegistrationReceipt = {
  occurrenceId: string;
  number: number;
  trackingCode: string;
};

// Sugestão calculada antes da gravação. Com a IA (ORI-71), a prioridade pode
// ser "low" e a origem "ai"; categoria e falha da IA entram junto (métrica).
export type Suggestion = {
  suggestedPriority: "low" | "normal" | "urgent";
  suggestionReason: string;
  suggestionSource: "ai" | "rules";
  category: string | null;
  aiFailureReason: string | null;
};

export type CalculatedRegistration = PublicRegistration & Suggestion;

// ORI-89: "como chegou" quando o síndico registra pelo painel.
export const MANAGER_CHANNELS = [
  "whatsapp",
  "phone",
  "in_person",
  "email",
  "inspection",
] as const;
export type ManagerChannel = (typeof MANAGER_CHANNELS)[number];

// ORI-89: registro pelo síndico. O autor é o próprio síndico (via sessão), por
// isso não vem no contrato; quem relatou é opcional.
export type ManagerRegistration = {
  type: "registered";
  condominiumId: string;
  channel: ManagerChannel;
  location: string;
  description: string;
  reporterName?: string;
  reporterPhone?: string;
  reporterUnitOrRole?: string;
};

export type CalculatedManagerRegistration = ManagerRegistration & Suggestion;

export type OccurrenceEventService = {
  registerPublic(input: PublicRegistration): Promise<RegistrationReceipt>;
  registerByManager(input: ManagerRegistration): Promise<RegistrationReceipt>;
  appendInternalNote(input: InternalNote): Promise<{ eventId: number }>;
};

export type OccurrenceEventRepository = {
  registerPublic(input: CalculatedRegistration): Promise<RegistrationReceipt>;
  registerByManager(
    input: CalculatedManagerRegistration,
  ): Promise<RegistrationReceipt>;
  appendInternalNote(input: InternalNote): Promise<{ eventId: number }>;
};

export class OccurrenceWriteError extends Error {
  constructor(
    public readonly code:
      | "invalid_input"
      | "access_denied"
      | "unavailable"
      | "not_found"
      | "conflict",
  ) {
    super("Occurrence operation could not be completed.");
    this.name = "OccurrenceWriteError";
  }
}
