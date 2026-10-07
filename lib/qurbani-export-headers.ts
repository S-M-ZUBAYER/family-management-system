type Locale = "bn" | "en";

export const qurbaniExportColumns = {
  "Campaign Summary": [["ক্যাম্পেইন", "Campaign"], ["বছর", "Year"], ["হিজরি বছর", "Hijri year"], ["স্ট্যাটাস", "Status"], ["স্থান", "Location"], ["কোরবানির তারিখ", "Slaughter date"], ["শেয়ার মূল্য", "Share price"], ["লক্ষ্য শেয়ার", "Target shares"], ["নিবন্ধিত শেয়ার", "Registered shares"], ["অংশগ্রহণকারীর পাওনা", "Participant dues"], ["অংশগ্রহণকারীর নথিভুক্ত পরিশোধ", "Participant recorded paid"], ["সংযুক্ত খতিয়ানে পরিশোধ", "Linked ledger paid"], ["পরিশোধ অমিলের সংখ্যা", "Payment mismatch count"], ["অসংযুক্ত শেয়ার এন্ট্রি", "Unmatched share entries"], ["বকেয়া", "Outstanding"], ["খতিয়ান সংগ্রহ", "Ledger collection"], ["খরচ", "Expenses"], ["ফেরত", "Refunds"], ["ব্যালান্স", "Balance"], ["পশুর সংখ্যা", "Animals count"], ["আনুমানিক মাংস কেজি", "Estimated meat kg"], ["বরাদ্দকৃত কেজি", "Allocated kg"], ["বণ্টিত কেজি", "Distributed kg"], ["বরাদ্দকৃত প্যাকেট", "Allocated packages"], ["বিতরণকৃত প্যাকেট", "Delivered packages"], ["অসম্পন্ন কাজ", "Open tasks"]],
  Participants: [["ক্রম", "SL"], ["অংশগ্রহণকারী", "Participant"], ["ফোন", "Phone"], ["পশু", "Animal"], ["শেয়ার", "Shares"], ["পাওনা", "Due"], ["নথিভুক্ত পরিশোধ", "Recorded paid"], ["খতিয়ানে পরিশোধ", "Ledger paid"], ["পরিশোধ অমিল", "Payment difference"], ["বকেয়া", "Outstanding"], ["স্ট্যাটাস", "Status"], ["নোট", "Notes"]],
  Animals: [["ট্যাগ", "Tag"], ["ধরন", "Type"], ["জাত", "Breed"], ["রং", "Color"], ["জীবিত ওজন কেজি", "Live weight kg"], ["আনুমানিক মাংস কেজি", "Estimated meat kg"], ["ক্রয়মূল্য", "Purchase price"], ["পরিবহন", "Transport"], ["খাদ্য", "Feed"], ["বিক্রেতা", "Vendor"], ["ক্রয়ের তারিখ", "Purchase date"], ["স্বাস্থ্য", "Health"], ["স্ট্যাটাস", "Status"], ["পশু চিকিৎসকের নোট", "Vet notes"]],
  Ledger: [["তারিখ", "Date"], ["ধরন", "Type"], ["ক্যাটাগরি", "Category"], ["পরিমাণ", "Amount"], ["পদ্ধতি", "Method"], ["অংশগ্রহণকারী", "Participant"], ["পশু", "Animal"], ["রেফারেন্স", "Reference"], ["নোট", "Notes"]],
  Vendors: [["বিক্রেতা", "Vendor"], ["ধরন", "Type"], ["ফোন", "Phone"], ["ঠিকানা", "Address"], ["চুক্তি", "Agreed"], ["পরিশোধিত", "Paid"], ["বকেয়া", "Due"], ["স্ট্যাটাস", "Status"], ["নোট", "Notes"]],
  Schedule: [["ক্রম", "Sequence"], ["পশু", "Animal"], ["নির্ধারিত সময়", "Scheduled at"], ["স্থান", "Location"], ["দল", "Team"], ["স্ট্যাটাস", "Status"], ["নোট", "Notes"]],
  Tasks: [["কাজ", "Task"], ["ক্যাটাগরি", "Category"], ["দায়িত্বপ্রাপ্ত", "Assigned to"], ["সময়সীমা", "Due"], ["অগ্রাধিকার", "Priority"], ["স্ট্যাটাস", "Status"], ["নোট", "Notes"]],
  Distribution: [["গ্রহীতা", "Recipient"], ["ধরন", "Type"], ["ওজন কেজি", "Weight kg"], ["প্যাকেট", "Packages"], ["সংগ্রহ", "Collected"], ["নোট", "Notes"]],
} as const;

export type QurbaniExportSheet = keyof typeof qurbaniExportColumns;

export function qurbaniExportHeaders(sheet: QurbaniExportSheet, locale: Locale): string[] {
  return qurbaniExportColumns[sheet].map((pair) => locale === "bn" ? pair[0] : pair[1]);
}

// Explicit columns prevent raw database keys (and newly added private columns)
// from silently appearing in the all-years workbook.
export const qurbaniAllYearsColumns = {
  Campaigns: [["year", "বছর", "Year"], ["title", "ক্যাম্পেইন", "Campaign"], ["hijri_year", "হিজরি বছর", "Hijri year"], ["status", "স্ট্যাটাস", "Status"], ["registration_deadline", "নিবন্ধনের শেষ সময়", "Registration deadline"], ["share_price", "শেয়ার মূল্য", "Share price"], ["target_shares", "লক্ষ্য শেয়ার", "Target shares"], ["location", "স্থান", "Location"], ["slaughter_date", "কোরবানির তারিখ", "Slaughter date"], ["notes", "নোট", "Notes"], ["created_at", "তৈরির সময়", "Created at"], ["updated_at", "হালনাগাদের সময়", "Updated at"], ["id", "আইডি", "ID"]],
  Participants: [["member_name", "অংশগ্রহণকারী", "Participant"], ["phone", "ফোন", "Phone"], ["share_count", "শেয়ার", "Shares"], ["amount_due", "পাওনা", "Due"], ["amount_paid", "নথিভুক্ত পরিশোধ", "Recorded paid"], ["status", "স্ট্যাটাস", "Status"], ["notes", "নোট", "Notes"], ["animal_id", "পশুর আইডি", "Animal ID"], ["created_at", "তৈরির সময়", "Created at"], ["updated_at", "হালনাগাদের সময়", "Updated at"], ["id", "আইডি", "ID"]],
  Animals: [["tag_code", "ট্যাগ", "Tag"], ["animal_type", "ধরন", "Type"], ["breed", "জাত", "Breed"], ["color", "রং", "Color"], ["live_weight_kg", "জীবিত ওজন কেজি", "Live weight kg"], ["estimated_meat_kg", "আনুমানিক মাংস কেজি", "Estimated meat kg"], ["purchase_price", "ক্রয়মূল্য", "Purchase price"], ["vendor_name", "বিক্রেতা", "Vendor"], ["purchase_date", "ক্রয়ের তারিখ", "Purchase date"], ["health_status", "স্বাস্থ্য", "Health"], ["vet_notes", "পশু চিকিৎসকের নোট", "Vet notes"], ["transport_cost", "পরিবহন", "Transport"], ["feed_cost", "খাদ্য", "Feed"], ["status", "স্ট্যাটাস", "Status"], ["created_at", "তৈরির সময়", "Created at"], ["updated_at", "হালনাগাদের সময়", "Updated at"], ["id", "আইডি", "ID"]],
  Ledger: [["transaction_date", "তারিখ", "Date"], ["transaction_type", "ধরন", "Type"], ["category", "ক্যাটাগরি", "Category"], ["amount", "পরিমাণ", "Amount"], ["payment_method", "পদ্ধতি", "Method"], ["participant_id", "অংশগ্রহণকারীর আইডি", "Participant ID"], ["animal_id", "পশুর আইডি", "Animal ID"], ["reference", "রেফারেন্স", "Reference"], ["notes", "নোট", "Notes"], ["created_at", "তৈরির সময়", "Created at"], ["id", "আইডি", "ID"]],
  Vendors: [["name", "বিক্রেতা", "Vendor"], ["vendor_type", "ধরন", "Type"], ["phone", "ফোন", "Phone"], ["address", "ঠিকানা", "Address"], ["agreed_amount", "চুক্তি", "Agreed"], ["paid_amount", "পরিশোধিত", "Paid"], ["status", "স্ট্যাটাস", "Status"], ["notes", "নোট", "Notes"], ["created_at", "তৈরির সময়", "Created at"], ["updated_at", "হালনাগাদের সময়", "Updated at"], ["id", "আইডি", "ID"]],
  Schedule: [["sequence_no", "ক্রম", "Sequence"], ["animal_id", "পশুর আইডি", "Animal ID"], ["scheduled_at", "নির্ধারিত সময়", "Scheduled at"], ["location", "স্থান", "Location"], ["butcher_team", "দল", "Team"], ["status", "স্ট্যাটাস", "Status"], ["notes", "নোট", "Notes"], ["created_at", "তৈরির সময়", "Created at"], ["updated_at", "হালনাগাদের সময়", "Updated at"], ["id", "আইডি", "ID"]],
  Tasks: [["title", "কাজ", "Task"], ["category", "ক্যাটাগরি", "Category"], ["assigned_to", "দায়িত্বপ্রাপ্ত", "Assigned to"], ["due_at", "সময়সীমা", "Due"], ["priority", "অগ্রাধিকার", "Priority"], ["status", "স্ট্যাটাস", "Status"], ["notes", "নোট", "Notes"], ["created_at", "তৈরির সময়", "Created at"], ["updated_at", "হালনাগাদের সময়", "Updated at"], ["id", "আইডি", "ID"]],
  Distribution: [["recipient_name", "গ্রহীতা", "Recipient"], ["recipient_type", "ধরন", "Type"], ["weight_kg", "ওজন কেজি", "Weight kg"], ["package_count", "প্যাকেট", "Packages"], ["collected_at", "সংগ্রহ", "Collected"], ["notes", "নোট", "Notes"], ["created_at", "তৈরির সময়", "Created at"], ["id", "আইডি", "ID"]],
} as const;

export type QurbaniAllYearsSheet = keyof typeof qurbaniAllYearsColumns;

export const qurbaniAllYearsSummaryColumns = [["বছর", "Year"], ["ক্যাম্পেইন", "Campaign"], ["হিজরি বছর", "Hijri year"], ["স্ট্যাটাস", "Status"], ["শেয়ার", "Shares"], ["পাওনা", "Due"], ["নথিভুক্ত পরিশোধ", "Recorded paid"], ["সংযুক্ত খতিয়ানে পরিশোধ", "Linked ledger paid"], ["পরিশোধ অমিলের সংখ্যা", "Payment mismatch count"], ["অসংযুক্ত শেয়ার এন্ট্রি", "Unmatched share entries"], ["বকেয়া", "Outstanding"], ["সংগ্রহ", "Collections"], ["খরচ", "Expenses"], ["ফেরত", "Refunds"], ["ব্যালান্স", "Balance"], ["পশু", "Animals"], ["বরাদ্দকৃত কেজি", "Allocated kg"], ["বণ্টিত কেজি", "Distributed kg"]] as const;

export function qurbaniAllYearsHeaders(sheet: QurbaniAllYearsSheet | "All Years Summary", locale: Locale): string[] {
  if (sheet === "All Years Summary") return qurbaniAllYearsSummaryColumns.map((pair) => locale === "bn" ? pair[0] : pair[1]);
  const context = sheet === "Campaigns" ? [] : locale === "bn" ? ["বছর", "ক্যাম্পেইন"] : ["Year", "Campaign"];
  return [...context, ...qurbaniAllYearsColumns[sheet].map((column) => locale === "bn" ? column[1] : column[2])];
}

export function qurbaniAllYearsRow(
  sheet: QurbaniAllYearsSheet,
  record: Record<string, unknown>,
  locale: Locale,
  context?: { year: number; campaign: string },
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (sheet !== "Campaigns") {
    row[locale === "bn" ? "বছর" : "Year"] = context?.year ?? "";
    row[locale === "bn" ? "ক্যাম্পেইন" : "Campaign"] = context?.campaign ?? "";
  }
  for (const [field, bn, en] of qurbaniAllYearsColumns[sheet]) {
    row[locale === "bn" ? bn : en] = record[field] ?? "";
  }
  return row;
}
