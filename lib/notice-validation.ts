import { financeDate } from "./personal-finance-validation.ts";

export class NoticeValidationError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = "NoticeValidationError"; this.code = code; }
}
const invalid = (code: string): never => { throw new NoticeValidationError(code); };
export function noticeObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function noticeUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
function text(value: unknown, max: number, min = 0) {
  if ((value === undefined || value === null || value === "") && !min) return null;
  if (typeof value !== "string") return invalid("NOTICE_INVALID_TEXT");
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) return invalid("NOTICE_INVALID_TEXT");
  return trimmed || null;
}
function choice(value: unknown, options: readonly string[], fallback: string) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !options.includes(value)) return invalid("NOTICE_INVALID_OPTION");
  return value;
}
export function noticeTimestamp(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return invalid("NOTICE_INVALID_DATE");
  const candidate = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(candidate) || !financeDate(candidate.slice(0, 10))) return invalid("NOTICE_INVALID_DATE");
  const parsed = new Date(candidate);
  if (!Number.isFinite(parsed.getTime())) return invalid("NOTICE_INVALID_DATE");
  return parsed.toISOString();
}
export function noticeRecord(value: unknown, allowArchived = false, now = new Date().toISOString()) {
  if (!noticeObject(value)) return invalid("NOTICE_INVALID_BODY");
  const status = choice(value.status, allowArchived ? ["draft", "published", "archived"] : ["draft", "published"], "draft");
  const publishAt = noticeTimestamp(value.publishAt) ?? (status === "published" ? now : null);
  const expiresAt = noticeTimestamp(value.expiresAt);
  if (publishAt && expiresAt && expiresAt <= publishAt) return invalid("NOTICE_INVALID_SCHEDULE");
  if (value.isPinned !== undefined && typeof value.isPinned !== "boolean") return invalid("NOTICE_INVALID_OPTION");
  return {
    title_bn: text(value.titleBn, 180, 3), title_en: text(value.titleEn, 180),
    body_bn: text(value.bodyBn, 5000, 5), body_en: text(value.bodyEn, 5000),
    category: choice(value.category, ["general", "urgent", "event", "finance", "qurbani", "health"], "general"),
    priority: choice(value.priority, ["normal", "high", "urgent"], "normal"),
    status, is_pinned: value.isPinned === true, publish_at: publishAt, expires_at: expiresAt,
  };
}
export function noticeStatusPatch(action: unknown, expiresAt: string | null, now: string) {
  switch (action) {
    case "archive": return { status: "archived" };
    case "draft": return { status: "draft" };
    case "pin": return { is_pinned: true };
    case "unpin": return { is_pinned: false };
    case "publish":
      if (expiresAt && new Date(expiresAt).getTime() <= new Date(now).getTime()) return invalid("NOTICE_EXPIRED");
      return { status: "published", publish_at: now };
    default: return invalid("NOTICE_INVALID_ACTION");
  }
}
export function noticeErrorCopy(code: unknown, locale: "bn" | "en"): string | null {
  const messages: Record<string, [string, string]> = {
    NOTICE_LOAD_FAILED: ["নোটিশ তালিকা লোড হয়নি। পুরোনো তথ্য সরানো হয়েছে; আবার লোড করুন।", "The notice list could not be loaded. Previous data was cleared; reload the list."],
    NOTICE_LOAD_TIMEOUT: ["নোটিশ লোড হতে বেশি সময় লাগছে। পুরোনো তথ্য দেখানো হচ্ছে না; আবার লোড করুন।", "Loading notices timed out. Previous data is not being shown; reload the list."],
    NOTICE_SIGN_IN_REQUIRED: ["নোটিশ দেখতে আগে sign in করুন।", "Sign in before viewing notices."],
    NOTICE_ACCESS_DENIED: ["এই পরিবারের নোটিশ দেখার access নেই। সদস্যপদ যাচাই করুন।", "You do not have access to this family's notices. Check your membership."],
    NOTICE_BACKEND_UNAVAILABLE: ["নোটিশের database সাময়িকভাবে পাওয়া যাচ্ছে না। পুরোনো তথ্য সরানো হয়েছে; আবার লোড করুন।", "The notice database is temporarily unavailable. Previous data was cleared; reload the list."],
    NOTICE_FAMILY_CHANGED: ["লোডের সময় পরিবার বদলে গেছে। সঠিক পরিবার বেছে পেজ নতুন করে খুলুন; কোনো পরিবর্তন বা export পাঠানো হয়নি।", "The family changed during loading. Select the correct family and reopen the page; no change or export was submitted."],
    NOTICES_ROW_LIMIT: ["নোটিশ ইতিহাস ২০,০০০ সারির সীমা ছাড়িয়েছে। অসম্পূর্ণ তথ্য দেখানো বা XLSX-এ রপ্তানি করা হয়নি।", "Notice history exceeds 20,000 rows. No partial data was shown or exported."],
    NOTICE_EXPORT_SUPERSEDED: ["নোটিশ তালিকা বদলেছে বা আবার লোড হচ্ছে। পুরোনো তথ্য দিয়ে XLSX তৈরি করা হয়নি; বর্তমান তালিকা যাচাই করে export করুন।", "The notice list changed or is reloading. No XLSX was created from previous data; review the current list before exporting."],
    NOTICE_WRITE_OUTCOME_UNKNOWN: ["নোটিশের পরিবর্তন সংরক্ষিত হয়েছে কি না নিশ্চিত নয়। একই কাজ আবার পাঠাবেন না; তালিকা রিলোড করে ফল যাচাই করুন।", "The notice change may already be saved. Do not submit it again; reload the list and verify the outcome."],
    NOTICE_AUDIT_PENDING: ["নোটিশের পরিবর্তন সংরক্ষিত হয়েছে, কিন্তু audit log লেখা হয়নি। একই পরিবর্তন আবার পাঠাবেন না; support-এর মাধ্যমে audit যাচাই করুন।", "The notice change is saved, but its audit log is pending. Do not repeat the change; ask support to verify the audit."],
    NOTICE_WRITE_REJECTED: ["Database নোটিশের পরিবর্তন গ্রহণ করেনি। তথ্য ও permission যাচাই করুন।", "The database rejected the notice change. Review the data and permissions."],
    NOTICE_INVALID_SNAPSHOT: ["সম্পূর্ণ ও সঠিক নোটিশ তালিকা পাওয়া যায়নি। রিলোড করুন; যাচাই ছাড়া পরিবর্তন বা export সক্রিয় হবে না।", "A complete, valid notice list could not be loaded. Reload it; changes and exports stay unavailable until verification."],
    NOTICE_INVALID_BODY: ["সঠিক নোটিশ তথ্য দিন।", "Provide a valid notice object."],
    NOTICE_INVALID_ID: ["সঠিক নোটিশ আইডি দিন।", "Provide a valid notice ID."],
    NOTICE_INVALID_ACTION: ["সমর্থিত নোটিশ action নির্বাচন করুন।", "Choose a supported notice action."],
    NOTICE_INVALID_TEXT: ["বাংলা শিরোনাম ৩–১৮০ অক্ষর ও বিস্তারিত ৫–৫০০০ অক্ষর দিন; ঐচ্ছিক লেখার সীমাও যাচাই করুন।", "Use a 3–180 character Bengali title and 5–5,000 character details; check optional text limits too."],
    NOTICE_INVALID_OPTION: ["সঠিক ক্যাটাগরি, অগ্রাধিকার, অবস্থা ও পিন সেটিং দিন।", "Choose valid category, priority, status and boolean pin settings."],
    NOTICE_INVALID_DATE: ["সঠিক তারিখ ও সময় দিন; API সময়ের সঙ্গে timezone থাকতে হবে।", "Use a valid date/time with an explicit timezone in API requests."],
    NOTICE_INVALID_SCHEDULE: ["মেয়াদ শেষের সময় কার্যকর প্রকাশের সময়ের পরে হতে হবে।", "Expiry must be after the effective publish time."],
    NOTICE_EXPIRED: ["নোটিশটির মেয়াদ শেষ। প্রকাশের আগে মেয়াদ পরিবর্তন বা খালি করুন।", "This notice has expired. Update or clear its expiry before publishing."],
    NOTICE_RECORD_CHANGED: ["নোটিশটি বদলে গেছে। তালিকা রিলোড করে আবার যাচাই করুন।", "The notice changed. Reload the list and review it again."],
  };
  return typeof code === "string" && Object.hasOwn(messages, code) ? messages[code][locale === "bn" ? 0 : 1] : null;
}
