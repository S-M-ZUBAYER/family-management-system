type Locale = "bn" | "en";
const errors = {
  WELFARE_WRITE_OUTCOME_UNKNOWN: ["কাজের ফল নিশ্চিত নয়। একই কাজ আবার পাঠাবেন না; খতিয়ান রিলোড করে রেকর্ড ও অডিট লগ যাচাই করুন এবং সাপোর্টে যোগাযোগ করুন।", "The action outcome is uncertain. Do not submit it again; reload the ledger, verify the record and audit history, and contact support."],
  WELFARE_EXPORT_INVALID_DATA: ["এক্সপোর্টে অসঠিক তারিখ বা টাকার পরিমাণ পাওয়া গেছে। অসম্পূর্ণ ফাইল তৈরি হয়নি; তথ্য সংশোধন করে আবার চেষ্টা করুন।", "The export contains an invalid date or amount. No partial file was created; correct the data and try again."],
  WELFARE_INVALID_BODY: ["সঠিক রেকর্ডের তথ্য দিন।", "Provide a valid record object."],
  WELFARE_INVALID_MONEY: ["টাকার পরিমাণ সঠিকভাবে দিন: সর্বোচ্চ দুই দশমিক; প্রয়োজনীয় পরিমাণ শূন্যের বেশি হতে হবে।", "Enter a valid amount with at most two decimal places; required amounts must be greater than zero."],
  WELFARE_INVALID_DATE: ["সঠিক তারিখ দিন; পরবর্তী তারিখ শুরুর তারিখের আগে হতে পারবে না।", "Enter a valid date; the next due date cannot precede the start date."],
  WELFARE_INVALID_RECORD: ["সঠিক রেকর্ড ও তহবিল নির্বাচন করুন।", "Select a valid record and fund."],
  WELFARE_INVALID_OPTION: ["সঠিক স্ট্যাটাস, শ্রেণি বা পেমেন্ট পদ্ধতি নির্বাচন করুন।", "Select a valid status, category, or payment method."],
  WELFARE_INVALID_AMOUNT: ["অনুমোদিত পরিমাণ আবেদনের পরিমাণের মধ্যে এবং শূন্যের বেশি দিন।", "Approved amount must be positive and no greater than the requested amount."],
  WELFARE_INVALID_PAYMENT_METHOD: ["সঠিক পেমেন্ট পদ্ধতি নির্বাচন করুন।", "Select a valid payment method."],
  WELFARE_UNAUTHORIZED: ["এই তহবিলের টাকা ছাড় করার অনুমতি নেই।", "You do not have permission to release this fund's money."],
  WELFARE_FUND_REQUIRED: ["বিতরণের আগে একটি তহবিল নির্বাচন করুন।", "Select a fund before disbursement."],
  WELFARE_FUND_INACTIVE: ["এই তহবিলে এখন লেনদেন করা যাবে না।", "This fund is not currently open for this transaction."],
  WELFARE_INSUFFICIENT_BALANCE: ["তহবিলের ব্যালান্স পর্যাপ্ত নয়। খতিয়ান আবার দেখুন।", "The fund has insufficient balance. Review the ledger."],
  WELFARE_DISBURSEMENT_CONFLICT: ["সংযুক্ত বিতরণ এই আবেদনের সাথে মিলছে না। অ্যাডমিনকে খতিয়ান যাচাই করতে হবে।", "The linked disbursement conflicts with this request. An admin must review the ledger."],
  WELFARE_INVALID_TRANSITION: ["বর্তমান স্ট্যাটাস থেকে এই পরিবর্তন করা যাবে না। রিলোড করে আবার দেখুন।", "This change is not allowed from the current state. Reload and review the record."],
  WELFARE_RECORD_CHANGED: ["রেকর্ডটি ইতিমধ্যে পরিবর্তিত হয়েছে। রিলোড করে আবার দেখুন।", "The record changed while you were reviewing it. Reload and try again."],
} as const;
export function welfareErrorCopy(code: unknown, locale: Locale): string | null {
  return typeof code === "string" && Object.hasOwn(errors, code) ? errors[code as keyof typeof errors][locale === "bn" ? 0 : 1] : null;
}
