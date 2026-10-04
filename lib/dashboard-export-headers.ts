type Locale = "bn" | "en";

export const dashboardExportColumns = {
  Overview: [["সূচক", "Metric"], ["মান", "Value"]],
  "Member Requests": [["নাম", "Name"], ["সম্পর্ক", "Relationship"], ["আবেদনের সময়", "Requested at"]],
  Qurbani: [["ক্যাম্পেইন", "Campaign"], ["বছর", "Year"], ["অবস্থা", "Status"], ["লক্ষ্য শেয়ার", "Target shares"], ["নিবন্ধিত শেয়ার", "Registered shares"], ["সংগৃহীত অর্থ", "Collected"], ["বকেয়া", "Due"]],
  "Next Event": [["ইভেন্ট", "Event"], ["শুরুর সময়", "Starts at"], ["স্থান", "Venue"], ["শহর", "City"], ["অংশগ্রহণকারী", "Going"]],
} as const;

export type DashboardExportSheet = keyof typeof dashboardExportColumns;

export function dashboardExportHeaders(sheet: DashboardExportSheet, locale: Locale): string[] {
  return dashboardExportColumns[sheet].map((pair) => locale === "bn" ? pair[0] : pair[1]);
}
