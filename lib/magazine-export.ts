import { healthTimestamp } from "./health-validation.ts";
import { qurbaniWorksheet } from "./qurbani-workbook.ts";
import type { MagazineArticle, MagazineComment, MagazineMedia } from "./magazine-types.ts";

type Locale = "bn" | "en";
type Sheet = "articles" | "comments" | "media";
const columns = {
  articles: [["লেখার ID", "Article ID"], ["শিরোনাম", "Title"], ["বিভাগ", "Category"],
    ["সারাংশ", "Summary"], ["ট্যাগ", "Tags"], ["অবস্থা", "Status"],
    ["বিশেষভাবে প্রদর্শিত", "Featured"], ["দৃশ্যমানতা", "Visibility"], ["লেখক", "Author"],
    ["পছন্দ", "Likes"], ["মন্তব্য", "Comments"], ["প্রকাশের সময়", "Published at"],
    ["তৈরির সময়", "Created at"], ["বিষয়বস্তু", "Content"], ["হালনাগাদের সময়", "Updated at"]],
  comments: [["মন্তব্যের ID", "Comment ID"], ["লেখার ID", "Article ID"], ["লেখা", "Article"],
    ["লেখক", "Author"], ["মন্তব্য", "Comment"], ["অবস্থা", "Status"], ["তৈরির সময়", "Created at"]],
  media: [["মিডিয়ার ID", "Media ID"], ["লেখার ID", "Article ID"], ["লেখা", "Article"],
    ["মিডিয়ার ধরন", "Media type"], ["ফাইল", "File"], ["ফাইলের ধরন", "MIME type"],
    ["আকার (বাইট)", "Size (bytes)"], ["তৈরির সময়", "Created at"]],
} as const;
const names = { articles: ["লেখা", "Articles"], comments: ["মন্তব্য", "Comments"], media: ["মিডিয়া তালিকা", "Media Index"] } as const;
const categories = { story: ["পারিবারিক গল্প", "Family story"], achievement: ["অর্জন", "Achievement"], recipe: ["রেসিপি", "Recipe"], history: ["ইতিহাস", "History"], announcement: ["ঘোষণা", "Announcement"], obituary: ["স্মরণ", "Remembrance"], other: ["অন্যান্য", "Other"] } as const;
const statuses = { draft: ["খসড়া", "Draft"], pending: ["যাচাই অপেক্ষমাণ", "Pending review"], published: ["প্রকাশিত", "Published"], archived: ["আর্কাইভ", "Archived"] } as const;
const visibility = { family: ["পরিবার", "Family"], admins: ["শুধু অ্যাডমিন", "Admins only"] } as const;
const commentStatuses = { visible: ["দৃশ্যমান", "Visible"], hidden: ["লুকানো", "Hidden"] } as const;
const mediaTypes = { cover: ["কভার", "Cover"], image: ["ছবি", "Image"], video: ["ভিডিও", "Video"], document: ["ডকুমেন্ট", "Document"] } as const;
const dateIndexes = { articles: [11, 12, 14], comments: [6], media: [7] } as const;
export const magazineExportHeaders = (sheet: Sheet, locale: Locale) => columns[sheet].map(pair => pair[locale === "bn" ? 0 : 1]);
const invalid = (): never => { throw new Error("MAGAZINE_EXPORT_INVALID_DATA"); };
function text(value: unknown, max = 32767, required = true): string {
  if (value === null || value === undefined) return required ? invalid() : "";
  return typeof value === "string" && value.length <= max && (!required || value.trim()) ? value : invalid();
}
function id(value: unknown): string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value.toLowerCase() : invalid();
}
function count(value: unknown, positive = false): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= (positive ? 1 : 0) ? value : invalid();
}
function label(value: string, labels: Record<string, readonly string[]>, locale: Locale): string {
  return typeof value === "string" && Object.hasOwn(labels, value) ? labels[value][locale === "bn" ? 0 : 1] : invalid();
}
function uniqueIds(records: readonly { id: string }[]) {
  if (!Array.isArray(records)) invalid();
  const seen = new Set<string>();
  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record)) invalid();
    const key = id(record.id); if (seen.has(key)) invalid(); seen.add(key);
  }
}

// Use only the already-authorized API snapshot, never a database record spread.
// Child rows must belong to that snapshot. Reject inconsistency rather than
// exporting an unlinked/private child or silently dropping its information.
export function magazineExportRows(articles: readonly MagazineArticle[], comments: readonly MagazineComment[], media: readonly MagazineMedia[], locale: Locale) {
  uniqueIds(articles); uniqueIds(comments); uniqueIds(media);
  const titles = new Map(articles.map(article => [id(article.id), text(article.title, 180)]));
  const parent = (value: unknown) => { const key = id(value); if (!titles.has(key)) invalid(); return [key, titles.get(key)!]; };
  const articleValues = articles.map(article => {
    if (typeof article.featured !== "boolean" || !Array.isArray(article.tags) || article.tags.length > 12) invalid();
    return [id(article.id), text(article.title, 180), label(article.category, categories, locale),
      text(article.summary, 500, false), article.tags.map(tag => text(tag, 60)).join(", "),
      label(article.status, statuses, locale), article.featured ? (locale === "bn" ? "হ্যাঁ" : "Yes") : (locale === "bn" ? "না" : "No"),
      label(article.visibility, visibility, locale), text(article.author_name, 32767, false), count(article.reaction_count), count(article.comment_count),
      article.published_at, article.created_at, text(article.content, 30000), article.updated_at];
  });
  const commentValues = comments.map(comment => [id(comment.id), ...parent(comment.article_id),
    text(comment.author_name, 32767, false), text(comment.body, 2000), label(comment.status, commentStatuses, locale), comment.created_at]);
  const mediaValues = media.map(item => [id(item.id), ...parent(item.article_id), label(item.media_type, mediaTypes, locale),
    text(item.file_name, 220), text(item.mime_type, 255), count(item.file_size, true), item.created_at]);
  const rows = (sheet: Sheet, values: unknown[][]) => values.map(row => Object.fromEntries(magazineExportHeaders(sheet, locale).map((header, i) => [header, row[i]])));
  return { articles: rows("articles", articleValues), comments: rows("comments", commentValues), media: rows("media", mediaValues) };
}

export function magazineWorksheet(xlsx: typeof import("xlsx"), sheet: Sheet, rows: Array<Record<string, unknown>>, locale: Locale, timeZone: string) {
  const headers = magazineExportHeaders(sheet, locale);
  const dateColumns = dateIndexes[sheet].map(index => ({ header: headers[index], kind: "datetime" as const }));
  try { new Intl.DateTimeFormat("en", { timeZone }).format(0); } catch { invalid(); }
  const normalized = rows.map(source => {
    const row: Record<string, unknown> = Object.fromEntries(headers.map(header => [header, source[header] ?? ""]));
    for (const [i, { header }] of dateColumns.entries()) {
      const parsed = healthTimestamp(row[header]);
      if (parsed === undefined || (!parsed && !(sheet === "articles" && i === 0))) invalid();
      if (parsed && (new Date(parsed).getUTCFullYear() < 1900 || new Date(parsed).getUTCFullYear() > 9999)) invalid();
      row[header] = parsed;
    }
    return row;
  });
  const worksheet = qurbaniWorksheet(xlsx, normalized, headers, dateColumns, locale, timeZone);
  for (const index of dateIndexes[sheet]) for (let r = 1; r <= rows.length; r++) {
    const cell = worksheet[xlsx.utils.encode_cell({ c: index, r })];
    if (cell?.t !== "n") continue;
    if (cell.v < 2 || cell.v >= 2958466) invalid();
    if (cell.v < 61) cell.v -= 1; // Excel's fictitious 1900-02-29.
  }
  const numericIndexes = sheet === "articles" ? [9, 10] : sheet === "media" ? [6] : [];
  for (const c of numericIndexes) for (let r = 1; r <= rows.length; r++) {
    const cell = worksheet[xlsx.utils.encode_cell({ c, r })];
    if (cell?.t === "n") cell.z = "#,##0";
  }
  const widths = sheet === "articles" ? [38, 34, 24, 50, 30, 24, 24, 24, 28, 12, 12, 24, 24, 60, 24, 24]
    : sheet === "comments" ? [38, 38, 34, 28, 60, 20, 24, 24] : [38, 38, 34, 24, 38, 24, 20, 24, 24];
  worksheet["!cols"] = widths.map(wch => ({ wch }));
  worksheet["!autofilter"] = { ref: worksheet["!ref"]! };
  return worksheet;
}

export function magazineWorkbook(xlsx: typeof import("xlsx"), articles: readonly MagazineArticle[], comments: readonly MagazineComment[], media: readonly MagazineMedia[], locale: Locale, timeZone: string) {
  const projected = magazineExportRows(articles, comments, media, locale);
  const book = xlsx.utils.book_new();
  for (const sheet of ["articles", "comments", "media"] as const) {
    xlsx.utils.book_append_sheet(book, magazineWorksheet(xlsx, sheet, projected[sheet], locale, timeZone), names[sheet][locale === "bn" ? 0 : 1]);
  }
  return book;
}
