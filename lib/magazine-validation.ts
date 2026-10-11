export class MagazineValidationError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = "MagazineValidationError"; this.code = code; }
}
const invalid = (code: string): never => { throw new MagazineValidationError(code); };
export function magazineObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid("MAGAZINE_INVALID_BODY");
  return value as Record<string, unknown>;
}
export function magazineText(value: unknown, max: number, min = 0): string | null {
  if ((value === undefined || value === null || value === "") && !min) return null;
  if (typeof value !== "string") return invalid("MAGAZINE_INVALID_TEXT");
  const result = value.trim();
  return result.length >= min && result.length <= max ? result || null : invalid("MAGAZINE_INVALID_TEXT");
}
export function magazineUuid(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return invalid("MAGAZINE_INVALID_ID");
  return value;
}
export function magazineChoice<T extends string>(value: unknown, values: readonly T[], fallback?: T): T {
  if (value === undefined && fallback !== undefined) return fallback;
  return typeof value === "string" && values.includes(value as T) ? value as T : invalid("MAGAZINE_INVALID_OPTION");
}
// Legacy compose fields are exact "true"/"false" strings. Other coercions reject.
export function magazineBoolean(value: unknown): boolean {
  if (value === undefined || value === false || value === "false") return false;
  if (value === true || value === "true") return true;
  return invalid("MAGAZINE_INVALID_OPTION");
}
export function magazineTags(value: unknown): string[] {
  if (value === undefined || value === "") return [];
  if (typeof value !== "string") return invalid("MAGAZINE_INVALID_TAGS");
  const result = [...new Set(value.split(",").map(item => item.trim()).filter(Boolean))];
  return result.length <= 12 && result.every(item => item.length <= 60) ? result : invalid("MAGAZINE_INVALID_TAGS");
}
export function magazineArticleFields(data: Record<string, unknown>, canManage: boolean) {
  const visibility = magazineChoice(data.visibility, ["family", "admins"] as const, "family");
  if (!canManage && visibility === "admins") return invalid("MAGAZINE_ADMIN_ONLY");
  return { title: magazineText(data.title, 180, 1), summary: magazineText(data.summary, 500),
    content: magazineText(data.content, 30000, 20),
    category: magazineChoice(data.category, ["story", "achievement", "recipe", "history", "announcement", "obituary", "other"] as const, "story"),
    tags: magazineTags(data.tags), visibility };
}
export function magazineCreateStatus(data: Record<string, unknown>, canManage: boolean) {
  const publish = magazineBoolean(data.publishNow), draft = magazineBoolean(data.saveDraft);
  if (publish && draft) return invalid("MAGAZINE_INVALID_OPTION");
  if (publish && !canManage) return invalid("MAGAZINE_ADMIN_ONLY");
  return publish ? "published" : draft ? "draft" : "pending";
}
export function magazineStatusChanges(data: Record<string, unknown>, now: string, canManage: boolean) {
  const status = magazineChoice(data.status, ["draft", "pending", "published", "archived"] as const);
  const featured = Object.hasOwn(data, "featured") ? magazineBoolean(data.featured) : undefined;
  if (featured !== undefined && !canManage) return invalid("MAGAZINE_ADMIN_ONLY");
  if (featured && status !== "published") return invalid("MAGAZINE_INVALID_OPTION");
  return { status, updated_at: now, ...(status === "published" ? { published_at: now } : { featured: false }),
    ...(featured !== undefined ? { featured } : {}) };
}
export function magazineErrorCopy(code: unknown, locale: "bn" | "en"): string | null {
  const messages: Record<string, [string, string]> = {
    MAGAZINE_INVALID_BODY: ["সঠিক ম্যাগাজিন তথ্য দিন।", "Provide a valid magazine object."],
    MAGAZINE_INVALID_ID: ["সঠিক লেখা বা মন্তব্যের আইডি দিন।", "Provide a valid article or comment ID."],
    MAGAZINE_INVALID_TEXT: ["শিরোনাম ১–১৮০, সারাংশ সর্বোচ্চ ৫০০, লেখা ২০–৩০,০০০ ও মন্তব্য ১–২,০০০ অক্ষরের মধ্যে দিন।", "Use 1–180 characters for titles, up to 500 for summaries, 20–30,000 for articles and 1–2,000 for comments."],
    MAGAZINE_INVALID_OPTION: ["সঠিক action, বিভাগ, দৃশ্যমানতা, অবস্থা ও true/false সেটিং দিন। খসড়া ও প্রকাশ একসঙ্গে নির্বাচন করবেন না।", "Choose valid action, category, visibility, status and true/false settings. Do not select draft and publish together."],
    MAGAZINE_INVALID_TAGS: ["কমা দিয়ে সর্বোচ্চ ১২টি tag দিন; প্রতিটি সর্বোচ্চ ৬০ অক্ষর।", "Use at most 12 comma-separated tags, each at most 60 characters."],
    MAGAZINE_ADMIN_ONLY: ["এই কাজটি শুধু পরিবারের অ্যাডমিন করতে পারবেন।", "Only a family administrator can perform this action."],
    MAGAZINE_RECORD_CHANGED: ["লেখা বা মন্তব্যটি বদলে গেছে। তালিকা রিলোড করে আবার যাচাই করুন।", "The article or comment changed. Reload the list and review it again."],
    MAGAZINE_INVALID_COVER: ["আসল JPG, PNG, WebP বা GIF ছবি দিন; আকার ১ byte–১০ MB, filename সর্বোচ্চ ২২০ অক্ষর এবং extension ছবির ধরনের সঙ্গে মিলতে হবে।", "Use a JPG, PNG, WebP or GIF image with a matching extension, size 1 byte–10 MB and filename up to 220 characters."],
    MAGAZINE_STORAGE_UNAVAILABLE: ["কভারের storage এখন পাওয়া যাচ্ছে না। লেখাটি আলাদা সংরক্ষণ করে পরে কভার যোগ করুন।", "Cover storage is unavailable. Save the article separately and add its cover later."],
  };
  return typeof code === "string" && Object.hasOwn(messages, code) ? messages[code][locale === "bn" ? 0 : 1] : null;
}
