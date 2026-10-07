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
