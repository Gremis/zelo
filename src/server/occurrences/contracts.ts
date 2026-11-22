export type PublicRegistration = {
  type: "registered";
  condominiumSlug: string;
  reporterName: string;
  reporterPhone: string;
  reporterUnitOrRole: string;
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

export type OccurrenceEventRepository = {
  registerPublic(input: PublicRegistration): Promise<RegistrationReceipt>;
  appendInternalNote(input: InternalNote): Promise<{ eventId: number }>;
};

export class OccurrenceWriteError extends Error {
  constructor(
    public readonly code: "invalid_input" | "access_denied" | "unavailable",
  ) {
    super("Occurrence operation could not be completed.");
    this.name = "OccurrenceWriteError";
  }
}
