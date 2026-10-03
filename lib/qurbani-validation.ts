function decimal(value: unknown, wholeDigits: number, fallback?: number): number | undefined {
  if (value === null || value === undefined || value === "") return fallback;
  const text = typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
  if (!new RegExp(`^(?:0|[1-9]\\d{0,${wholeDigits - 1}})(?:\\.\\d{1,2})?$`).test(text)) return undefined;
  const amount = Number(text);
  return Number.isFinite(amount) ? amount : undefined;
}

// Keep API input within the PostgreSQL numeric(p,2) columns, without DB rounding.
export const qurbaniMoney = (value: unknown, fallback?: number) => decimal(value, 12, fallback);
export const qurbaniShares = (value: unknown, fallback?: number) => decimal(value, 8, fallback);
export const qurbaniWeight = (value: unknown, fallback?: number) => decimal(value, 10, fallback);

export function qurbaniPositiveInteger(value: unknown, fallback?: number): number | undefined {
  if (value === null || value === undefined || value === "") return fallback;
  const text = typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
  if (!/^[1-9]\d*$/.test(text)) return undefined;
  const number = Number(text);
  return Number.isSafeInteger(number) && number <= 2_147_483_647 ? number : undefined;
}

function hundredths(value: number): bigint {
  const [whole, fraction = ""] = String(value).split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
}

export function qurbaniAutoAmountDue(shareCount: number, sharePrice: unknown): number | undefined {
  const shares = qurbaniShares(shareCount);
  const price = qurbaniMoney(sharePrice);
  if (shares === undefined || price === undefined) return undefined;
  const cents = (hundredths(shares) * hundredths(price) + BigInt(50)) / BigInt(100);
  return cents <= BigInt("99999999999999") ? Number(cents) / 100 : undefined;
}

export function qurbaniDate(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const date = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith("0000-")) return undefined;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : undefined;
}

// Timestamps sent to the API must carry a timezone. A browser datetime-local
// value is converted to UTC before sending, never interpreted in the DB zone.
export function qurbaniTimestamp(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  const match = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.exec(text);
  if (!match || qurbaniDate(match[1]) === undefined || (/^[+-]14:/.test(match[3]) && !match[3].endsWith(":00"))) return undefined;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export function qurbaniLocalDateTimeToIso(value: string): string | null | undefined {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match || qurbaniDate(match[1]) === undefined) return undefined;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && qurbaniIsoToLocalDateTime(parsed.toISOString()) === value
    ? parsed.toISOString() : undefined;
}

export function qurbaniIsoToLocalDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const part = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`;
}
