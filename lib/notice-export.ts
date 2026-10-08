import { healthTimestamp } from "./health-validation.ts";
import { qurbaniWorksheet } from "./qurbani-workbook.ts";

type Locale = "bn" | "en";
type NoticeExportItem = {
  title_bn: string; title_en: string | null; body_bn: string; body_en: string | null;
  category: string; priority: string; status: string; is_pinned: boolean;
  publish_at: string | null; expires_at: string | null; created_at: string; updated_at: string;
};
type Labels = { category: Record<string, string>; priority: Record<string, string>; status: Record<string, string> };
export const noticeExportColumns = [
  ["ক্রমিক", "Serial"], ["শিরোনাম (বাংলা)", "Title (Bangla)"], ["শিরোনাম (ইংরেজি)", "Title (English)"],
  ["বিস্তারিত (বাংলা)", "Details (Bangla)"], ["বিস্তারিত (ইংরেজি)", "Details (English)"],
  ["ক্যাটাগরি", "Category"], ["অগ্রাধিকার", "Priority"], ["অবস্থা", "Status"], ["পিন করা", "Pinned"],
  ["প্রকাশের সময়", "Publish time"], ["মেয়াদ শেষ", "Expiry"], ["তৈরির সময়", "Created at"],
  ["হালনাগাদের সময়", "Updated at"],
] as const;
export const noticeExportHeaders = (locale: Locale) => noticeExportColumns.map(pair => pair[locale === "bn" ? 0 : 1]);
const invalid = (): never => { throw new Error("NOTICE_EXPORT_INVALID_DATA"); };
function text(value: unknown, max: number, required = false): string {
  if (value === null || value === undefined) return required ? invalid() : "";
  return typeof value === "string" && value.length <= max && (!required || value.trim()) ? value : invalid();
}
function label(value: string, allowed: readonly string[], labels: Record<string, string>) {
  return allowed.includes(value) && Object.hasOwn(labels, value) ? text(labels[value], 180, true) : invalid();
}

// The caller supplies its currently visible, already-authorized API snapshot.
// Never spread a database record: family/auth/storage identifiers stay excluded.
export function noticeExportRows(notices: readonly NoticeExportItem[], locale: Locale, labels: Labels) {
  const headers = noticeExportHeaders(locale);
  return notices.map((notice, index) => {
    if (typeof notice.is_pinned !== "boolean") invalid();
    const values = [index + 1, text(notice.title_bn, 180, true), text(notice.title_en, 180),
      text(notice.body_bn, 5000, true), text(notice.body_en, 5000),
      label(notice.category, ["general", "urgent", "event", "finance", "qurbani", "health"], labels.category),
      label(notice.priority, ["normal", "high", "urgent"], labels.priority),
      label(notice.status, ["draft", "published", "archived"], labels.status),
      notice.is_pinned ? (locale === "bn" ? "হ্যাঁ" : "Yes") : (locale === "bn" ? "না" : "No"),
      notice.publish_at, notice.expires_at, notice.created_at, notice.updated_at];
    return Object.fromEntries(headers.map((header, i) => [header, values[i]]));
  });
}

export function noticeWorksheet(xlsx: typeof import("xlsx"), rows: Array<Record<string, unknown>>, locale: Locale, timeZone: string) {
  const headers = noticeExportHeaders(locale);
  const dateColumns = [9, 10, 11, 12].map(i => ({ header: headers[i], kind: "datetime" as const }));
  new Intl.DateTimeFormat("en", { timeZone }).format(0);
  const normalized = rows.map(source => {
    const row: Record<string, unknown> = Object.fromEntries(headers.map(header => [header, source[header] ?? ""]));
    for (const [i, { header }] of dateColumns.entries()) {
      const parsed = healthTimestamp(row[header]);
      if (parsed === undefined || (i >= 2 && !parsed)) invalid();
      // Native Excel dates use the 1900 calendar; reject unsupported years.
      if (parsed && (new Date(parsed).getUTCFullYear() < 1900 || new Date(parsed).getUTCFullYear() > 9999)) invalid();
      row[header] = parsed;
    }
    return row;
  });
  const sheet = qurbaniWorksheet(xlsx, normalized, headers, dateColumns, locale, timeZone);
  for (const c of [9, 10, 11, 12]) for (let r = 1; r <= rows.length; r++) {
    const cell = sheet[xlsx.utils.encode_cell({ c, r })];
    if (cell?.t !== "n") continue;
    if (cell.v < 2 || cell.v >= 2958466) invalid();
    // Excel's fictitious 1900-02-29 shifts January/February by one day.
    if (cell.v < 61) cell.v -= 1;
  }
  sheet["!cols"] = [8, 34, 30, 60, 60, 20, 18, 16, 12, 24, 24, 24, 24, 24].map(wch => ({ wch }));
  sheet["!autofilter"] = { ref: sheet["!ref"]! };
  return sheet;
}
