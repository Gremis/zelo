import { RISK_TERMS, type RiskTerm } from "./risk-terms";

export type RiskRulesResult =
  { hasRisk: true; term: RiskTerm } | { hasRisk: false; term: null };

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

const rules = RISK_TERMS.map((term) => {
  const expression = normalize(term)
    .split(" ")
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");

  return {
    term,
    pattern: new RegExp(`(?<![a-z0-9])${expression}(?![a-z0-9])`),
  };
});

export function detectRisk(where: string, report: string): RiskRulesResult {
  const text = normalize(`${where} ${report}`);
  const match = rules.find(({ pattern }) => pattern.test(text));

  return match
    ? { hasRisk: true, term: match.term }
    : { hasRisk: false, term: null };
}
