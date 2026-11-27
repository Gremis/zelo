import { beforeEach, expect, test, vi } from "vitest";

// A classificação (IA + regras) é testada em classificacao/*. Aqui mockamos o
// classificar() para verificar só a integração: uma chamada, campos mapeados.
const classificar = vi.hoisted(() => vi.fn());
vi.mock("@/server/classificacao/classificar", () => ({ classificar }));
vi.mock("server-only", () => ({}));

import { createOccurrenceEventService } from "@/server/occurrences/event.service";
import type {
  InternalNote,
  PublicRegistration,
} from "@/server/occurrences/contracts";

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

beforeEach(() => {
  vi.resetAllMocks();
  classificar.mockResolvedValue({
    prioridade: "normal",
    categoria: null,
    motivo: "Sem sinal de risco no relato.",
    origem: "rules",
    falhaIa: null,
  });
});

test("public registration maps the AI suggestion into one write", async () => {
  classificar.mockResolvedValue({
    prioridade: "urgent",
    categoria: "Gás",
    motivo: "Cheiro de gás.",
    origem: "ai",
    falhaIa: null,
  });
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

  // Só "onde" e "o que aconteceu" vão para a classificação (LGPD).
  expect(classificar).toHaveBeenCalledExactlyOnceWith(
    "Synthetic hall",
    "Synthetic report",
  );
  expect(repository.registerPublic).toHaveBeenCalledExactlyOnceWith({
    ...registration,
    suggestedPriority: "urgent",
    suggestionReason: "Cheiro de gás.",
    suggestionSource: "ai",
    category: "Gás",
    aiFailureReason: null,
  });
  expect(repository.appendInternalNote).not.toHaveBeenCalled();
});

test.each([
  [
    {
      prioridade: "low",
      categoria: "Outros",
      motivo: "É uma sugestão, sem risco.",
      origem: "ai",
      falhaIa: null,
    },
    {
      suggestedPriority: "low",
      suggestionReason: "É uma sugestão, sem risco.",
      suggestionSource: "ai",
      category: "Outros",
      aiFailureReason: null,
    },
  ],
  [
    {
      prioridade: "normal",
      categoria: null,
      motivo: "Sem sinal de risco no relato.",
      origem: "rules",
      falhaIa: "timeout",
    },
    {
      suggestedPriority: "normal",
      suggestionReason: "Sem sinal de risco no relato.",
      suggestionSource: "rules",
      category: null,
      aiFailureReason: "timeout",
    },
  ],
])(
  "maps the classifier result into the single write %#",
  async (s, expected) => {
    classificar.mockResolvedValue(s);

    await service.registerPublic(registration);

    expect(repository.registerPublic).toHaveBeenCalledExactlyOnceWith({
      ...registration,
      ...expected,
    });
    expect(repository.appendInternalNote).not.toHaveBeenCalled();
  },
);

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
])("rejects invalid or overprivileged public payload %#", async (input) => {
  await expect(
    service.registerPublic(input as PublicRegistration),
  ).rejects.toMatchObject({ code: "invalid_input" });
  expect(classificar).not.toHaveBeenCalled();
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
  { ...note, type: "priority_changed" },
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
