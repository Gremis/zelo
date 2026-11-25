export const TRACKING_CODE_PATTERN = /^[0-9a-f]{64}$/;
const TRACKING_ORIGIN = "https://sindicondo.app";

export function trackingLink(code: string) {
  return `${TRACKING_ORIGIN}/o/${code}`;
}
