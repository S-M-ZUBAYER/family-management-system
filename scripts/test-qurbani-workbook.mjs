import assert from "node:assert/strict";
import test from "node:test";
import XLSX from "xlsx";
import { qurbaniExcelDate, qurbaniWorkbookDateColumns, qurbaniWorksheet } from "../lib/qurbani-workbook.ts";

test("date-only values survive timezone changes and invalid values fail", () => {
  assert.equal(qurbaniExcelDate("2028-06-01", "date", "Asia/Dhaka"), qurbaniExcelDate("2028-06-01", "date", "America/Los_Angeles"));
  assert.equal(qurbaniExcelDate(null, "date", "UTC"), "");
  assert.throws(() => qurbaniExcelDate("2028-02-30", "date", "UTC"));
  assert.throws(() => qurbaniExcelDate("2028-06-01T09:45:00", "datetime", "Asia/Dhaka"));
});

test("actual XLSX round trip preserves native dates, local wall time, numbers and timezone", () => {
  for (const locale of ["bn", "en"]) {
    const when = locale === "bn" ? "নির্ধারিত সময়" : "Scheduled at";
    const amount = locale === "bn" ? "পরিমাণ" : "Amount";
    const sheet = qurbaniWorksheet(XLSX, [{ [when]: "2028-06-01T03:45:00+00:00", [amount]: 250.75, secret: "excluded" }], [when, amount], qurbaniWorkbookDateColumns("Schedule", locale), locale, "Asia/Dhaka");
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Schedule");
    // Read Excel's timezone-free serial directly. SheetJS's Date conversion
    // otherwise applies the process timezone (including historical offsets).
    const parsed = XLSX.read(XLSX.write(book, { type: "buffer", bookType: "xlsx" }), { type: "buffer", cellNF: true }).Sheets.Schedule;
    assert.equal(parsed.A2.t, "n");
    assert.equal(parsed.A2.z, "yyyy-mm-dd hh:mm:ss");
    const decoded = XLSX.SSF.parse_date_code(parsed.A2.v);
    assert.deepEqual([decoded.y, decoded.m, decoded.d, decoded.H, decoded.M, decoded.S], [2028, 6, 1, 9, 45, 0]);
    assert.equal(parsed.B2.t, "n");
    assert.equal(parsed.B2.v, 250.75);
    assert.equal(parsed.C2.v, "Asia/Dhaka");
    assert.equal(parsed.D2, undefined);
  }
});

test("all-years monetary dues remain numbers and timestamp columns remain native dates", () => {
  const headers = ["Due", "Created at", "Updated at"];
  const sheet = qurbaniWorksheet(XLSX, [{ Due: 376.13, "Created at": "2028-05-30T00:00:00Z", "Updated at": "" }], headers, qurbaniWorkbookDateColumns("Participants", "en", true), "en", "Asia/Dhaka");
  assert.equal(sheet.A2.v, 376.13);
  assert.equal(sheet.A2.z, undefined);
  assert.equal(sheet.B2.z, "yyyy-mm-dd hh:mm:ss");
  assert.equal(sheet.C2.v, "");
  const empty = qurbaniWorksheet(XLSX, [], ["Scheduled at"], qurbaniWorkbookDateColumns("Schedule", "en"), "en", "Asia/Dhaka");
  assert.deepEqual(XLSX.utils.sheet_to_json(empty, { header: 1 }), [["Scheduled at", "Time zone"]]);
});
