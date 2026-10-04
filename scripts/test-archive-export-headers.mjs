import assert from "node:assert/strict";
import test from "node:test";

import { archiveExportColumns, archiveExportHeaders } from "../lib/archive-export-headers.ts";

test("Archive export sheets have stable localized headers including empty sections", () => {
  assert.equal(Object.keys(archiveExportColumns).length, 7);
  for (const sheet of Object.keys(archiveExportColumns)) {
    const bn = archiveExportHeaders(sheet, "bn");
    const en = archiveExportHeaders(sheet, "en");
    assert.ok(en.length > 0, `${sheet} has no columns`);
    assert.equal(bn.length, en.length);
    assert.equal(new Set(bn).size, bn.length);
    assert.equal(new Set(en).size, en.length);
  }
  assert.deepEqual(archiveExportHeaders("Time Capsules", "en"), ["Title", "Recipients", "Unlock", "Visibility", "Status", "Creator", "Message"]);
});
