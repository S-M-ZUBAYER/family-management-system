import assert from "node:assert/strict";
import test from "node:test";

import { welfareExportColumns, welfareExportHeaders } from "../lib/welfare-export-headers.ts";

test("every Welfare export sheet has stable bilingual headers even when empty", () => {
  assert.equal(Object.keys(welfareExportColumns).length, 6);
  for (const sheet of Object.keys(welfareExportColumns)) {
    const en = welfareExportHeaders(sheet, "en");
    const bn = welfareExportHeaders(sheet, "bn");
    assert.ok(en.length > 0, `${sheet} has no columns`);
    assert.equal(en.length, bn.length);
    assert.equal(new Set(en).size, en.length);
    assert.equal(new Set(bn).size, bn.length);
  }
  assert.deepEqual(welfareExportHeaders("Pledges", "en"), ["Member", "Fund", "Frequency", "Amount", "Start", "Next due", "Status", "Notes"]);
});
