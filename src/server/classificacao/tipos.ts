// Tipos compartilhados da classificação (ORI-83).

export const PRIORIDADES = ["Urgente", "Normal", "Baixa"] as const;
export type Prioridade = (typeof PRIORIDADES)[number];

// Lista fechada de 12 categorias. A IA precisa devolver uma destas, escrita igual.
export const CATEGORIAS = [
  "Vazamento e hidráulica",
  "Elétrica",
  "Iluminação",
  "Gás",
  "Estrutura",
  "Elevador",
  "Portão e acesso",
  "Segurança",
  "Limpeza e conservação",
  "Barulho e convivência",
  "Gastos e orçamento",
  "Outros",
] as const;
export type Categoria = (typeof CATEGORIAS)[number];

// Origem da sugestão (occurrences.suggestion_source). "ai", não "ia".
export type Origem = "ai" | "rules";

// Enum de prioridade do banco (occurrences.suggested_priority / final_priority).
export type PrioridadeDb = "low" | "normal" | "urgent";

// Prioridade (pt, como a IA responde) -> enum do banco.
export const PRIORIDADE_DB: Record<Prioridade, PrioridadeDb> = {
  Urgente: "urgent",
  Normal: "normal",
  Baixa: "low",
};
