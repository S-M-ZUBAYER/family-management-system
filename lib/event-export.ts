import { eventSafeSnapshot, type EventSnapshot } from "./event-read.ts";
import { eventUuid, eventMoney, eventTimestamp } from "./event-validation.ts";
type Locale = "bn" | "en";
type Sheet = "events" | "rsvps" | "comments" | "media";
const columns = {
  events: [["ইভেন্ট ID", "Event ID"], ["বাংলা নাম", "Bangla title"], ["ইংরেজি নাম", "English title"], ["বাংলা বিবরণ", "Bangla description"], ["ইংরেজি বিবরণ", "English description"], ["ধরন", "Type"], ["শুরুর সময়", "Start at"], ["শেষের সময়", "End at"], ["স্থান", "Venue"], ["শহর", "City"], ["মিলনস্থল", "Meeting point"], ["প্রতি ব্যক্তি (BDT)", "Per person (BDT)"], ["মোট বাজেট (BDT)", "Total budget (BDT)"], ["ধারণক্ষমতা", "Capacity"], ["নিবন্ধনের শেষ সময়", "Registration deadline"], ["অংশগ্রহণকারী", "Participants"], ["অবস্থা", "Status"], ["তৈরির সময়", "Created at"], ["হালনাগাদের সময়", "Updated at"]],
  rsvps: [["ইভেন্ট ID", "Event ID"], ["ইভেন্ট", "Event"], ["সদস্য", "Member"], ["উত্তর", "Response"], ["অতিথি", "Guests"], ["মন্তব্য", "Note"], ["হালনাগাদের সময়", "Updated at"]],
  comments: [["ইভেন্ট ID", "Event ID"], ["ইভেন্ট", "Event"], ["সদস্য", "Member"], ["মন্তব্য", "Comment"], ["সময়", "Created at"]],
  media: [["ইভেন্ট ID", "Event ID"], ["ইভেন্ট", "Event"], ["ফাইলের নাম", "File name"], ["ফাইলের ধরন", "MIME type"], ["আকার (বাইট)", "Size (bytes)"], ["ক্যাপশন", "Caption"], ["আপলোডকারী", "Uploader"], ["সময়", "Created at"]],
} as const;
const names = { events: ["ইভেন্ট", "Events"], rsvps: ["RSVPs", "RSVPs"], comments: ["আলোচনা", "Discussion"], media: ["মিডিয়া", "Media"] } as const;
const types = { reunion: ["পারিবারিক মিলনমেলা", "Family reunion"], tour: ["ট্যুর", "Tour"], wedding: ["বিবাহ অনুষ্ঠান", "Wedding"], religious: ["ধর্মীয় আয়োজন", "Religious event"], meeting: ["পারিবারিক সভা", "Family meeting"], other: ["অন্যান্য", "Other"] } as const;
const statuses = { draft: ["খসড়া", "Draft"], published: ["রেজিস্ট্রেশন চলছে", "Registration open"], registration_closed: ["রেজিস্ট্রেশন বন্ধ", "Registration closed"], completed: ["সম্পন্ন", "Completed"], cancelled: ["বাতিল", "Cancelled"] } as const;
const responses = { going: ["যাব", "Going"], maybe: ["হয়তো", "Maybe"], not_going: ["যেতে পারব না", "Not going"] } as const;
const dates = { events: [6, 7, 14, 17, 18], rsvps: [6], comments: [4], media: [7] } as const;
const numbers = { events: [11, 12, 13, 15], rsvps: [4], comments: [], media: [4] } as const;
const widths = { events: [38, 34, 34, 60, 60, 26, 24, 24, 34, 24, 34, 24, 24, 16, 28, 20, 28, 24, 24, 26], rsvps: [38, 34, 28, 26, 14, 60, 24, 26], comments: [38, 34, 28, 60, 24, 26], media: [38, 34, 38, 24, 22, 60, 28, 24, 26] } as const;
const invalid = (): never => { throw new Error("EVENT_EXPORT_INVALID_DATA"); };
const index = (locale: Locale) => locale === "bn" ? 0 : locale === "en" ? 1 : invalid();
export const eventExportHeaders = (sheet: Sheet, locale: Locale) => columns[sheet].map(pair => pair[index(locale)]);

// Validate the complete authorized snapshot before selecting its visible rows.
// Never spread raw records into a worksheet or silently drop orphan children.
export function eventExportRows(raw: EventSnapshot, visibleIds: readonly string[], locale: Locale) {
  const snapshot = eventSafeSnapshot(raw), n = index(locale);
  if (!snapshot || snapshot.migrationRequired || !Array.isArray(visibleIds) || visibleIds.length > 20000) return invalid();
  const all = new Map(snapshot.events.map(row => [row.id.toLowerCase(), row]));
  const selected = new Set<string>();
  const events = visibleIds.map(value => {
    if (!eventUuid(value) || selected.has(value.toLowerCase())) return invalid();
    const key = value.toLowerCase(), row = all.get(key); if (!row) return invalid();
    selected.add(key); return row;
  });
  const title = (id: string) => { const row = all.get(id.toLowerCase())!; return locale === "en" ? row.title_en || row.title_bn : row.title_bn; };
  const participants = new Map<string, number>();
  for (const row of snapshot.rsvps) if (row.response === "going") {
    const key = row.event_id.toLowerCase(); participants.set(key, (participants.get(key) ?? 0) + 1 + row.guest_count);
  }
  const values = {
    events: events.map(row => [row.id, row.title_bn, row.title_en ?? "", row.description_bn, row.description_en ?? "", types[row.event_type][n], row.start_at, row.end_at,
      row.venue, row.city ?? "", row.meeting_point ?? "", eventMoney(row.estimated_cost_per_person), eventMoney(row.total_budget), row.capacity ?? "",
      row.registration_deadline, participants.get(row.id.toLowerCase()) ?? 0, statuses[row.status][n], row.created_at, row.updated_at]),
    rsvps: snapshot.rsvps.filter(row => selected.has(row.event_id.toLowerCase())).map(row => [row.event_id, title(row.event_id), row.respondent_name, responses[row.response][n], row.guest_count, row.note ?? "", row.updated_at]),
    comments: snapshot.comments.filter(row => selected.has(row.event_id.toLowerCase())).map(row => [row.event_id, title(row.event_id), row.author_name, row.body, row.created_at]),
    media: snapshot.media.filter(row => selected.has(row.event_id.toLowerCase())).map(row => [row.event_id, title(row.event_id), row.file_name, row.mime_type, row.file_size, row.caption ?? "", row.uploader_name, row.created_at]),
  };
  const rows = (sheet: Sheet) => values[sheet].map(row => Object.fromEntries(eventExportHeaders(sheet, locale).map((header, i) => [header, row[i]])));
  return { events: rows("events"), rsvps: rows("rsvps"), comments: rows("comments"), media: rows("media") };
}
function formatter(timeZone: string) {
  if (typeof timeZone !== "string" || !timeZone.trim() || timeZone !== timeZone.trim()) return invalid();
  try { return new Intl.DateTimeFormat("en-US", { timeZone, calendar: "gregory", numberingSystem: "latn", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }); } catch { return invalid(); }
}
function excelDate(value: unknown, required: boolean, format: Intl.DateTimeFormat) {
  let parsed: string | null; try { parsed = eventTimestamp(value, required); } catch { return invalid(); }
  if (!parsed) return "";
  const date = new Date(parsed);
  if (date.getUTCFullYear() < 1900 || date.getUTCFullYear() > 9999) return invalid();
  const parts = format.formatToParts(date), part = (type: string) => Number(parts.find(entry => entry.type === type)?.value);
  const year = part("year"); if (year < 1900 || year > 9999) return invalid();
  let serial = (Date.UTC(year, part("month") - 1, part("day"), part("hour"), part("minute"), part("second"), date.getUTCMilliseconds()) - Date.UTC(1899, 11, 30)) / 86400000;
  if (serial < 61) serial -= 1; // Excel's fictitious 1900-02-29.
  if (!Number.isFinite(serial) || serial < 1 || serial >= 2958466) return invalid();
  return serial;
}
export function eventWorksheet(xlsx: typeof import("xlsx"), sheet: Sheet, rows: Array<Record<string, unknown>>, locale: Locale, timeZone: string) {
  const headers = eventExportHeaders(sheet, locale), format = formatter(timeZone), dateColumns = new Set<number>(dates[sheet]);
  const matrix = rows.map(source => headers.map((header, c) => {
    const value = source[header];
    if (dateColumns.has(c)) return excelDate(value, !(sheet === "events" && [7, 14].includes(c)), format);
    if ((numbers[sheet] as readonly number[]).includes(c)) {
      if (sheet === "events" && c === 13 && value === "") return "";
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return invalid();
      if (sheet === "events" && [11, 12].includes(c)) { try { return eventMoney(value); } catch { return invalid(); } }
      if (!Number.isSafeInteger(value)) return invalid();
      return value;
    }
    if (typeof value !== "string" || value.length > 32767) return invalid();
    return value;
  }));
  const zoneHeader = locale === "bn" ? "সময় অঞ্চল" : "Time zone";
  const worksheet = xlsx.utils.aoa_to_sheet([[...headers, zoneHeader], ...matrix.map(row => [...row, timeZone])]);
  for (let r = 1; r <= rows.length; r++) for (let c = 0; c < headers.length; c++) {
    const cell = worksheet[xlsx.utils.encode_cell({ c, r })]; if (!cell) continue;
    if (dateColumns.has(c) && cell.t === "n") cell.z = "yyyy-mm-dd hh:mm:ss";
    else if ((numbers[sheet] as readonly number[]).includes(c) && cell.t === "n") cell.z = sheet === "events" && [11, 12].includes(c) ? "#,##0.00" : "#,##0";
    // User text remains literal, without active formulas or link metadata.
    if (typeof cell.v === "string") { cell.t = "s"; delete cell.f; delete cell.F; delete cell.l; }
  }
  worksheet["!cols"] = widths[sheet].map(wch => ({ wch }));
  worksheet["!autofilter"] = { ref: worksheet["!ref"]! };
  return worksheet;
}
export function eventWorkbook(xlsx: typeof import("xlsx"), snapshot: EventSnapshot, visibleIds: readonly string[], locale: Locale, timeZone: string) {
  const projected = eventExportRows(snapshot, visibleIds, locale), book = xlsx.utils.book_new();
  for (const sheet of ["events", "rsvps", "comments", "media"] as const) xlsx.utils.book_append_sheet(book, eventWorksheet(xlsx, sheet, projected[sheet], locale, timeZone), names[sheet][index(locale)]);
  return book;
}
