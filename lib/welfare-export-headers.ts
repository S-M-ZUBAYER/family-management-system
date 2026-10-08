type Locale = "bn" | "en";

export const welfareExportColumns = {
  Funds: [["তহবিল", "Fund"], ["শ্রেণি", "Category"], ["লক্ষ্যমাত্রা", "Target"], ["প্রারম্ভিক ব্যালান্স", "Opening balance"], ["স্ট্যাটাস", "Status"], ["দৃশ্যমানতা", "Visibility"], ["বিবরণ","Description"], ["তৈরির সময়","Created at"], ["হালনাগাদের সময়","Updated at"], ["রেকর্ড পরিচয়","Record ID"]],
  Contributions: [["তারিখ", "Date"], ["তহবিল", "Fund"], ["অনুদানকারী", "Contributor"], ["পরিমাণ", "Amount"], ["পদ্ধতি", "Method"], ["রেফারেন্স", "Reference"], ["স্ট্যাটাস", "Status"], ["অনুমোদনকারী", "Approved by"], ["নোট", "Notes"], ["অনুমোদনের সময়","Approved at"], ["তৈরির সময়","Created at"], ["রেকর্ড পরিচয়","Record ID"]],
  Expenses: [["তারিখ", "Date"], ["তহবিল", "Fund"], ["শিরোনাম", "Title"], ["উপকারভোগী", "Beneficiary"], ["শ্রেণি", "Category"], ["পরিমাণ", "Amount"], ["পদ্ধতি", "Method"], ["রেফারেন্স", "Reference"], ["স্ট্যাটাস", "Status"], ["অনুমোদনকারী", "Approved by"], ["নোট", "Notes"], ["সংযুক্ত আবেদন পরিচয়","Linked request ID"], ["অনুমোদনের সময়","Approved at"], ["পরিশোধের সময়","Paid at"], ["তৈরির সময়","Created at"], ["রেকর্ড পরিচয়","Record ID"]],
  "Assistance Requests": [["তারিখ", "Date"], ["আবেদনকারী", "Requester"], ["ধরন", "Type"], ["শিরোনাম", "Title"], ["আবেদনের পরিমাণ", "Requested"], ["অনুমোদিত পরিমাণ", "Approved"], ["জরুরিতা", "Urgency"], ["দৃশ্যমানতা", "Visibility"], ["স্ট্যাটাস", "Status"], ["অ্যাডমিন নোট", "Admin note"], ["তহবিল","Fund"], ["বিবরণ","Description"], ["পর্যালোচনাকারী","Reviewed by"], ["পর্যালোচনার সময়","Reviewed at"], ["হালনাগাদের সময়","Updated at"], ["রেকর্ড পরিচয়","Record ID"]],
  Pledges: [["সদস্য", "Member"], ["তহবিল", "Fund"], ["পুনরাবৃত্তি", "Frequency"], ["পরিমাণ", "Amount"], ["শুরু", "Start"], ["পরবর্তী তারিখ", "Next due"], ["স্ট্যাটাস", "Status"], ["নোট", "Notes"], ["তৈরির সময়","Created at"], ["হালনাগাদের সময়","Updated at"], ["রেকর্ড পরিচয়","Record ID"]],
  Documents: [["শিরোনাম", "Title"], ["ধরন", "Type"], ["সংযুক্ত রেকর্ড", "Linked record"], ["ফাইল", "File"], ["দৃশ্যমানতা", "Visibility"], ["আপলোডকারী", "Uploader"], ["তারিখ", "Date"], ["ফাইলের ধরন","MIME type"], ["আকার বাইট","Size bytes"], ["রেকর্ড পরিচয়","Record ID"]],
} as const;

export type WelfareExportSheet = keyof typeof welfareExportColumns;

export function welfareExportHeaders(sheet: WelfareExportSheet, locale: Locale): string[] {
  return welfareExportColumns[sheet].map((pair) => locale === "bn" ? pair[0] : pair[1]);
}
