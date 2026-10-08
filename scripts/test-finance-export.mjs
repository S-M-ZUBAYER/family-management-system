import assert from "node:assert/strict";
import test from "node:test";
import XLSX from "xlsx";
import { financeExportColumns, financeExportHeaders, financeWorksheet } from "../lib/finance-export.ts";
import { financeMoneyTotal, financeOutstanding } from "../lib/finance-money.ts";

test("seven empty finance sheets retain real BN/EN headers without invented data", () => {
  assert.equal(Object.keys(financeExportColumns).length, 7);
  for (const sheet of Object.keys(financeExportColumns)) for (const locale of ["bn", "en"]) {
    const headers = financeExportHeaders(sheet, locale);
    assert.equal(new Set(headers).size, headers.length);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, financeWorksheet(XLSX, [], sheet, locale), sheet);
    const parsed = XLSX.read(XLSX.write(book, { type: "buffer", bookType: "xlsx" }), { type: "buffer" });
    assert.deepEqual(XLSX.utils.sheet_to_json(parsed.Sheets[sheet], { header: 1 }), [headers]);
  }
});
test("native dates and numeric amounts survive XLSX roundtrip; extra fields are excluded", () => {
  for (const locale of ["bn", "en"]) {
    const date = locale === "bn" ? "তারিখ" : "Date";
    const amount = locale === "bn" ? "পরিমাণ" : "Amount";
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, financeWorksheet(XLSX, [{ [date]: "2026-10-08", [amount]: 0.3, private_field: "excluded" }], "Transactions", locale), "Transactions");
    const parsed = XLSX.read(XLSX.write(book, { type: "buffer", bookType: "xlsx" }), { type: "buffer", cellNF: true }).Sheets.Transactions;
    assert.equal(parsed.A2.z, "yyyy-mm-dd");
    const d = XLSX.SSF.parse_date_code(parsed.A2.v);
    assert.deepEqual([d.y, d.m, d.d], [2026, 10, 8]);
    assert.equal(parsed.E2.v, 0.3);
    assert.equal(parsed.E2.t, "n");
    assert.equal(parsed.J2, undefined);
  }
  assert.throws(() => financeWorksheet(XLSX, [{ Date: "2026-02-30" }], "Transactions", "en"));
});
test("finance totals keep exact cents including zero and negative balances", () => {
  assert.equal(financeMoneyTotal(["0.10", "0.20"]), 0.3);
  assert.equal(financeMoneyTotal([0.3, -0.1, -0.2]), 0);
  assert.equal(financeOutstanding("100.30", "0.10"), 100.2);
  assert.equal(financeOutstanding("0.10", "0.30"), 0);
  assert.throws(() => financeMoneyTotal(["0.001"]), RangeError);
  assert.throws(() => financeMoneyTotal(["90071992547409.92"]), RangeError);
});
