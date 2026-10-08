import { financeDate } from "./personal-finance-validation.ts";
export const healthDate = financeDate;

export function healthNumber(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const text = String(value).trim();
  if (!text) return null;
  if (!/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(text)) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}
export function healthDecimal(value: unknown): number | null | undefined {
  const parsed = healthNumber(value);
  if (parsed === null || parsed === undefined) return parsed;
  if (Math.abs(parsed) > 99_999_999.99 || !/^-?\d+(?:\.\d{1,2})?$/.test(String(parsed))) return undefined;
  return parsed;
}
export function healthTimestamp(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(text) || !healthDate(text.slice(0, 10))) return undefined;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}
export function healthLocalInputToIso(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) || !healthDate(value.slice(0, 10))) throw new Error("Invalid local date/time.");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Invalid local date/time.");
  return parsed.toISOString();
}
export function healthReminderMinutes(value: unknown): number | undefined {
  const parsed = healthNumber(value);
  if (parsed === undefined) return undefined;
  if (parsed === null) return 60;
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 10080 ? parsed : undefined;
}
export function healthReminderTimes(value: unknown): string[] | undefined {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value) || value.length > 12 || value.some(v => typeof v !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v))) return undefined;
  return [...new Set(value as string[])];
}
export function healthUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) ? text : null;
}
