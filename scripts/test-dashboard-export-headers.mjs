import assert from "node:assert/strict";
import test from "node:test";

import { dashboardExportColumns, dashboardExportHeaders } from "../lib/dashboard-export-headers.ts";

test("Dashboard export sheets have localized headers even without rows", () => {
  assert.equal(Object.keys(dashboardExportColumns).length, 4);
  for (const sheet of Object.keys(dashboardExportColumns)) {
    const bn = dashboardExportHeaders(sheet, "bn");
    const en = dashboardExportHeaders(sheet, "en");
    assert.ok(en.length > 0, `${sheet} has no columns`);
    assert.equal(bn.length, en.length);
    assert.equal(new Set(bn).size, bn.length);
    assert.equal(new Set(en).size, en.length);
  }
  assert.deepEqual(dashboardExportHeaders("Next Event", "en"), ["Event", "Starts at", "Venue", "City", "Going"]);
});
