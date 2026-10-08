// Read an actual UI download and compare visible record IDs/amounts/dates to
// the signed-in local API. No database/file mutation, no credential printing.
import assert from "node:assert/strict";
import XLSX from "xlsx";
import { welfareExportColumns, welfareExportHeaders } from "../lib/welfare-export-headers.ts";
const [path, locale = "en", timeZone = "Asia/Dhaka"] = process.argv.slice(2);
assert.ok(path && ["bn", "en"].includes(locale), "Workbook path and bn/en required.");
const origin = new URL(process.env.FMS_QA_ORIGIN ?? "http://localhost:5173");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname), "Loopback only.");
const response = await fetch(new URL("/api/welfare", origin), { headers: { Cookie: "__sites_local_auth=1; fms_active_family=20000000-0000-4000-8000-000000000002" } });
assert.equal(response.status, 200);
const payload = await response.json(); assert.equal(payload.migrationRequired, false);
const book = XLSX.readFile(path, { cellNF: true });
const bn = ["তহবিল", "অনুদান", "ব্যয়", "সহায়তার আবেদন", "অঙ্গীকার", "নথি"];
const sheets = Object.keys(welfareExportColumns);
assert.deepEqual(book.SheetNames, locale === "bn" ? bn : sheets);
const sources = [payload.funds, payload.contributions, payload.expenses, payload.requests, payload.pledges, payload.documents.filter(r => r.can_view)];
const money = { Funds: [["Target", "target_amount"], ["Opening balance", "opening_balance"]], Contributions: [["Amount", "amount"]], Expenses: [["Amount", "amount"]], "Assistance Requests": [["Requested", "requested_amount"], ["Approved", "approved_amount"]], Pledges: [["Amount", "amount"]], Documents: [["Size bytes", "file_size"]] };
const dates = { Funds: [["Created at", "created_at", false], ["Updated at", "updated_at", false]], Contributions: [["Date", "contribution_date", true], ["Approved at", "approved_at", false], ["Created at", "created_at", false]], Expenses: [["Date", "expense_date", true], ["Approved at", "approved_at", false], ["Paid at", "paid_at", false], ["Created at", "created_at", false]], "Assistance Requests": [["Date", "created_at", false], ["Reviewed at", "reviewed_at", false], ["Updated at", "updated_at", false]], Pledges: [["Start", "start_date", true], ["Next due", "next_due_date", true], ["Created at", "created_at", false], ["Updated at", "updated_at", false]], Documents: [["Date", "created_at", false]] };
let checks = 3;
const counts = {};
for (const [i, name] of sheets.entries()) {
  const sheet = book.Sheets[book.SheetNames[i]], headers = welfareExportHeaders(name, locale), english = welfareExportHeaders(name, "en");
  const table = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  assert.deepEqual(table[0], [...headers, locale === "bn" ? "সময় অঞ্চল" : "Time zone"]); checks++;
  assert.equal(table.length - 1, sources[i].length); checks++; counts[name] = sources[i].length;
  assert.deepEqual(table.slice(1).map(row => row[english.indexOf("Record ID")]), sources[i].map(r => r.id)); checks++;
  assert.equal(sheet["!autofilter"].ref, sheet["!ref"]); checks++;
  const cell = (header, row) => sheet[XLSX.utils.encode_cell({ c: english.indexOf(header), r: row + 1 })];
  for (const [rowIndex, record] of sources[i].entries()) {
    assert.equal(table[rowIndex + 1][headers.length], timeZone); checks++;
    for (const [header, key] of money[name]) {
      const value = cell(header, rowIndex); assert.equal(value.t, "n"); assert.equal(value.v, Number(record[key])); checks += 2;
      if (key !== "file_size") { assert.equal(value.z, "#,##0.00"); checks++; }
    }
    for (const [header, key, dateOnly] of dates[name]) {
      const value = cell(header, rowIndex);
      if (!record[key]) { assert.equal(value?.v ?? "", ""); checks++; continue; }
      assert.equal(value.t, "n"); assert.equal(value.z, dateOnly ? "yyyy-mm-dd" : "yyyy-mm-dd hh:mm:ss"); checks += 2;
      const d = XLSX.SSF.parse_date_code(value.v);
      if (dateOnly) assert.equal(`${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`, record[key]);
      else {
        const parts = new Intl.DateTimeFormat("en-US", { timeZone, calendar:"gregory", numberingSystem:"latn", hourCycle:"h23", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit" }).formatToParts(new Date(record[key]));
        const p = type => Number(parts.find(x => x.type === type).value);
        assert.deepEqual([d.y,d.m,d.d,d.H,d.M,d.S], [p("year"),p("month"),p("day"),p("hour"),p("minute"),p("second")]);
      }
      checks++;
    }
    if (name === "Documents") {
      assert.equal(cell("MIME type", rowIndex).v, record.mime_type); assert.equal(cell("File", rowIndex).v, record.file_name);
      assert.ok(cell("Linked record", rowIndex).v.endsWith(`:${record.entity_id}`)); checks += 3;
    }
  }
  for (const [address, value] of Object.entries(sheet).filter(([key]) => !key.startsWith("!"))) {
    assert.equal(value.f, undefined, `Unexpected formula ${name}:${address}`); checks++;
  }
}
console.log(JSON.stringify({ checks, locale, timeZone, counts, actualDownloadVerified: true, databaseMutated: false }));
