const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const calendarFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function calendarDate(date: Date) {
  const parts = calendarFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)!.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

export function formatQueueDate(value: string, now?: Date) {
  const date = new Date(value);
  const current = now ? calendarDate(now) : null;
  const recorded = calendarDate(date);
  if (current) {
    const day = (parts: typeof recorded) =>
      Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000;
    const difference = day(current) - day(recorded);
    if (difference === 0) return `hoje ${timeFormatter.format(date)}`;
    if (difference === 1) return `ontem ${timeFormatter.format(date)}`;
  }
  const day = String(recorded.day).padStart(2, "0");
  const month = String(recorded.month).padStart(2, "0");
  const year = current?.year === recorded.year ? "" : `/${recorded.year}`;
  return `${day}/${month}${year} ${timeFormatter.format(date)}`;
}

export function formatOccurrenceDateTitle(value: string) {
  return `${dateFormatter.format(new Date(value))} — Horário de Brasília`;
}
