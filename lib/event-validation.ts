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
    EVENT_COMMENT_VERSION_REQUIRED: ["মন্তব্যের আগের লেখা প্রয়োজন। তালিকা লোড করে আবার চেষ্টা করুন।", "The original comment text is required. Reload the list before trying again."],
    EVENT_COMMENT_CHANGED: ["মন্তব্যটি বদলেছে বা মুছে গেছে। তালিকা লোড করে বর্তমান লেখা দেখুন; পুরোনো লেখা দিয়ে আবার পাঠাবেন না।", "The comment changed or was removed. Reload to review its current text; do not resubmit the old version."],
    EVENT_COMMENT_NOT_FOUND: ["এই পরিবারের মন্তব্য পাওয়া যায়নি।", "The comment was not found in this family."],
    EVENT_COMMENT_FORBIDDEN: ["শুধু নিজের মন্তব্য বদলাতে পারবেন। নিজের মন্তব্য অথবা Admin হিসেবে অন্যের মন্তব্য মুছতে পারবেন; খসড়ায় editing বন্ধ।", "You can edit only your own comment. You can delete your own comment or moderate as an admin; editing is closed on drafts."],
    EVENT_COMMENT_CHANGE_PENDING: ["মন্তব্যের পরিবর্তন নিশ্চিত হয়েছে; audit log এখনও বাকি। পরিবর্তনটি আবার পাঠাবেন না।", "The comment change is confirmed; its audit log is still pending. Do not resubmit the change."],
    EVENT_COMMENT_CHANGE_UNKNOWN: ["মন্তব্যের পরিবর্তনের ফল নিশ্চিত নয়। আবার edit/delete না করে তালিকা লোড করে যাচাই করুন।", "The comment change outcome is uncertain. Reload to verify before any further edit/delete."],
    EVENT_LOAD_FAILED: ["ইভেন্ট তালিকা লোড হয়নি। সংযোগ যাচাই করে আবার লোড করুন।", "The event list could not be loaded. Check your connection and reload."],
    EVENT_SCHEMA_UNAVAILABLE: ["ইভেন্ট database যাচাই বাকি। সঠিক migration installation support-এর মাধ্যমে যাচাই করে আবার লোড করুন; অনুমান করে SQL পুনরায় চালাবেন না।", "The event database needs verification. Check the correct migration installation with support and reload; do not blindly rerun SQL."],
    EVENT_LOAD_TIMEOUT: ["ইভেন্ট লোড বা JSON পড়ার সময়সীমা শেষ। পুরোনো তথ্য দেখানো হয়নি; আবার লোড করুন।", "Loading or parsing the event list timed out. Old data was hidden; reload the list."],
    EVENT_SIGN_IN_REQUIRED: ["ইভেন্ট দেখতে আগে লগইন করুন, তারপর তালিকা আবার লোড করুন।", "Sign in before viewing events, then reload the list."],
    EVENT_ACCESS_DENIED: ["এই পরিবারের ইভেন্ট দেখার অনুমতি নেই। Admin-এর সঙ্গে যোগাযোগ করুন।", "You do not have permission to view this family's events. Contact its admin."],
    EVENT_BACKEND_UNAVAILABLE: ["ইভেন্টের backend এখন পাওয়া যাচ্ছে না। কোনো অসম্পূর্ণ তালিকা দেখানো হয়নি; পরে আবার লোড করুন।", "The event backend is unavailable. No incomplete list was shown; reload later."],
    EVENT_FAMILY_CHANGED: ["ফ্যামিলি workspace বদলে গেছে। সঠিক পরিবারের ইভেন্ট পৃষ্ঠা আবার খুলুন।", "The family workspace changed. Reopen the event page for the correct family."],
    EVENTS_ROW_LIMIT: ["ইভেন্ট ইতিহাসের কোনো অংশ ২০,০০০ সারির সীমা ছাড়িয়েছে। অসম্পূর্ণ তালিকা বা export তৈরি হয়নি; support-এর সাহায্য নিন।", "One section of event history exceeds 20,000 rows. No partial list or export was produced; ask support."],
    EVENT_EXPORT_INVALID_DATA: ["Export-এর তারিখ, সংখ্যা বা record link সঠিক নয়। ১৯০০–৯৯৯৯ সালের Excel সময়সীমা এবং সম্পূর্ণ তালিকা যাচাই করুন; অসম্পূর্ণ file তৈরি হয়নি।", "Export dates, numbers or record links are invalid. Check the 1900–9999 Excel date range and complete list; no partial file was created."],
    EVENT_EXPORT_FAILED: ["XLSX তৈরি বা download শুরু হয়নি। বর্তমান তালিকা ও browser যাচাই করে আবার export করুন।", "The XLSX could not be created or its download started. Check the current list and browser, then export again."],
    EVENT_EXPORT_SUPERSEDED: ["লোড, পরিবর্তন বা workspace বন্ধ হওয়ার কারণে export-এর snapshot পুরোনো হয়েছে। বর্তমান তালিকা দেখে নতুন করে export করুন।", "Reloading, a change or leaving the workspace invalidated the export snapshot. Review the current list and export again."],
    EVENT_MEDIA_INVALID_FILE: ["সঠিক JPG, PNG, WebP, GIF, MP4 বা WebM file দিন; নিরাপদ নাম ও মিলে যাওয়া header প্রয়োজন। ছবি সর্বোচ্চ ৮ MB, ভিডিও ২৫ MB।", "Provide a JPG, PNG, WebP, GIF, MP4 or WebM file with a safe name and matching header. Images: 8 MB; videos: 25 MB."],
    EVENT_MEDIA_INVALID_CAPTION: ["ক্যাপশন সর্বোচ্চ ৫০০ অক্ষর দিন; লেখা কেটে সংরক্ষণ করা হবে না।", "Use a caption up to 500 characters; text will not be silently truncated."],
    EVENT_MEDIA_STORAGE_UNAVAILABLE: ["মিডিয়ার storage পাওয়া যাচ্ছে না। কোনো upload/delete করা হয়নি; পরে চেষ্টা করুন।", "Media storage is unavailable. No upload/deletion was performed; try later."],
    EVENT_MEDIA_UPLOAD_REJECTED: ["File সংরক্ষণ সম্পন্ন হয়নি এবং নতুন media row তৈরি হয়নি। ফাইল রেখে পরে চেষ্টা করুন।", "File storage did not complete and no new media row was created. Keep the file and try later."],
    EVENT_MEDIA_UNLINKED_PENDING: ["নতুন media row নিশ্চিত হয়নি; এই upload-এর অব্যবহৃত file cleanup বাকি। আবার upload না করে support-এর সাহায্য নিন।", "No new media row was confirmed; this upload's unlinked file cleanup is pending. Ask support instead of uploading again."],
    EVENT_MEDIA_PENDING: ["মিডিয়ার পরিবর্তন সংরক্ষিত হয়েছে; audit বা private file cleanup বাকি। একই কাজ আবার পাঠাবেন না; support-এর সাহায্য নিন।", "The media change is saved; audit or private file cleanup is pending. Do not repeat it; ask support."],
    EVENT_MEDIA_UNKNOWN: ["মিডিয়ার upload/delete সম্পন্ন হয়েছে কি না নিশ্চিত নয়। একই কাজ আবার পাঠাবেন না; gallery রিলোড করে support-এর মাধ্যমে যাচাই করুন।", "The media upload/deletion may already be saved. Do not repeat it; reload the gallery and verify with support."],
    EVENT_RSVP_INVALID_RESPONSE: ["যাব, হয়তো অথবা যেতে পারব না—সঠিক RSVP উত্তর নির্বাচন করুন।", "Choose a valid Going, Maybe or Not going RSVP response."],
    EVENT_RSVP_INVALID_GUESTS: ["অতিথির সংখ্যা ০–১০ পূর্ণসংখ্যা দিন; ভুল type বা দশমিক গ্রহণ করা হবে না।", "Use an integer guest count from 0 to 10; invalid types or decimals are not accepted."],
    EVENT_PARTICIPATION_INVALID_TEXT: ["মন্তব্য ২–২০০০ অক্ষর এবং RSVP note সর্বোচ্চ ৫০০ অক্ষর দিন; লেখা কেটে সংরক্ষণ করা হবে না।", "Use a 2–2,000 character comment and RSVP note up to 500 characters; text will not be silently truncated."],
    EVENT_REGISTRATION_CLOSED: ["ইভেন্টের নিবন্ধন খোলা নেই অথবা সময়সীমা শেষ। RSVP পাঠানো হয়নি।", "Registration is closed or its deadline has passed. The RSVP was not submitted."],
    EVENT_PARTICIPATION_PENDING: ["RSVP বা মন্তব্য সংরক্ষিত হয়েছে, কিন্তু audit বাকি। একই কাজ আবার পাঠাবেন না; support-এর মাধ্যমে audit যাচাই করুন।", "The RSVP or comment is saved, but its audit is pending. Do not repeat it; ask support to verify the audit."],
    EVENT_PARTICIPATION_UNKNOWN: ["RSVP বা মন্তব্য সংরক্ষিত হয়েছে কি না নিশ্চিত নয়। আবার পাঠাবেন না; তালিকা রিলোড করে উত্তর ও আলোচনা যাচাই করুন।", "The RSVP or comment may already be saved. Do not submit it again; reload the list and review responses and discussion."],
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
