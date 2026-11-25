import type { OccurrenceTracking } from "@/server/occurrences/tracking.contract";

export const trackingCodeFixture = "a".repeat(64);

export function occurrenceTrackingFixture(
  overrides: Partial<OccurrenceTracking> = {},
): OccurrenceTracking {
  return {
    condominiumName: "Edifício Sintético A",
    number: 1043,
    registeredAt: "2026-11-20T12:00:00Z",
    description: "Infiltração no teto da garagem, pingando em cima do carro.",
    unit: "Bloco B, apto 704",
    location: "Garagem, vaga 22",
    situation: { step: "received", label: "Recebida pelo síndico" },
    updates: [
      {
        occurredAt: "2026-11-20T12:00:00Z",
        text: "Ocorrência registrada. O síndico já recebeu.",
      },
    ],
    ...overrides,
  };
}
