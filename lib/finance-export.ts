import { financeDate } from "./personal-finance-validation.ts";
type Locale = "bn" | "en";
export const financeExportColumns = {
  Summary: [["মাস", "Month"], ["বর্তমান ব্যালান্স", "Current balance"], ["আয়", "Income"], ["ব্যয়", "Expense"], ["নিট নগদ প্রবাহ", "Net cashflow"], ["বাজেট সীমা", "Budget limit"], ["বাজেট ব্যবহারের শতাংশ", "Budget used percent"], ["বকেয়া পাওনা", "Lent outstanding"], ["বকেয়া দেনা", "Borrowed outstanding"], ["অপেক্ষমাণ বিল", "Pending bills"], ["অপেক্ষমাণ বিলের পরিমাণ", "Pending bill amount"]],
  Accounts: [["অ্যাকাউন্ট", "Account"], ["ধরন", "Type"], ["প্রারম্ভিক ব্যালান্স", "Opening balance"], ["বর্তমান ব্যালান্স", "Current balance"], ["মুদ্রা", "Currency"], ["স্ট্যাটাস", "Status"]],
  Transactions: [["তারিখ", "Date"], ["দিক", "Direction"], ["ক্যাটাগরি", "Category"], ["অ্যাকাউন্ট", "Account"], ["পরিমাণ", "Amount"], ["পদ্ধতি", "Method"], ["পুনরাবৃত্ত", "Recurring"], ["রেফারেন্স", "Reference"], ["নোট", "Notes"]],
  Budgets: [["মাস", "Month"], ["ক্যাটাগরি", "Category"], ["সীমা", "Limit"], ["ব্যয়", "Spent"], ["অবশিষ্ট", "Remaining"], ["সতর্কতার শতাংশ", "Alert percent"], ["নোট", "Notes"]],
  Debts: [["ধরন", "Type"], ["ব্যক্তি", "Person"], ["মূল পরিমাণ", "Principal"], ["নিষ্পত্তি", "Settled"], ["বাকি", "Outstanding"], ["নির্ধারিত তারিখ", "Due date"], ["স্ট্যাটাস", "Status"], ["নোট", "Notes"]],
  Bills: [["বিল", "Bill"], ["ক্যাটাগরি", "Category"], ["পরিমাণ", "Amount"], ["নির্ধারিত তারিখ", "Due date"], ["পুনরাবৃত্তি", "Recurrence"], ["স্ট্যাটাস", "Status"], ["নোট", "Notes"]],
  Goals: [["লক্ষ্য", "Goal"], ["লক্ষ্যমাত্রা", "Target"], ["সঞ্চিত", "Saved"], ["অবশিষ্ট", "Remaining"], ["লক্ষ্যের তারিখ", "Target date"], ["স্ট্যাটাস", "Status"], ["নোট", "Notes"]],
} as const;
export type FinanceExportSheet = keyof typeof financeExportColumns;
export function financeExportHeaders(sheet: FinanceExportSheet, locale: Locale): string[] {
  return financeExportColumns[sheet].map((pair) => pair[locale === "bn" ? 0 : 1]);
}
export function financeWorksheet(xlsx: typeof import("xlsx"), rows: Array<Record<string, unknown>>, sheet: FinanceExportSheet, locale: Locale) {
  const headers = financeExportHeaders(sheet, locale);
  const dateHeader = sheet === "Transactions" ? (locale === "bn" ? "তারিখ" : "Date")
    : ["Debts", "Bills"].includes(sheet) ? (locale === "bn" ? "নির্ধারিত তারিখ" : "Due date")
    : sheet === "Goals" ? (locale === "bn" ? "লক্ষ্যের তারিখ" : "Target date") : null;
  const dateColumn = headers.indexOf(dateHeader ?? "");
  const values = rows.map((row) => headers.map((header, column) => {
    const value = row[header] ?? "";
    if (column !== dateColumn || value === "") return value;
    const valid = financeDate(value);
    if (!valid) throw new Error("Invalid finance export date.");
    return (Date.parse(`${valid}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400000;
  }));
  const result = xlsx.utils.aoa_to_sheet([headers, ...values]);
  if (dateColumn !== -1) for (let row = 1; row <= rows.length; row += 1) {
    const cell = result[xlsx.utils.encode_cell({ c: dateColumn, r: row })];
    if (cell?.t === "n") cell.z = "yyyy-mm-dd";
  }
  return result;
}
