import { healthDate, healthTimestamp } from "./health-validation.ts";
import { qurbaniWorksheet } from "./qurbani-workbook.ts";
type Locale = "bn" | "en";
export const healthExportColumns = {
  Profile: [["নাম", "Name"], ["রক্তের গ্রুপ", "Blood group"], ["জন্মতারিখ", "Birth date"], ["উচ্চতা সেমি", "Height cm"], ["ওজন কেজি", "Weight kg"], ["রোগাবস্থা", "Conditions"], ["অ্যালার্জি", "Allergies"], ["জরুরি নোট", "Emergency notes"], ["চিকিৎসক", "Doctor"], ["চিকিৎসকের ফোন", "Doctor phone"], ["জরুরি যোগাযোগ", "Emergency contact"], ["জরুরি ফোন", "Emergency phone"], ["রক্তদাতা উপলভ্য", "Donor available"], ["সর্বশেষ দান", "Last donation"], ["দৃশ্যমানতা", "Visibility"]],
  Medications: [["ওষুধ", "Medicine"], ["মাত্রা", "Dosage"], ["ব্যবধান", "Frequency"], ["সময়", "Times"], ["শুরু", "Start"], ["শেষ", "End"], ["চিকিৎসক", "Doctor"], ["স্ট্যাটাস", "Status"], ["নির্দেশনা", "Instructions"]],
  Appointments: [["অ্যাপয়েন্টমেন্ট", "Appointment"], ["চিকিৎসক", "Doctor"], ["প্রতিষ্ঠান", "Facility"], ["সময়সূচি", "Schedule"], ["রিমাইন্ডার মিনিট", "Reminder minutes"], ["স্ট্যাটাস", "Status"], ["নোট", "Notes"]],
  Measurements: [["ধরন", "Type"], ["প্রাথমিক মান", "Primary"], ["দ্বিতীয় মান", "Secondary"], ["একক", "Unit"], ["সময়", "Time"], ["নোট", "Notes"]],
  Documents: [["শিরোনাম", "Title"], ["ক্যাটাগরি", "Category"], ["তারিখ", "Date"], ["ফাইল", "File"], ["আকার", "Size"], ["নোট", "Notes"]],
  Directory: [["সদস্য", "Member"], ["রক্তের গ্রুপ", "Blood group"], ["রক্তদাতা", "Donor"], ["সর্বশেষ দান", "Last donation"], ["অ্যালার্জি", "Allergies"], ["রোগাবস্থা", "Conditions"], ["জরুরি যোগাযোগ", "Emergency contact"], ["ফোন", "Phone"]],
  Alerts: [["SOS পরিচয়", "SOS ID"], ["সময়", "Time"], ["প্রতিবেদক", "Reporter"], ["ধরন", "Type"], ["বার্তা", "Message"], ["স্ট্যাটাস", "Status"], ["স্থান", "Location"], ["পছন্দের যোগাযোগ", "Preferred contact"], ["স্বীকৃতি", "Acknowledged"], ["স্বীকৃতির সময়", "Acknowledged at"], ["সমাধান", "Resolved"], ["সমাধানের নোট", "Resolution note"]],
  Responses: [["SOS পরিচয়", "SOS ID"], ["সাড়াদাতা", "Responder"], ["ধরন", "Type"], ["নোট", "Notes"], ["সময়", "Time"]],
} as const;
export type HealthExportSheet = keyof typeof healthExportColumns;
const dateColumns = {
  Profile: [[2, "date"], [13, "date"]], Medications: [[4, "date"], [5, "date"]],
  Appointments: [[3, "datetime"]], Measurements: [[4, "datetime"]], Documents: [[2, "date"]],
  Directory: [[3, "date"]], Alerts: [[1, "datetime"], [9, "datetime"], [10, "datetime"]], Responses: [[4, "datetime"]],
} as const;
export function healthExportHeaders(sheet: HealthExportSheet, locale: Locale) {
  return healthExportColumns[sheet].map(pair => pair[locale === "bn" ? 0 : 1]);
}
export function healthWorksheet(xlsx: typeof import("xlsx"), rows: Array<Record<string, unknown>>, sheet: HealthExportSheet, locale: Locale, timeZone: string) {
  const headers = healthExportHeaders(sheet, locale);
  const dates = dateColumns[sheet].map(([index, kind]) => ({ header: headers[index], kind }));
  for (const row of rows) for (const { header, kind } of dates) {
    const value = row[header];
    if ((kind === "date" ? healthDate(value) : healthTimestamp(value)) === undefined) throw new Error("Invalid health export date.");
  }
  // Reuse the native Excel wall-clock converter, with an explicit timezone column.
  return qurbaniWorksheet(xlsx, rows, headers, dates, locale, timeZone);
}
