type Locale = "bn" | "en";

export const welfareExportColumns = {
  Funds: [["তহবিল", "Fund"], ["শ্রেণি", "Category"], ["লক্ষ্যমাত্রা", "Target"], ["প্রারম্ভিক ব্যালান্স", "Opening balance"], ["স্ট্যাটাস", "Status"], ["দৃশ্যমানতা", "Visibility"]],
  Contributions: [["তারিখ", "Date"], ["তহবিল", "Fund"], ["অনুদানকারী", "Contributor"], ["পরিমাণ", "Amount"], ["পদ্ধতি", "Method"], ["রেফারেন্স", "Reference"], ["স্ট্যাটাস", "Status"], ["অনুমোদনকারী", "Approved by"], ["নোট", "Notes"]],
  Expenses: [["তারিখ", "Date"], ["তহবিল", "Fund"], ["শিরোনাম", "Title"], ["উপকারভোগী", "Beneficiary"], ["শ্রেণি", "Category"], ["পরিমাণ", "Amount"], ["পদ্ধতি", "Method"], ["রেফারেন্স", "Reference"], ["স্ট্যাটাস", "Status"], ["অনুমোদনকারী", "Approved by"], ["নোট", "Notes"]],
  "Assistance Requests": [["তারিখ", "Date"], ["আবেদনকারী", "Requester"], ["ধরন", "Type"], ["শিরোনাম", "Title"], ["আবেদনের পরিমাণ", "Requested"], ["অনুমোদিত পরিমাণ", "Approved"], ["জরুরিতা", "Urgency"], ["দৃশ্যমানতা", "Visibility"], ["স্ট্যাটাস", "Status"], ["অ্যাডমিন নোট", "Admin note"]],
  Pledges: [["সদস্য", "Member"], ["তহবিল", "Fund"], ["পুনরাবৃত্তি", "Frequency"], ["পরিমাণ", "Amount"], ["শুরু", "Start"], ["পরবর্তী তারিখ", "Next due"], ["স্ট্যাটাস", "Status"], ["নোট", "Notes"]],
  Documents: [["শিরোনাম", "Title"], ["ধরন", "Type"], ["সংযুক্ত রেকর্ড", "Linked record"], ["ফাইল", "File"], ["দৃশ্যমানতা", "Visibility"], ["আপলোডকারী", "Uploader"], ["তারিখ", "Date"]],
} as const;

export type WelfareExportSheet = keyof typeof welfareExportColumns;

export function welfareExportHeaders(sheet: WelfareExportSheet, locale: Locale): string[] {
  return welfareExportColumns[sheet].map((pair) => locale === "bn" ? pair[0] : pair[1]);
}
