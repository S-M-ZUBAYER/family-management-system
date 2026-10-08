import assert from "node:assert/strict";
import test from "node:test";
import XLSX from "xlsx";
import { welfareExportRows, welfareWorksheet } from "../lib/welfare-export.ts";
import { welfareExportColumns, welfareExportHeaders } from "../lib/welfare-export-headers.ts";
const stamp = "2026-10-08T23:45:00+00:00";
const label = value => value;
const privateFields = { auth_user_id: "secret-auth", requester_user_id: "secret-requester", storage_key: "secret-storage", family_id: "secret-family", unknown: "excluded" };
const fixture = {
  funds: [{ id: "fund-qa", name: "QA Fund", category: "general", target_amount: "0.00", opening_balance: "0.10", status: "active", visibility: "family", created_at: stamp, updated_at: stamp, ...privateFields }],
  contributions: [{ id: "c-qa", fund_id: "fund-qa", contributor_name: "=SUM(1,2)", amount: "0.10", contribution_date: "2024-02-29", payment_method: "cash", status: "approved", approved_at: stamp, created_at: stamp, ...privateFields }],
  expenses: [{ id: "e-qa", fund_id: "fund-qa", linked_request_id: "r-qa", title: "QA Expense", category: "other", amount: "0.30", expense_date: "2024-02-29", payment_method: "cash", status: "paid", approved_at: stamp, paid_at: stamp, created_at: stamp, ...privateFields }],
  requests: [{ id: "r-qa", fund_id: "fund-qa", requester_name: "QA only", request_type: "medical", title: "QA Request", description: "Synthetic only", requested_amount: "1.25", approved_amount: "0.00", urgency: "normal", visibility: "admins", status: "submitted", reviewed_at: null, created_at: stamp, updated_at: stamp, ...privateFields }],
  pledges: [{ id: "p-qa", fund_id: "fund-qa", member_name: "QA only", frequency: "monthly", amount: "0.20", start_date: "2024-02-29", next_due_date: null, status: "active", created_at: stamp, updated_at: stamp, ...privateFields }],
  documents: [{ id: "d-qa", entity_type: "request", entity_id: "r-qa", document_type: "receipt", title: "QA Receipt", file_name: "+command.png", mime_type: "image/png", file_size: 68, visibility: "admins", uploaded_by_name: "QA only", created_at: stamp, can_view: true, ...privateFields }, { id: "hidden", can_view: false, ...privateFields }],
};
function roundtrip(sheet) {
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "QA");
  return XLSX.read(XLSX.write(book, { type: "buffer", bookType: "xlsx" }), { type: "buffer", cellNF: true, cellStyles: true }).Sheets.QA;
}
function dateParts(cell) { const d = XLSX.SSF.parse_date_code(cell.v); return [d.y,d.m,d.d,d.H,d.M]; }
test("all six sections have bilingual empty headers/timezone, no invented rows", () => {
  for (const locale of ["bn", "en"]) for (const sheet of Object.keys(welfareExportColumns)) {
    const result = roundtrip(welfareWorksheet(XLSX, [], sheet, locale, "Asia/Dhaka"));
    assert.deepEqual(XLSX.utils.sheet_to_json(result, { header: 1 }), [[...welfareExportHeaders(sheet, locale), locale === "bn" ? "সময় অঞ্চল" : "Time zone"]]);
    assert.equal(result["!autofilter"].ref, result["!ref"]);
  }
});
test("authorized projections retain record links and metadata, exclude auth/storage/hidden documents", () => {
  for (const locale of ["bn", "en"]) {
    const rows = welfareExportRows(fixture, locale, label);
    assert.equal(Object.keys(rows).length, 6);
    for (const [sheet, records] of Object.entries(rows)) {
      assert.equal(records.length, 1);
      assert.deepEqual(Object.keys(records[0]), welfareExportHeaders(sheet, locale));
      assert.doesNotMatch(JSON.stringify(records), /secret-|excluded|hidden/);
    }
    const h = welfareExportHeaders("Documents", locale);
    assert.equal(rows.Documents[0][h[2]], "request:r-qa"); assert.equal(rows.Documents[0][h[8]], 68);
    const e = welfareExportHeaders("Expenses", locale);
    assert.equal(rows.Expenses[0][e[11]], "r-qa");
  }
});
test("date-only leap days stay unchanged; timestamp wall-clock and explicit timezone survive BN/EN roundtrip", () => {
  for (const locale of ["bn", "en"]) {
    const rows = welfareExportRows(fixture, locale, label);
    const contribution = roundtrip(welfareWorksheet(XLSX, rows.Contributions, "Contributions", locale, "America/Los_Angeles"));
    assert.deepEqual(dateParts(contribution.A2), [2024,2,29,0,0]); assert.equal(contribution.A2.z, "yyyy-mm-dd");
    const request = roundtrip(welfareWorksheet(XLSX, rows["Assistance Requests"], "Assistance Requests", locale, "Asia/Dhaka"));
    assert.deepEqual(dateParts(request.A2), [2026,10,9,5,45]); assert.equal(request.A2.z, "yyyy-mm-dd hh:mm:ss");
    assert.equal(request.Q2.v, "Asia/Dhaka"); assert.equal(request.N2.v, "");
    const pledge = roundtrip(welfareWorksheet(XLSX, rows.Pledges, "Pledges", locale, "UTC"));
    assert.deepEqual(dateParts(pledge.E2), [2024,2,29,0,0]); assert.equal(pledge.F2.v, "");
  }
});
test("decimal database strings become numeric currency cells; zero stays zero and formula-like text stays literal", () => {
  const rows = welfareExportRows(fixture, "en", label);
  const fund = roundtrip(welfareWorksheet(XLSX, rows.Funds, "Funds", "en", "UTC"));
  assert.equal(fund.C2.t, "n"); assert.equal(fund.C2.v, 0); assert.equal(fund.D2.v, 0.1); assert.equal(fund.D2.z, "#,##0.00");
  const contribution = roundtrip(welfareWorksheet(XLSX, rows.Contributions, "Contributions", "en", "UTC"));
  assert.equal(contribution.C2.t, "s"); assert.equal(contribution.C2.f, undefined); assert.equal(contribution.C2.v, "=SUM(1,2)");
  assert.equal(contribution.D2.t, "n"); assert.equal(contribution.D2.v, 0.1);
  const document = roundtrip(welfareWorksheet(XLSX, rows.Documents, "Documents", "en", "UTC"));
  assert.equal(document.D2.t, "s"); assert.equal(document.D2.f, undefined); assert.equal(document.I2.t, "n"); assert.equal(document.I2.v, 68);
});
test("invalid required/optional dates, money and file sizes fail rather than emit a plausible partial workbook", () => {
  const rows = welfareExportRows(fixture, "en", label);
  for (const value of ["2026-02-30", "bad", "", null, true]) assert.throws(() => welfareWorksheet(XLSX, [{ ...rows.Contributions[0], Date: value }], "Contributions", "en", "UTC"), /WELFARE_EXPORT_INVALID_DATA/);
  for (const value of ["2026-02-30T10:00:00Z", "2026-10-08T10:00:00", "bad"]) assert.throws(() => welfareWorksheet(XLSX, [{ ...rows.Documents[0], Date: value }], "Documents", "en", "UTC"), /WELFARE_EXPORT_INVALID_DATA/);
  assert.throws(() => welfareWorksheet(XLSX, [{ ...rows.Pledges[0], "Next due": "2026-02-30" }], "Pledges", "en", "UTC"));
  for (const value of ["1.001", "bad", true, -1, "1000000000000"]) assert.throws(() => welfareExportRows({ ...fixture, contributions: [{ ...fixture.contributions[0], amount: value }] }, "en", label));
  for (const value of [-1, 0.5, "68", Infinity]) assert.throws(() => welfareExportRows({ documents: [{ ...fixture.documents[0], file_size: value }] }, "en", label));
  assert.throws(() => welfareWorksheet(XLSX, [], "Documents", "en", "Invalid/Zone"));
});
