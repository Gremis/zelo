export const TRACKING_CODE_PATTERN = /^[0-9a-f]{64}$/;
const TRACKING_ORIGIN = "https://sindicondo.app";

export function trackingLink(code: string) {
  return `${TRACKING_ORIGIN}/o/${code}`;
}

export function formatTrackingMoment(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(value))
    .replace(", ", " às ");
}
