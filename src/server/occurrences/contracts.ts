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

export type RuleSuggestion = {
  suggestedPriority: "urgent" | "normal";
  suggestionReason: string;
  suggestionSource: "rules";
};

export type CalculatedRegistration = PublicRegistration & RuleSuggestion;

export type OccurrenceEventService = {
  registerPublic(input: PublicRegistration): Promise<RegistrationReceipt>;
  appendInternalNote(input: InternalNote): Promise<{ eventId: number }>;
};

export type OccurrenceEventRepository = {
  registerPublic(input: CalculatedRegistration): Promise<RegistrationReceipt>;
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
