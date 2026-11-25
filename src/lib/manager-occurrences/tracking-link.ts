// Helper mínimo do link de acompanhamento usado pelo recibo do registro pelo
// síndico (ORI-97). Desacoplado do tracking-link do morador (ORI-67), que está
// sendo refeito em outra frente; quando ele entrar no develop, dá para convergir.
export const TRACKING_CODE_PATTERN = /^[0-9a-f]{64}$/;
const TRACKING_ORIGIN = "https://sindicondo.app";

export function trackingLink(code: string) {
  return `${TRACKING_ORIGIN}/o/${code}`;
}
