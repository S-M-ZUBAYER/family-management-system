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
