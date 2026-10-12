import { financeMoney } from "./personal-finance-validation.ts";
import { noticeObject, noticeTimestamp, noticeUuid } from "./notice-validation.ts";
export { noticeObject as eventObject, noticeUuid as eventUuid };
export class EventValidationError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; this.name = "EventValidationError"; }
}
const invalid = (code: string): never => { throw new EventValidationError(code); };
export const eventTypes = ["reunion", "tour", "wedding", "religious", "meeting", "other"] as const;
export const eventStatuses = ["draft", "published", "registration_closed", "completed", "cancelled"] as const;
export const eventStatusByAction: Record<string, string> = { publish: "published", close: "registration_closed", complete: "completed", cancel: "cancelled", draft: "draft" };
function text(value: unknown, max: number, min = 0): string | null {
  if ((value === undefined || value === null || value === "") && !min) return null;
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) return invalid("EVENT_INVALID_TEXT");
  return value.trim() || null;
}
export function eventTimestamp(value: unknown, required = false) {
  let result: string | null;
  try { result = noticeTimestamp(value); } catch { return invalid("EVENT_INVALID_DATE"); }
  if (required && !result) return invalid("EVENT_INVALID_DATE");
  if (result && !/^\d{4}-/.test(result)) return invalid("EVENT_INVALID_DATE");
  return result;
}
export function eventMoney(value: unknown) {
  const result = financeMoney(value, 0);
  if (result === undefined || result < 0) return invalid("EVENT_INVALID_MONEY");
  return result;
}
export function eventCapacity(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const number = typeof value === "number" ? value : typeof value === "string" && /^[1-9]\d{0,4}$/.test(value.trim()) ? Number(value.trim()) : NaN;
  if (!Number.isSafeInteger(number) || number < 1 || number > 10000) return invalid("EVENT_INVALID_CAPACITY");
  return number;
}
export function eventRecord(value: unknown, editing = false) {
  if (!noticeObject(value)) return invalid("EVENT_INVALID_BODY");
  const eventType = value.eventType === undefined ? "reunion" : value.eventType;
  const status = value.status === undefined && !editing ? "draft" : value.status;
  if (typeof eventType !== "string" || !(eventTypes as readonly string[]).includes(eventType)
    || typeof status !== "string" || !(editing ? eventStatuses as readonly string[] : ["draft", "published"]).includes(status)) return invalid("EVENT_INVALID_OPTION");
  const start = eventTimestamp(value.startAt, true)!, end = eventTimestamp(value.endAt), deadline = eventTimestamp(value.registrationDeadline);
  if (end && Date.parse(end) < Date.parse(start)) return invalid("EVENT_INVALID_SCHEDULE");
  return { title_bn: text(value.titleBn, 180, 3)!, title_en: text(value.titleEn, 180), description_bn: text(value.descriptionBn, 5000, 5)!, description_en: text(value.descriptionEn, 5000),
    event_type: eventType, start_at: start, end_at: end, registration_deadline: deadline, venue: text(value.venue, 220, 1)!, city: text(value.city, 120), meeting_point: text(value.meetingPoint, 220),
    estimated_cost_per_person: eventMoney(value.estimatedCostPerPerson), total_budget: eventMoney(value.totalBudget), capacity: eventCapacity(value.capacity), status };
}
export function eventErrorCopy(code: unknown, locale: "bn" | "en") {
  const messages: Record<string, [string, string]> = {
    EVENT_INVALID_BODY: ["সঠিক ইভেন্ট তথ্য দিন।", "Provide a valid event object."],
    EVENT_INVALID_ID: ["সঠিক ইভেন্ট আইডি দিন।", "Provide a valid event ID."],
    EVENT_INVALID_ACTION: ["সমর্থিত ইভেন্ট action নির্বাচন করুন।", "Choose a supported event action."],
    EVENT_INVALID_TEXT: ["শিরোনাম ৩–১৮০, বিবরণ ৫–৫০০০ অক্ষর ও স্থান দিন; লেখার সীমা যাচাই করুন।", "Provide a 3–180 character title, 5–5,000 character description and venue; check text limits."],
    EVENT_INVALID_OPTION: ["সঠিক ইভেন্ট ধরন ও অবস্থা দিন; edit-এর সময় বর্তমান অবস্থা স্পষ্টভাবে দিন।", "Choose valid event type and status; include an explicit status when editing."],
    EVENT_INVALID_DATE: ["সঠিক তারিখ ও সময় দিন; API সময়ে timezone থাকতে হবে।", "Provide a valid date/time with an explicit timezone in API requests."],
    EVENT_INVALID_SCHEDULE: ["ইভেন্ট শেষের সময় শুরুর আগে হতে পারে না।", "Event end time cannot be before its start."],
    EVENT_INVALID_MONEY: ["খরচ ও বাজেট শূন্য বা ধনাত্মক দিন, সর্বোচ্চ দুই দশমিক ঘর; fractional cent গ্রহণ করা হবে না।", "Use nonnegative cost and budget with at most two decimal places; fractional cents are not accepted."],
    EVENT_INVALID_CAPACITY: ["ধারণক্ষমতা ১–১০,০০০ পূর্ণসংখ্যা দিন অথবা খালি রাখুন।", "Use an integer capacity from 1 to 10,000 or leave it blank."],
    EVENT_RECORD_CHANGED: ["ইভেন্টটি বদলে গেছে। তালিকা রিলোড করে আবার যাচাই করুন।", "The event changed. Reload the list and review it again."],
    EVENT_WRITE_OUTCOME_UNKNOWN: ["ইভেন্টের পরিবর্তন সংরক্ষিত হয়েছে কি না নিশ্চিত নয়। একই কাজ আবার পাঠাবেন না; তালিকা রিলোড করে ফল যাচাই করুন।", "The event change may already be saved. Do not submit it again; reload the list and verify the outcome."],
    EVENT_WRITE_PENDING: ["ইভেন্টের পরিবর্তন সংরক্ষিত হয়েছে; audit বা private media cleanup বাকি। একই পরিবর্তন আবার পাঠাবেন না; support-এর মাধ্যমে বাকি কাজ যাচাই করুন।", "The event change is saved; audit or private media cleanup is pending. Do not repeat it; ask support to verify the remaining work."],
    EVENT_WRITE_REJECTED: ["Database ইভেন্টের পরিবর্তন গ্রহণ করেনি। তথ্য ও permission যাচাই করুন।", "The database rejected the event change. Review the data and permissions."],
    EVENT_DELETE_UNAVAILABLE: ["Private media storage বা scoped file তথ্য যাচাই হয়নি। ইভেন্ট মুছে ফেলা হয়নি; support-এর সঙ্গে যোগাযোগ করুন।", "Private media storage or scoped file metadata could not be verified. The event was not deleted; contact support."],
    EVENT_INVALID_SNAPSHOT: ["সম্পূর্ণ ও সঠিক ইভেন্ট তালিকা পাওয়া যায়নি। রিলোড করুন; যাচাই ছাড়া পরিবর্তন বা export সক্রিয় হবে না।", "A complete, valid event list could not be loaded. Reload it; changes and exports stay unavailable until verification."],
  };
  return typeof code === "string" && Object.hasOwn(messages, code) ? messages[code][locale === "bn" ? 0 : 1] : null;
}
