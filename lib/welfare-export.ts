import { financeDate, financeMoney } from "./personal-finance-validation.ts";
import { healthTimestamp } from "./health-validation.ts";
import { qurbaniWorksheet } from "./qurbani-workbook.ts";
import { welfareExportHeaders, type WelfareExportSheet } from "./welfare-export-headers.ts";
import type { WelfarePayload } from "./welfare-types";

type Locale = "bn" | "en";
const invalid = () => { throw new Error("WELFARE_EXPORT_INVALID_DATA"); };
const money = (value: unknown) => {
  const parsed = financeMoney(value);
  return parsed === undefined || parsed < 0 ? invalid() : parsed;
};
const dateColumns: Record<WelfareExportSheet, ReadonlyArray<readonly [number, "date" | "datetime", boolean]>> = {
  Funds: [[7, "datetime", true], [8, "datetime", true]],
  Contributions: [[0, "date", true], [9, "datetime", false], [10, "datetime", true]],
  Expenses: [[0, "date", true], [12, "datetime", false], [13, "datetime", false], [14, "datetime", true]],
  "Assistance Requests": [[0, "datetime", true], [13, "datetime", false], [14, "datetime", true]],
  Pledges: [[4, "date", true], [5, "date", false], [8, "datetime", true], [9, "datetime", true]],
  Documents: [[6, "datetime", true]],
};
const moneyColumns: Record<WelfareExportSheet, number[]> = {
  Funds: [2, 3], Contributions: [3], Expenses: [5], "Assistance Requests": [4, 5], Pledges: [3], Documents: [],
};

// Export the already-authorized API snapshot, not authentication/storage fields.
// Exported IDs identify visible application records, not user accounts.
export function welfareExportRows(payload: WelfarePayload, locale: Locale, label: (value: string) => string) {
  const { funds = [], contributions = [], expenses = [], requests = [], pledges = [], documents = [] } = payload;
  const names = new Map(funds.map(f => [f.id, f.name]));
  const fund = (id: string | null) => id ? names.get(id) ?? (locale === "bn" ? "উপলভ্য নয়" : "Unavailable") : "";
  const rows = (sheet: WelfareExportSheet, values: unknown[][]) => {
    const headers = welfareExportHeaders(sheet, locale);
    return values.map(value => Object.fromEntries(headers.map((header, i) => [header, value[i] ?? ""])));
  };
  return {
    Funds: rows("Funds", funds.map(r => [r.name, label(r.category), money(r.target_amount), money(r.opening_balance), label(r.status), label(r.visibility), r.description, r.created_at, r.updated_at, r.id])),
    Contributions: rows("Contributions", contributions.map(r => [r.contribution_date, fund(r.fund_id), r.contributor_name, money(r.amount), label(r.payment_method), r.reference, label(r.status), r.approved_by_name, r.notes, r.approved_at, r.created_at, r.id])),
    Expenses: rows("Expenses", expenses.map(r => [r.expense_date, fund(r.fund_id), r.title, r.beneficiary_name, label(r.category), money(r.amount), label(r.payment_method), r.reference, label(r.status), r.approved_by_name, r.notes, r.linked_request_id, r.approved_at, r.paid_at, r.created_at, r.id])),
    "Assistance Requests": rows("Assistance Requests", requests.map(r => [r.created_at, r.requester_name, label(r.request_type), r.title, money(r.requested_amount), money(r.approved_amount), label(r.urgency), label(r.visibility), label(r.status), r.admin_note, fund(r.fund_id), r.description, r.reviewed_by_name, r.reviewed_at, r.updated_at, r.id])),
    Pledges: rows("Pledges", pledges.map(r => [r.member_name, fund(r.fund_id), label(r.frequency), money(r.amount), r.start_date, r.next_due_date, label(r.status), r.notes, r.created_at, r.updated_at, r.id])),
    Documents: rows("Documents", documents.filter(r => r.can_view).map(r => {
      if (!Number.isSafeInteger(r.file_size) || r.file_size < 0) invalid();
      return [r.title, label(r.document_type), `${label(r.entity_type)}:${r.entity_id}`, r.file_name, label(r.visibility), r.uploaded_by_name, r.created_at, r.mime_type, r.file_size, r.id];
    })),
  };
}

export function welfareWorksheet(xlsx: typeof import("xlsx"), rows: Array<Record<string, unknown>>, sheet: WelfareExportSheet, locale: Locale, timeZone: string) {
  const headers = welfareExportHeaders(sheet, locale);
  const dates = dateColumns[sheet].map(([i, kind, required]) => ({ header: headers[i], kind, required }));
  const normalized = rows.map(source => {
    const row = { ...source };
    for (const { header, kind, required } of dates) {
      const parsed = kind === "date" ? financeDate(row[header]) : healthTimestamp(row[header]);
      if (parsed === undefined || (required && !parsed)) invalid();
      row[header] = parsed;
    }
    for (const i of moneyColumns[sheet]) row[headers[i]] = money(row[headers[i]]);
    return row;
  });
  new Intl.DateTimeFormat("en", { timeZone }).format(0);
  const result = qurbaniWorksheet(xlsx, normalized, headers, dates, locale, timeZone);
  for (const i of moneyColumns[sheet]) for (let r = 1; r <= rows.length; r++) {
    const cell = result[xlsx.utils.encode_cell({ c: i, r })];
    if (cell?.t === "n") cell.z = "#,##0.00";
  }
  const columns = [...headers, locale === "bn" ? "সময় অঞ্চল" : "Time zone"];
  result["!cols"] = columns.map((header, i) => ({ wch: dates.some(d => d.header === header) ? 22 : Math.min(64, Math.max(16, header.length + 3, ...rows.slice(0, 200).map(row => String(row[header] ?? "").length + 2), i === headers.length ? timeZone.length + 2 : 0)) }));
  result["!autofilter"] = { ref: result["!ref"]! };
  return result;
}
