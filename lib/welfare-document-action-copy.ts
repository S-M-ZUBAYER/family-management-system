type Locale = "bn" | "en";
export function welfareDocumentActionCopy(path: string, method: string, locale: Locale) {
  const upload = path === "/api/welfare/upload" && method === "POST";
  const remove = path.startsWith("/api/welfare-document/") && method === "DELETE";
  if (!upload && !remove) return null;
  return locale === "bn" ? {
    title: upload ? "নথি আপলোড করবেন?" : "নথি স্থায়ীভাবে মুছবেন?",
    description: upload ? "সংযুক্ত কল্যাণ রেকর্ডে এই নথি সংরক্ষণ করবেন? অ্যাক্সেস সংযুক্ত রেকর্ড ও নথির দৃশ্যমানতা অনুযায়ী সীমিত থাকবে।" : "এই খসড়া নথি ও ব্যক্তিগত ফাইল স্থায়ীভাবে মুছবেন? এটি ফিরিয়ে আনা যাবে না। পর্যালোচিত বা চূড়ান্ত রেকর্ডের প্রমাণ মুছা যাবে না।",
    confirmLabel: upload ? "হ্যাঁ, আপলোড করুন" : "হ্যাঁ, মুছে ফেলুন", destructive: remove,
    successMessage: upload ? "নথি নিরাপদ ভল্টে সংরক্ষিত হয়েছে।" : "নথি মুছে দেওয়া হয়েছে।",
  } : {
    title: upload ? "Upload document?" : "Delete document permanently?",
    description: upload ? "Save this document on the linked Welfare record? Access remains restricted by the linked record and document visibility." : "Permanently delete this draft document and private file? This cannot be undone. Evidence for reviewed or finalized records cannot be deleted.",
    confirmLabel: upload ? "Yes, upload" : "Yes, delete", destructive: remove,
    successMessage: upload ? "Document saved in the private vault." : "Document deleted.",
  };
}
const errors = {
  WELFARE_DOCUMENT_OUTCOME_UNKNOWN: ["আপলোডের ফল নিশ্চিত নয়। আবার আপলোডের আগে নথির তালিকা রিলোড করুন এবং সাপোর্টে যোগাযোগ করুন।", "Upload outcome is uncertain. Reload the documents list and contact support before uploading again."],
  WELFARE_DOCUMENT_FILE_TYPE: ["JPG, PNG, WebP, PDF বা Word document দিন।", "Choose a JPG, PNG, WebP, PDF, or Word document."],
  WELFARE_DOCUMENT_FILE_SIZE: ["নথি খালি হতে পারবে না এবং সর্বোচ্চ ১২ MB হতে পারবে।", "The document must not be empty and must be at most 12 MB."],
  WELFARE_DOCUMENT_LINK_INVALID: ["সঠিক সংযুক্ত রেকর্ড নির্বাচন করুন।", "Select a valid linked record."],
  WELFARE_DOCUMENT_OPTIONS_INVALID: ["সঠিক নথির ধরন ও দৃশ্যমানতা নির্বাচন করুন।", "Select a valid document type and visibility."],
  WELFARE_DOCUMENT_PARENT_MISSING: ["সংযুক্ত কল্যাণ রেকর্ডটি আর নেই।", "The linked Welfare record no longer exists."],
  WELFARE_DOCUMENT_FINALIZED: ["পর্যালোচিত, বন্ধ বা পরিশোধিত রেকর্ডের প্রমাণ স্থায়ীভাবে মুছা যাবে না।", "Evidence for a reviewed, closed, or paid record cannot be permanently deleted."],
  WELFARE_DOCUMENT_FORBIDDEN: ["এই নথির জন্য অনুমতি নেই।", "You do not have permission for this document."],
  WELFARE_DOCUMENT_NOT_FOUND: ["নথি পাওয়া যায়নি।", "Document not found."],
} as const;
export function welfareDocumentErrorCopy(code: unknown, locale: Locale): string | null {
  return typeof code === "string" && Object.hasOwn(errors, code) ? errors[code as keyof typeof errors][locale === "bn" ? 0 : 1] : null;
}
export function welfareDocumentResultCopy(path: string, payload: { auditPending?: boolean; cleanupPending?: boolean }, locale: Locale) {
  if (!payload.auditPending && !payload.cleanupPending) return null;
  const upload = path === "/api/welfare/upload";
  const messages = locale === "bn" ? [upload ? "নথি সংরক্ষিত হয়েছে।" : "নথির রেকর্ড মুছে গেছে।", ...(payload.cleanupPending ? ["ব্যক্তিগত ফাইলের স্টোরেজ পরিষ্কার করা বাকি আছে।"] : []), ...(payload.auditPending ? ["অডিট লগ সংরক্ষণ বাকি আছে; আবার আপলোড বা মুছবেন না, সাপোর্টে যোগাযোগ করুন।"] : [])]
    : [upload ? "Document saved." : "Document record removed.", ...(payload.cleanupPending ? ["Private file storage cleanup is pending."] : []), ...(payload.auditPending ? ["Audit logging is pending; do not upload or delete again. Contact support."] : [])];
  return messages.join(" ");
}
