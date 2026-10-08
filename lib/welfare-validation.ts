import { financeDate, financeMoney } from "./personal-finance-validation.ts";
import { welfareDocumentUuid } from "./welfare-document-upload.ts";

export type WelfareKind = "fund" | "contribution" | "expense" | "request" | "pledge";
export const welfareKinds = ["fund", "contribution", "expense", "request", "pledge"] as const;
export const welfarePaymentMethods = ["cash", "bank", "mobile", "card", "other"] as const;
export const welfareStatuses = {
  fund: ["active", "paused", "closed"], contribution: ["approved", "rejected", "refunded"],
  expense: ["approved", "paid", "rejected"], request: ["under_review", "approved", "rejected", "disbursed", "cancelled"],
  pledge: ["active", "paused", "completed", "cancelled"],
} as const;
export function isWelfareKind(value: unknown): value is WelfareKind {
  return typeof value === "string" && welfareKinds.includes(value as WelfareKind);
}
export function welfareObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
export { financeMoney as welfareMoney };

const choices: Record<WelfareKind, Record<string, readonly string[]>> = {
  fund: { category: ["general", "emergency", "medical", "education", "charity"], visibility: ["family", "admins"] },
  contribution: { paymentMethod: welfarePaymentMethods },
  expense: { category: ["medical", "education", "emergency", "charity", "operations", "other"], paymentMethod: welfarePaymentMethods },
  request: { requestType: ["medical", "education", "emergency", "livelihood", "charity", "other"], urgency: ["normal", "high", "critical"], visibility: ["admins", "family"] },
  pledge: { frequency: ["monthly", "quarterly", "yearly", "one_time"] },
};

// Normalize once, before any database mutation. No coercion of booleans or
// rounding fractional cents; no truncating invalid dates into valid dates.
export function validateWelfareRecord(kind: WelfareKind, value: unknown, today: string) {
  if (!welfareObject(value)) return { code: "WELFARE_INVALID_BODY" } as const;
  const data = { ...value };
  const moneyFields = kind === "fund" ? ["targetAmount", "openingBalance"] : [kind === "request" ? "requestedAmount" : "amount"];
  for (const key of moneyFields) {
    const parsed = financeMoney(data[key], kind === "fund" ? 0 : undefined);
    if (parsed === undefined || (kind === "fund" ? parsed < 0 : parsed <= 0)) return { code: "WELFARE_INVALID_MONEY" } as const;
    data[key] = parsed;
  }
  if (kind !== "fund") {
    if (kind === "request" && (data.fundId === undefined || data.fundId === null || data.fundId === "")) data.fundId = null;
    else if (!welfareDocumentUuid(data.fundId)) return { code: "WELFARE_INVALID_RECORD" } as const;
  }
  const dateKey = kind === "contribution" ? "contributionDate" : kind === "expense" ? "expenseDate" : kind === "pledge" ? "startDate" : null;
  if (dateKey) {
    const parsed = financeDate(data[dateKey] === undefined ? today : data[dateKey]);
    if (!parsed) return { code: "WELFARE_INVALID_DATE" } as const;
    data[dateKey] = parsed;
  }
  if (kind === "pledge") {
    const next = financeDate(data.nextDueDate);
    if (next === undefined || (next && next < String(data.startDate))) return { code: "WELFARE_INVALID_DATE" } as const;
    data.nextDueDate = next;
  }
  for (const [key, values] of Object.entries(choices[kind])) {
    if (data[key] !== undefined && (typeof data[key] !== "string" || !values.includes(data[key] as string))) return { code: "WELFARE_INVALID_OPTION" } as const;
  }
  return { data };
}

export function validateWelfareStatus(value: unknown) {
  if (!welfareObject(value)) return { code: "WELFARE_INVALID_BODY" } as const;
  const { entity, id, status } = value;
  if (!isWelfareKind(entity) || !welfareDocumentUuid(id)) return { code: "WELFARE_INVALID_RECORD" } as const;
  if (typeof status !== "string" || !(welfareStatuses[entity] as readonly string[]).includes(status)) return { code: "WELFARE_INVALID_OPTION" } as const;
  if (value.paymentMethod !== undefined && (typeof value.paymentMethod !== "string" || !(welfarePaymentMethods as readonly string[]).includes(value.paymentMethod))) return { code: "WELFARE_INVALID_OPTION" } as const;
  if (value.approvedAmount !== undefined && (financeMoney(value.approvedAmount) === undefined || Number(value.approvedAmount) < 0)) return { code: "WELFARE_INVALID_MONEY" } as const;
  return { data: { ...value, entity, id, status } };
}
