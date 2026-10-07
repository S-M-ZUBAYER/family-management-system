type Locale = "bn" | "en";
type DateKind = "date" | "datetime";
type DateColumn = { header: string; kind: DateKind };

// Excel stores a wall-clock value, without a timezone. Convert explicitly so
// browser/Node timezone differences cannot shift dates or meeting times.
export function qurbaniExcelDate(value: unknown, kind: DateKind, timeZone: string): number | string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value !== "string") throw new Error("Invalid Qurbani export date.");
  const date = new Date(kind === "date" ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(date.getTime()) || (kind === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || date.toISOString().slice(0, 10) !== value))) {
    throw new Error("Invalid Qurbani export date.");
  }
  let wallClock = date.getTime();
  if (kind === "datetime") {
    if (!/(Z|[+-]\d{2}:\d{2})$/.test(value)) throw new Error("Qurbani export timestamps require a timezone.");
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone, calendar: "gregory", numberingSystem: "latn", hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(date);
    const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
    wallClock = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"), date.getUTCMilliseconds());
  }
  return (wallClock - Date.UTC(1899, 11, 30)) / 86400000;
}

export function qurbaniWorkbookDateColumns(sheet: string, locale: Locale, allYears = false): DateColumn[] {
  const column = (bn: string, en: string, kind: DateKind): DateColumn => ({ header: locale === "bn" ? bn : en, kind });
  const result: DateColumn[] = [];
  if (sheet === "Campaign Summary" || sheet === "Campaigns") result.push(column("কোরবানির তারিখ", "Slaughter date", "date"));
  if (sheet === "Animals") result.push(column("ক্রয়ের তারিখ", "Purchase date", "date"));
  if (sheet === "Ledger") result.push(column("তারিখ", "Date", "date"));
  if (sheet === "Schedule") result.push(column("নির্ধারিত সময়", "Scheduled at", "datetime"));
  if (sheet === "Tasks") result.push(column("সময়সীমা", "Due", "datetime"));
  if (sheet === "Distribution") result.push(column("সংগ্রহ", "Collected", "datetime"));
  if (allYears && sheet !== "All Years Summary") {
    if (sheet === "Campaigns") result.push(column("নিবন্ধনের শেষ সময়", "Registration deadline", "datetime"));
    result.push(column("তৈরির সময়", "Created at", "datetime"));
    if (!["Ledger", "Distribution"].includes(sheet)) result.push(column("হালনাগাদের সময়", "Updated at", "datetime"));
  }
  return result;
}

export function qurbaniWorksheet(
  xlsx: typeof import("xlsx"),
  rows: Array<Record<string, unknown>>,
  headers: string[],
  dateColumns: DateColumn[],
  locale: Locale,
  timeZone: string,
) {
  const dateKinds = new Map(dateColumns.map((column) => [column.header, column.kind]));
  const zoneHeader = locale === "bn" ? "সময় অঞ্চল" : "Time zone";
  const hasTimes = dateColumns.some((column) => column.kind === "datetime");
  const columns = hasTimes ? [...headers, zoneHeader] : headers;
  const values = rows.map((row) => columns.map((header) => {
    if (hasTimes && header === zoneHeader) return timeZone;
    const kind = dateKinds.get(header);
    return kind ? qurbaniExcelDate(row[header], kind, timeZone) : row[header] ?? "";
  }));
  const worksheet = xlsx.utils.aoa_to_sheet([columns, ...values]);
  for (const [index, header] of columns.entries()) {
    const kind = dateKinds.get(header);
    if (!kind) continue;
    for (let row = 1; row <= rows.length; row += 1) {
      const cell = worksheet[xlsx.utils.encode_cell({ c: index, r: row })];
      if (cell?.t === "n") cell.z = kind === "date" ? "yyyy-mm-dd" : "yyyy-mm-dd hh:mm:ss";
    }
  }
  return worksheet;
}
