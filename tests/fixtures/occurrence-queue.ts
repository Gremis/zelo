import type {
  PortfolioQueue,
  QueueCard,
} from "@/server/occurrences/queue.contract";

function fixture(number: number, fields: Partial<QueueCard>): QueueCard {
  return {
    id: `77000000-0000-4000-8000-${number.toString().padStart(12, "0")}`,
    number,
    status: "new",
    condominium: {
      id: "77000000-0000-4000-9000-000000000001",
      name: "Edifício Sintético A",
    },
    reporterUnitOrRole: "Unidade fictícia 101",
    description: "Relato sintético para revisão da apresentação.",
    location: "Hall sintético",
    suggestedPriority: "normal",
    finalPriority: null,
    effectivePriority: "normal",
    suggestionReason: "Exemplo de apresentação: manutenção sem risco indicado.",
    suggestionSource: "rules",
    suggestionPending: true,
    reporterName: "Pessoa Sintética Um",
    registeredAt: "2026-11-22T12:05:00Z",
    completedAt: null,
    responsibleName: null,
    dueDate: null,
    ...fields,
  };
}

export const queueEmptyFixture: PortfolioQueue = {
  columns: {
    new: { count: 0, items: [] },
    in_progress: { count: 0, items: [] },
    delegated: { count: 0, items: [] },
    completed: { count: 0, items: [] },
  },
  openByPriority: { urgent: 0, normal: 0, low: 0, unclassified: 0 },
};

export function queueFixture(
  variant: "fixtures" | "all" | "stress" = "fixtures",
): PortfolioQueue {
  const items = [
    fixture(7704, {
      isDemo: true,
      description:
        "Relato sintético: cheiro de gás no hall do quinto andar, próximo ao acesso do salão.",
      location: "Hall sintético do quinto andar",
      suggestedPriority: "urgent",
      effectivePriority: "urgent",
      suggestionReason: "Menciona gás: risco à segurança.",
    }),
    fixture(7701, {
      description:
        "Relato sintético: lâmpada da garagem piscando perto da vaga de demonstração.",
      location: "Garagem sintética",
      registeredAt: "2026-11-20T21:10:00Z",
      reporterName: "Pessoa Sintética Dois",
    }),
    fixture(7703, {
      description:
        "Relato sintético: torneira do jardim pingando desde o início da manhã.",
      location: "Jardim sintético",
      reporterUnitOrRole: "Função fictícia: apoio",
      condominium: {
        id: "77000000-0000-4000-9000-000000000002",
        name: "Edifício Sintético B",
      },
      reporterName: "Pessoa Sintética Três",
      registeredAt: "2026-11-22T11:20:00Z",
    }),
    fixture(7702, {
      description:
        "Exemplo visual sintético de solicitação que pode aguardar avaliação.",
      location: null,
      suggestedPriority: "low",
      effectivePriority: "low",
      suggestionReason:
        "Prioridade de exemplo para testar a apresentação de Baixa.",
      reporterName: "Pessoa Sintética Quatro",
      reporterUnitOrRole: null,
    }),
  ];
  const data: PortfolioQueue = {
    columns: {
      new: { count: 4, items },
      in_progress: { count: 0, items: [] },
      delegated: { count: 0, items: [] },
      completed: { count: 0, items: [] },
    },
    openByPriority: { urgent: 1, normal: 2, low: 1, unclassified: 0 },
  };
  if (variant === "all") {
    data.columns.in_progress = {
      count: 1,
      items: [
        fixture(7711, {
          status: "in_progress",
          finalPriority: "low",
          effectivePriority: "low",
          suggestionPending: false,
        }),
      ],
    };
    data.columns.delegated = {
      count: 1,
      items: [
        fixture(7712, {
          status: "delegated",
          suggestedPriority: null,
          effectivePriority: null,
          suggestionSource: null,
          suggestionReason: null,
          suggestionPending: false,
          reporterName: null,
          location: null,
        }),
      ],
    };
    data.columns.completed = {
      count: 1,
      items: [
        fixture(7713, {
          status: "completed",
          finalPriority: "normal",
          suggestionPending: false,
          completedAt: "2026-11-22T15:00:00Z",
        }),
      ],
    };
    data.openByPriority = { urgent: 1, normal: 2, low: 2, unclassified: 1 };
  }
  if (variant === "stress") {
    items[0] = {
      ...items[0],
      condominium: {
        ...items[0].condominium,
        name: "Condomínio Sintético de Nome Muito Extenso para Revisão de Leitura e Quebra de Linha",
      },
      reporterUnitOrRole:
        "Unidade fictícia Torre de Demonstração — apartamento sintético de identificação extensa",
      description:
        "Relato inteiramente sintético para testar textos extensos. ".repeat(
          12,
        ),
      suggestionReason:
        "Motivo sintético extenso para verificar a quebra de linha e a leitura do conteúdo sem perda de informação. ".repeat(
          4,
        ),
      location: "LocalizaçãoSintéticaSemEspaços".repeat(8),
    };
  }
  return data;
}
