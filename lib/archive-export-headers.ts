type Locale = "bn" | "en";

export const archiveExportColumns = {
  Collections: [["সংগ্রহ", "Collection"], ["ধরন", "Type"], ["গোপনীয়তা", "Visibility"], ["অবস্থা", "Status"], ["তৈরিকারী", "Creator"], ["বিবরণ", "Description"]],
  Memories: [["সংগ্রহ", "Collection"], ["শিরোনাম", "Title"], ["ধরন", "Type"], ["তারিখ", "Date"], ["স্থান", "Place"], ["ব্যক্তিবর্গ", "People"], ["গোপনীয়তা", "Visibility"], ["আপলোডকারী", "Uploader"], ["বিবরণ", "Description"]],
  "Heritage Stories": [["শিরোনাম", "Title"], ["তারিখ", "Date"], ["কথক", "Storyteller"], ["স্থান", "Place"], ["ব্যক্তিবর্গ", "People"], ["অবস্থা", "Status"], ["গোপনীয়তা", "Visibility"], ["লেখক", "Author"], ["গল্প", "Story"]],
  "Vault Index": [["শিরোনাম", "Title"], ["শ্রেণি", "Category"], ["মালিক", "Owner"], ["মাস্ক নম্বর", "Masked number"], ["ইস্যুকারী", "Issuer"], ["ইস্যুর তারিখ", "Issue"], ["মেয়াদ", "Expiry"], ["গোপনীয়তা", "Visibility"], ["আপলোডকারী", "Uploader"], ["নোট", "Notes"]],
  Assets: [["সম্পদ", "Asset"], ["ধরন", "Type"], ["মালিকানা", "Ownership"], ["স্থান", "Location"], ["পরিচিতি", "Identifier"], ["অর্জনের তারিখ", "Acquired"], ["মূল্য", "Value"], ["গোপনীয়তা", "Visibility"], ["অবস্থা", "Status"], ["নোট", "Notes"]],
  "Time Capsules": [["শিরোনাম", "Title"], ["প্রাপক", "Recipients"], ["খোলার সময়", "Unlock"], ["গোপনীয়তা", "Visibility"], ["অবস্থা", "Status"], ["তৈরিকারী", "Creator"], ["বার্তা", "Message"]],
  "File Index": [["রেকর্ড", "Entity"], ["রেকর্ড আইডি", "Entity ID"], ["ফাইল", "File"], ["ধরন", "Type"], ["আকার", "Size"], ["গোপনীয়তা", "Visibility"], ["আপলোডকারী", "Uploader"], ["তারিখ", "Date"]],
} as const;

export type ArchiveExportSheet = keyof typeof archiveExportColumns;

export function archiveExportHeaders(sheet: ArchiveExportSheet, locale: Locale): string[] {
  return archiveExportColumns[sheet].map((pair) => locale === "bn" ? pair[0] : pair[1]);
}
