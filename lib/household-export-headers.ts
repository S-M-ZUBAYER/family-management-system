type Locale = "bn" | "en";

export const householdExportColumns = {
  "Households": [["নাম", "Name"], ["ঠিকানা", "Address"], ["শহর", "City"], ["অবস্থা", "Status"], ["নোট", "Notes"]],
  "Shopping Lists": [["বাসা", "Household"], ["তালিকা", "List"], ["বাজেট", "Budget"], ["প্রয়োজনের তারিখ", "Needed by"], ["অবস্থা", "Status"], ["তৈরিকারী", "Creator"]],
  "Shopping Items": [["তালিকা", "List"], ["আইটেম", "Item"], ["শ্রেণি", "Category"], ["পরিমাণ", "Quantity"], ["একক", "Unit"], ["আনুমানিক", "Estimated"], ["প্রকৃত", "Actual"], ["অগ্রাধিকার", "Priority"], ["দায়িত্বপ্রাপ্ত", "Assigned"], ["অবস্থা", "Status"], ["ক্রেতা", "Purchased by"]],
  "Utility Bills": [["বাসা", "Household"], ["বিল", "Bill"], ["শ্রেণি", "Category"], ["সেবাদাতা", "Provider"], ["অ্যাকাউন্ট", "Account"], ["মাস", "Month"], ["পরিমাণ", "Amount"], ["শেষ তারিখ", "Due"], ["পুনরাবৃত্তি", "Recurrence"], ["অবস্থা", "Status"], ["পদ্ধতি", "Method"], ["রেফারেন্স", "Reference"]],
  "Tasks": [["বাসা", "Household"], ["কাজ", "Task"], ["শ্রেণি", "Category"], ["দায়িত্বপ্রাপ্ত", "Assigned"], ["শেষ সময়", "Due"], ["পুনরাবৃত্তি", "Recurrence"], ["অগ্রাধিকার", "Priority"], ["অবস্থা", "Status"], ["সম্পন্নকারী", "Completed by"]],
  "Maintenance": [["বাসা", "Household"], ["সমস্যা", "Issue"], ["শ্রেণি", "Category"], ["জরুরিতা", "Urgency"], ["আনুমানিক", "Estimated"], ["প্রকৃত", "Actual"], ["সেবাদাতা", "Vendor"], ["সময়সূচি", "Schedule"], ["অবস্থা", "Status"], ["রিপোর্টকারী", "Reporter"]],
  "Service Directory": [["সেবা", "Service"], ["নাম", "Name"], ["ফোন", "Phone"], ["বিকল্প ফোন", "Alternate"], ["রেটিং", "Rating"], ["বিশ্বস্ত", "Trusted"], ["ঠিকানা", "Address"], ["অবস্থা", "Status"]],
  "Documents": [["শিরোনাম", "Title"], ["ধরন", "Type"], ["রেকর্ড", "Entity"], ["ফাইল", "File"], ["আপলোডকারী", "Uploader"], ["তারিখ", "Date"]],
} as const;

export type HouseholdExportSheet = keyof typeof householdExportColumns;

export function householdExportHeaders(sheet: HouseholdExportSheet, locale: Locale): string[] {
  return householdExportColumns[sheet].map((pair) => locale === "bn" ? pair[0] : pair[1]);
}
