export function financeDate(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const date = value.trim();
  if (!date) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number(date.slice(0, 4)) === 0) {
    return undefined;
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    return undefined;
  }
  return date;
}

export function financeMonthDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value.trim())) return null;
  const firstDay = `${value.trim()}-01`;
  return financeDate(firstDay) === firstDay ? firstDay : null;
}

// PostgreSQL numeric(14,2) must not silently round fractional cents or overflow.
export function financeMoney(value: unknown, fallback?: number): number | undefined {
  if (value === null || value === undefined || value === "") return fallback;
  const text = typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
  if (!/^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(text)) return undefined;
  const amount = Number(text);
  return Number.isFinite(amount) && Math.abs(amount) <= 999_999_999_999.99 ? amount : undefined;
}

export function financeAlertPercent(value: unknown, fallback = 80): number | undefined {
  if (value === null || value === undefined || value === "") return fallback;
  const text = typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
  if (!/^(?:[1-9]|[1-9]\d|100)$/.test(text)) return undefined;
  return Number(text);
}
