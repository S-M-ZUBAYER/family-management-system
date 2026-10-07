import assert from "node:assert/strict";
import test from "node:test";
import XLSX from "xlsx";

import { qurbaniAllYearsColumns, qurbaniAllYearsHeaders, qurbaniAllYearsRow, qurbaniExportColumns, qurbaniExportHeaders } from "../lib/qurbani-export-headers.ts";

test("each current-campaign Qurbani sheet keeps bilingual columns when empty", () => {
  assert.equal(Object.keys(qurbaniExportColumns).length, 8);
  for (const sheet of Object.keys(qurbaniExportColumns)) {
    const en = qurbaniExportHeaders(sheet, "en");
    const bn = qurbaniExportHeaders(sheet, "bn");
    assert.ok(en.length > 0, `${sheet} has no columns`);
    assert.equal(en.length, bn.length);
    assert.equal(new Set(en).size, en.length);
    assert.equal(new Set(bn).size, bn.length);
  }
  assert.deepEqual(qurbaniExportHeaders("Distribution", "en"), ["Recipient", "Type", "Weight kg", "Packages", "Collected", "Notes"]);
});

test("empty Qurbani worksheet retains its actual columns and no fake data row", () => {
  for (const locale of ["bn", "en"]) {
    const headers = qurbaniExportHeaders("Participants", locale);
    const worksheet = XLSX.utils.aoa_to_sheet([headers]);
    assert.deepEqual(XLSX.utils.sheet_to_json(worksheet, { header: 1 }), [headers]);
  }
});

test("all-years sheets have matching bilingual headers for empty and populated data", () => {
  assert.equal(Object.keys(qurbaniAllYearsColumns).length, 8);
  for (const sheet of ["All Years Summary", ...Object.keys(qurbaniAllYearsColumns)]) {
    const en = qurbaniAllYearsHeaders(sheet, "en");
    const bn = qurbaniAllYearsHeaders(sheet, "bn");
    assert.equal(en.length, bn.length);
    assert.equal(new Set(en).size, en.length);
    assert.equal(new Set(bn).size, bn.length);
    for (const headers of [bn, en]) {
      const worksheet = XLSX.utils.aoa_to_sheet([headers]);
      assert.deepEqual(XLSX.utils.sheet_to_json(worksheet, { header: 1 }), [headers]);
    }
  }
  for (const locale of ["bn", "en"]) {
    const row = qurbaniAllYearsRow("Participants", { id: "p-1", member_name: "QA Member", share_count: 2, internal_secret: "never-export" }, locale, { year: 2027, campaign: "QA Qurbani" });
    assert.deepEqual(Object.keys(row), qurbaniAllYearsHeaders("Participants", locale));
    assert.equal(row[locale === "bn" ? "শেয়ার" : "Shares"], 2);
    assert.equal(Object.values(row).includes("never-export"), false);
  }
});
