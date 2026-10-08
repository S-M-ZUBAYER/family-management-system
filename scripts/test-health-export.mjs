import assert from "node:assert/strict";
import test from "node:test";
import XLSX from "xlsx";
import { healthExportColumns, healthExportHeaders, healthWorksheet } from "../lib/health-export.ts";

function roundtrip(sheet) {
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "Test");
  return XLSX.read(XLSX.write(book, { type: "buffer", bookType: "xlsx" }), { type: "buffer", cellNF: true }).Sheets.Test;
}
test("eight Health sections have BN/EN empty headers, no invented rows or unknown fields", () => {
  assert.equal(Object.keys(healthExportColumns).length, 8);
  for (const sheet of Object.keys(healthExportColumns)) for (const locale of ["bn", "en"]) {
    const result = roundtrip(healthWorksheet(XLSX, [], sheet, locale, "Asia/Dhaka"));
    const expected = healthExportHeaders(sheet, locale);
    if (["Appointments", "Measurements", "Alerts", "Responses"].includes(sheet)) expected.push(locale === "bn" ? "সময় অঞ্চল" : "Time zone");
    assert.equal(new Set(expected).size, expected.length);
    assert.deepEqual(XLSX.utils.sheet_to_json(result, { header: 1 }), [expected]);
  }
});
test("native appointment date, timezone and reminder number survive roundtrip", () => {
  for (const locale of ["bn", "en"]) {
    const keys = healthExportHeaders("Appointments", locale);
    const rows = [{ [keys[0]]: "QA only", [keys[3]]: "2026-10-09T03:15:00Z", [keys[4]]: 15, private_storage_key: "excluded" }];
    const sheet = roundtrip(healthWorksheet(XLSX, rows, "Appointments", locale, "Asia/Dhaka"));
    const d = XLSX.SSF.parse_date_code(sheet.D2.v);
    assert.deepEqual([d.y,d.m,d.d,d.H,d.M], [2026,10,9,9,15]);
    assert.equal(sheet.D2.z, "yyyy-mm-dd hh:mm:ss"); assert.equal(sheet.E2.t, "n"); assert.equal(sheet.E2.v, 15);
    assert.equal(sheet.H2.v, "Asia/Dhaka"); assert.equal(sheet.I2, undefined);
  }
});
test("measurements stay numeric, files keep date-only dates, and text cannot become formulas", () => {
  const measurement = roundtrip(healthWorksheet(XLSX, [{ Type: "Blood pressure", Primary: 121.25, Secondary: 80.5, Time: "2026-10-08T02:15:00Z" }], "Measurements", "en", "Asia/Dhaka"));
  assert.equal(measurement.B2.t, "n"); assert.equal(measurement.B2.v, 121.25); assert.equal(measurement.C2.v, 80.5);
  const sheet = roundtrip(healthWorksheet(XLSX, [{ Title: "=SUM(1,2)", Date: "2026-10-08", Size: 68, private_storage_key: "excluded" }], "Documents", "en", "America/Los_Angeles"));
  assert.equal(sheet.A2.t, "s"); assert.equal(sheet.A2.f, undefined); assert.equal(sheet.C2.z, "yyyy-mm-dd");
  const d = XLSX.SSF.parse_date_code(sheet.C2.v); assert.deepEqual([d.y,d.m,d.d], [2026,10,8]); assert.equal(sheet.E2.t, "n"); assert.equal(sheet.G2, undefined);
});
test("SOS response linkage and timestamps export without user IDs; invalid dates fail", () => {
  const sheet = roundtrip(healthWorksheet(XLSX, [{ "SOS ID": "QA-alert", Responder: "QA only", Time: "2026-10-08T02:15:00Z", auth_user_id: "excluded" }], "Responses", "en", "UTC"));
  assert.equal(sheet.A2.v, "QA-alert"); assert.equal(sheet.E2.t, "n"); assert.equal(sheet.F2.v, "UTC"); assert.equal(sheet.G2, undefined);
  assert.throws(() => healthWorksheet(XLSX, [{ Schedule: "2026-02-30T02:15:00Z" }], "Appointments", "en", "UTC"));
  assert.throws(() => healthWorksheet(XLSX, [{ Date: "bad" }], "Documents", "en", "UTC"));
});
