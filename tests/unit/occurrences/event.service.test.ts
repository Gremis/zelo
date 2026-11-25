import { beforeEach, expect, test, vi } from "vitest";
import { createOccurrenceEventService } from "@/server/occurrences/event.service";
import type {
  InternalNote,
  PublicRegistration,
} from "@/server/occurrences/contracts";

vi.mock("server-only", () => ({}));
const repository = {
  registerPublic: vi.fn(),
  registerByManager: vi.fn(),
  appendInternalNote: vi.fn(),
};
const service = createOccurrenceEventService(repository);
const registration: PublicRegistration = {
  type: "registered",
  condominiumSlug: "synthetic-abcd",
  reporterName: "Synthetic reporter",
  reporterPhone: "11900000000",
  reporterUnitOrRole: "Synthetic unit",
  location: "Synthetic hall",
  description: "Synthetic report",
};
const note: InternalNote = {
  type: "manager_update",
  occurrenceId: "64000000-0000-4000-8000-000000000001",
  note: "Internal note",
};
beforeEach(() => vi.resetAllMocks());

test("public registration is one operation with trimmed self-declared fields", async () => {
  const receipt = {
    occurrenceId: note.occurrenceId,
    number: 1,
    trackingCode: "a".repeat(64),
  };
  repository.registerPublic.mockResolvedValue(receipt);
  expect(
    await service.registerPublic({
      ...registration,
      reporterUnitOrRole: "  Synthetic unit  ",
    }),
  ).toEqual(receipt);
  expect(repository.registerPublic).toHaveBeenCalledExactlyOnceWith({
    ...registration,
    suggestedPriority: "normal",
    suggestionReason: "Sem sinal de risco no relato.",
    suggestionSource: "rules",
  });
  expect(repository.appendInternalNote).not.toHaveBeenCalled();
});

test.each([
  null,
  [],
  {},
  { ...registration, reporterUnitOrRole: undefined },
  { ...registration, location: undefined },
  { ...registration, location: " " },
  { ...registration, location: "x".repeat(201) },
  { ...registration, suggestedPriority: "urgent" },
  { ...registration, suggestionReason: "Forged reason" },
  { ...registration, suggestionSource: "ai" },
  { ...registration, reporterUnitOrRole: "  " },
  { ...registration, reporterName: " " },
  { ...registration, reporterPhone: "119" },
  { ...registration, description: "x".repeat(10001) },
  { ...registration, description: "invalid\0value" },
  { ...registration, condominiumSlug: note.occurrenceId },
  { ...registration, condominiumId: note.occurrenceId },
  { ...registration, type: "system" },
  { ...registration, occurrenceId: note.occurrenceId },
  { ...registration, authorProfileId: note.occurrenceId },
  { ...registration, visibleToResident: true },
  { ...registration, data: { publicText: "Leak" } },
])("rejects invalid or overprivileged public payload %#", async (input) => {
  await expect(
    service.registerPublic(input as PublicRegistration),
  ).rejects.toMatchObject({ code: "invalid_input" });
  expect(repository.registerPublic).not.toHaveBeenCalled();
});

test("authenticated note only delegates the supported typed action", async () => {
  repository.appendInternalNote.mockResolvedValue({ eventId: 1 });
  expect(await service.appendInternalNote(note)).toEqual({ eventId: 1 });
  expect(repository.appendInternalNote).toHaveBeenCalledExactlyOnceWith(note);
  expect(repository.registerPublic).not.toHaveBeenCalled();
});

test.each([
  { ...note, type: "completed" },
  { ...note, type: "ai_suggestion" },
  { ...note, type: "priority_changed" },
  { ...note, type: "employee_message" },
  { ...note, authorType: "system" },
  { ...note, authorProfileId: note.occurrenceId },
  { ...note, occurredAt: "2000-01-01" },
  { ...note, visibleToResident: true },
  { ...note, publicText: "Leak" },
  { ...note, data: {} },
  { ...note, occurrenceId: "invalid" },
  { ...note, note: " " },
])("rejects unsupported actions or forged note fields %#", async (input) => {
  await expect(
    service.appendInternalNote(input as InternalNote),
  ).rejects.toMatchObject({ code: "invalid_input" });
  expect(repository.appendInternalNote).not.toHaveBeenCalled();
});

test("write failure propagates without compensating writes or retry", async () => {
  repository.registerPublic.mockRejectedValue(new Error("Synthetic failure"));
  await expect(service.registerPublic(registration)).rejects.toThrow(
    "Synthetic failure",
  );
  expect(repository.registerPublic).toHaveBeenCalledTimes(1);
  expect(repository.appendInternalNote).not.toHaveBeenCalled();
});

test.each([
  [
    "Hall",
    "Cheiro de gás no hall do 5º andar",
    "urgent",
    "Menciona gás: risco à segurança.",
  ],
  [
    "Hall",
    "Gasto alto com a conta de água",
    "normal",
    "Sem sinal de risco no relato.",
  ],
  ["GÁS", "Relato sem risco", "urgent", "Menciona gás: risco à segurança."],
  [
    "cheiro de",
    "QUEIMADO",
    "urgent",
    "Menciona cheiro de queimado: risco à segurança.",
  ],
  ["fogo", "ga\u0301s", "urgent", "Menciona gás: risco à segurança."],
  [
    "Hall",
    "Tomada dando   choque",
    "urgent",
    "Menciona dando choque: risco à segurança.",
  ],
])(
  "calculates before the single write for %s / %s",
  async (location, description, suggestedPriority, suggestionReason) => {
    await service.registerPublic({ ...registration, location, description });
    expect(repository.registerPublic).toHaveBeenCalledExactlyOnceWith({
      ...registration,
      location,
      description,
      suggestedPriority,
      suggestionReason,
      suggestionSource: "rules",
    });
    expect(repository.appendInternalNote).not.toHaveBeenCalled();
  },
);
