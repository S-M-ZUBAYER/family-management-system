import assert from "node:assert/strict";
import test from "node:test";

import { householdExportColumns, householdExportHeaders } from "../lib/household-export-headers.ts";

test("every Household export sheet has stable localized headers, including empty sheets", () => {
  assert.equal(Object.keys(householdExportColumns).length, 8);
  for (const sheet of Object.keys(householdExportColumns)) {
    const en = householdExportHeaders(sheet, "en");
    const bn = householdExportHeaders(sheet, "bn");
    assert.ok(en.length > 0, `${sheet} has no columns`);
    assert.equal(en.length, bn.length);
    assert.equal(new Set(en).size, en.length, `${sheet} has duplicate English columns`);
    assert.equal(new Set(bn).size, bn.length, `${sheet} has duplicate Bengali columns`);
  }
  assert.deepEqual(householdExportHeaders("Utility Bills", "en"), [
    "Household", "Bill", "Category", "Provider", "Account", "Month", "Amount", "Due", "Recurrence", "Status", "Method", "Reference",
  ]);
});
