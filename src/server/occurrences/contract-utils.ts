export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid occurrence response.");
  return value as Record<string, unknown>;
}

export function string(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid occurrence field.");
  return value;
}

export function nullableString(value: unknown): string | null {
  return value === null ? null : string(value);
}

export function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("Invalid occurrence count.");
  return value;
}

export function date(value: unknown): string {
  const result = string(value);
  if (!Number.isFinite(Date.parse(result)))
    throw new Error("Invalid occurrence date.");
  return result;
}

export function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Invalid occurrence flag.");
  return value;
}
